import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

const NoteSchema = z.object({
  content: z.string().max(2000)
});

export function notesRouter(ctx: Ctx) {
  const router = Router();

  router.get("/today", requireAuth, async (_req, res) => {
    const { data, error } = await ctx.supabase
      .from("daily_notes")
      .select("id,note_date,content,updated_by_name,updated_at")
      .eq("note_date", new Date().toISOString().slice(0, 10))
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ note: data ?? null });
  });

  router.put("/today", requireAuth, async (req, res, next) => {
    try {
      const body = NoteSchema.parse(req.body);
      const noteDate = new Date().toISOString().slice(0, 10);
      const updatedByName =
        req.user?.firstName?.trim() || req.user?.email || "Unknown";

      const { data, error } = await ctx.supabase
        .from("daily_notes")
        .upsert(
          {
            note_date: noteDate,
            content: body.content,
            updated_by_id: req.user?.id ?? null,
            updated_by_name: updatedByName,
            updated_at: new Date().toISOString()
          },
          { onConflict: "note_date" }
        )
        .select("id,note_date,content,updated_by_name,updated_at")
        .single();

      if (error) return res.status(400).json({ error: error.message });
      res.json({ note: data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
