import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

function normalizeDateOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

const InventoryCreateSchema = z.object({
  item_code: z.string().min(1),
  item_name: z.string().min(1),
  category: z.string().min(1),
  stock_quantity: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0),
  date_issued: z.string().optional()
});

const InventoryStockSchema = z.object({
  item_code: z.string().min(1),
  add_quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().min(0).optional()
});

const InventoryUpdateSchema = z.object({
  item_code: z.string().min(1),
  item_name: z.string().min(1),
  category: z.string().min(1),
  stock_quantity: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0),
  date_issued: z.string().optional()
});

const UseInventorySchema = z.object({
  job_id: z.string().min(1),
  number_plate: z.string().min(1),
  staff_name: z.string().optional(),
  service_description: z.string().optional(),
  item_code: z.string().min(1),
  quantity_used: z.coerce.number().int().positive()
});

export function inventoryRouter(ctx: Ctx) {
  const router = Router();

  router.get("/", requireAuth, async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    let query = ctx.supabase
      .from("inventory")
      .select(
        "id,item_code,item_name,category,stock_quantity,price,date_issued,last_updated"
      )
      .order("created_at", { ascending: false, nullsFirst: false });

    if (search) query = query.ilike("item_code", `%${search}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data ?? [] });
  });

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const body = InventoryCreateSchema.parse(req.body);
      const { data, error } = await ctx.supabase
        .from("inventory")
        .insert({
          ...body,
          date_issued: normalizeDateOrNull(body.date_issued),
          last_updated: new Date().toISOString()
        })
        .select(
          "id,item_code,item_name,category,stock_quantity,price,date_issued,last_updated"
        )
        .single();
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({ item: data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/stock", requireAuth, async (req, res, next) => {
    try {
      const body = InventoryStockSchema.parse(req.body);
      const { data, error } = await ctx.supabase.rpc("add_inventory_stock", {
        p_item_code: body.item_code,
        p_add_quantity: body.add_quantity,
        p_price: body.price ?? null
      });
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({ item: data });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", requireAuth, async (req, res, next) => {
    try {
      const body = InventoryUpdateSchema.partial().parse(req.body);
      const { id } = req.params;
      const patch: Record<string, unknown> = {
        ...body,
        last_updated: new Date().toISOString()
      };
      if ("date_issued" in body) patch.date_issued = normalizeDateOrNull(body.date_issued);
      const { data, error } = await ctx.supabase
        .from("inventory")
        .update(patch)
        .eq("id", id)
        .select(
          "id,item_code,item_name,category,stock_quantity,price,date_issued,last_updated"
        )
        .single();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ item: data });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { error } = await ctx.supabase.from("inventory").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  });

  router.post("/use", requireAuth, async (req, res, next) => {
    try {
      const body = UseInventorySchema.parse(req.body);
      const { data, error } = await ctx.supabase.rpc("use_inventory_item", {
        p_job_id: body.job_id,
        p_item_code: body.item_code,
        p_quantity_used: body.quantity_used,
        p_number_plate: body.number_plate,
        p_staff_name: body.staff_name ?? "",
        p_service_description: body.service_description ?? null
      });
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({ transaction: data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
