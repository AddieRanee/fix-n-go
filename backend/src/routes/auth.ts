import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { env: Env; supabase: SupabaseClient };

export function authRouter(ctx: Ctx) {
  void ctx;
  const router = Router();

  router.get("/registration-status", async (_req, res) => {
    const limit = 3;
    const { data, error } = await ctx.supabase.auth.admin.listUsers({
      perPage: 1000
    });
    if (error) return res.status(500).json({ error: error.message });
    const count = data.users.length;
    res.json({ limit, count, open: count < limit });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
