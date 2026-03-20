import express from "express";
import cors from "cors";
import morgan from "morgan";
import { ZodError } from "zod";
import type { Env } from "./config/env.js";
import { authenticateSupabase } from "./middleware/auth.js";
import { createSupabaseAdminClient } from "./services/supabase.js";
import { authRouter } from "./routes/auth.js";
import { inventoryRouter } from "./routes/inventory.js";
import { reportsRouter } from "./routes/reports.js";
import { sparePartsRouter } from "./routes/spare-parts.js";
import { receiptsRouter } from "./routes/receipts.js";
import { salesRouter } from "./routes/sales.js";
import { notesRouter } from "./routes/notes.js";

export function createApp(env: Env) {
  const app = express();

  app.disable("x-powered-by");
  const corsOrigin =
    env.CORS_ORIGIN.trim() === "*"
      ? true
      : env.CORS_ORIGIN.split(",").map((s) => s.trim());
  app.use(cors({ origin: corsOrigin, credentials: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  const supabase = createSupabaseAdminClient(env);
  app.use(authenticateSupabase(supabase));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/version", (_req, res) =>
    res.json({
      name: "fix-n-go-backend",
      sparePartsApi: true,
      receiptsApi: true
    })
  );
  app.use("/api/auth", authRouter({ env, supabase }));
  app.use("/api/inventory", inventoryRouter({ supabase }));
  app.use("/api/spare-parts", sparePartsRouter({ supabase }));
  app.use("/api/receipts", receiptsRouter({ supabase }));
  app.use("/api/reports", reportsRouter({ supabase }));
  app.use("/api/sales", salesRouter({ supabase }));
  app.use("/api/notes", notesRouter({ supabase }));

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Invalid input. Please check the form and try again.",
          issues: err.issues
        });
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  );

  return app;
}
