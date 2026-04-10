import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv } from "../backend/dist/config/env.js";
import { createApp } from "../backend/dist/app.js";

let app: ReturnType<typeof createApp>;

try {
  const env = loadEnv(process.env);
  app = createApp(env);
} catch (err) {
  const message = err instanceof Error ? err.message : "Unknown startup error";
  // Log the startup failure so Vercel function logs show the real cause.
  console.error("API startup failed:", message);
  app = ((req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: message }));
  }) as ReturnType<typeof createApp>;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
