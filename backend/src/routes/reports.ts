import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";

type Ctx = { supabase: SupabaseClient };

const DailySchema = z.object({
  date: z.string().min(1)
});

export function reportsRouter(ctx: Ctx) {
  const router = Router();

  router.get("/daily-usage", requireAuth, async (req, res) => {
    const parsed = DailySchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    const { data, error } = await ctx.supabase.rpc("report_daily_usage", {
      p_date: parsed.data.date
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ rows: data ?? [] });
  });

  router.get("/most-used", requireAuth, async (req, res) => {
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    const { data, error } = await ctx.supabase.rpc("report_most_used", {
      p_limit: Number.isFinite(limit) ? limit : 10
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ rows: data ?? [] });
  });

  return router;
}
