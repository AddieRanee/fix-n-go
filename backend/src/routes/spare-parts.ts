import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

const SparePartCreateSchema = z.object({
  item_code: z.string().optional(),
  item_name: z.string().optional(),
  category: z.string().optional(),
  company: z.string().optional(),
  stock_quantity: z.coerce.number().min(0),
  original_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  low_stock_threshold: z.coerce.number().int().min(0).optional(),
  payment_status: z.enum(["paid", "unpaid"]).optional(),
  date_issued: z.string().optional()
});

const SparePartStockSchema = z
  .object({
    id: z.string().uuid().optional(),
    item_code: z.string().optional(),
    add_quantity: z.coerce.number().positive(),
    original_price: z.coerce.number().min(0).optional(),
    selling_price: z.coerce.number().min(0).optional(),
    company: z.string().optional()
  })
  .refine((v) => Boolean(v.id) || Boolean(v.item_code?.trim()), {
    message: "id or item_code is required",
    path: ["id"]
  });

const SparePartUpdateSchema = z.object({
  item_code: z.string().optional(),
  item_name: z.string().optional(),
  category: z.string().optional(),
  company: z.string().optional(),
  stock_quantity: z.coerce.number().min(0),
  original_price: z.coerce.number().min(0).optional(),
  selling_price: z.coerce.number().min(0).optional(),
  low_stock_threshold: z.coerce.number().int().min(0).optional(),
  payment_status: z.enum(["paid", "unpaid"]).optional(),
  date_issued: z.string().optional()
});

const UseSparePartSchema = z.object({
  job_id: z.string().min(1),
  number_plate: z.string().min(1),
  staff_name: z.string().optional(),
  service_description: z.string().optional(),
  spare_part_id: z.string().uuid(),
  quantity_used: z.coerce.number().positive()
});

function normalizeTextOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function normalizeDateOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

export function sparePartsRouter(ctx: Ctx) {
  const router = Router();

  router.get("/", requireAuth, async (req, res) => {
    const itemName =
      typeof req.query.item_name === "string" ? req.query.item_name : "";
    const company =
      typeof req.query.company === "string" ? req.query.company : "";

    let query = ctx.supabase
      .from("spare_parts")
      .select(
        "id,item_code,item_name,category,company,stock_quantity,original_price,selling_price,low_stock_threshold,payment_status,date_issued,last_updated"
      )
      .order("created_at", { ascending: false, nullsFirst: false });

    if (itemName) query = query.ilike("item_name", `%${itemName}%`);
    if (company) query = query.ilike("company", `%${company}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data ?? [] });
  });

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const body = SparePartCreateSchema.parse(req.body);

      const { data, error } = await ctx.supabase
        .from("spare_parts")
        .insert({
          item_code: normalizeTextOrNull(body.item_code),
          item_name: normalizeTextOrNull(body.item_name),
          category: normalizeTextOrNull(body.category),
          company: normalizeTextOrNull(body.company),
          stock_quantity: body.stock_quantity,
          original_price: body.original_price,
          selling_price: body.selling_price,
          low_stock_threshold: body.low_stock_threshold ?? 5,
          payment_status: body.payment_status ?? "unpaid",
          date_issued: normalizeDateOrNull(body.date_issued),
          last_updated: new Date().toISOString()
        })
        .select(
          "id,item_code,item_name,category,company,stock_quantity,original_price,selling_price,low_stock_threshold,payment_status,date_issued,last_updated"
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
      const body = SparePartStockSchema.parse(req.body);
      const itemCode = normalizeTextOrNull(body.item_code);
      const { data, error } = body.id
        ? await ctx.supabase.rpc("add_spare_part_stock_by_id", {
            p_id: body.id,
            p_add_quantity: body.add_quantity,
            p_original_price: body.original_price ?? null,
            p_selling_price: body.selling_price ?? null,
            p_company: normalizeTextOrNull(body.company)
          })
        : await ctx.supabase.rpc("add_spare_part_stock", {
            p_item_code: itemCode,
            p_add_quantity: body.add_quantity,
            p_original_price: body.original_price ?? null,
            p_selling_price: body.selling_price ?? null,
            p_company: normalizeTextOrNull(body.company)
          });
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({ item: data });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", requireAuth, async (req, res, next) => {
    try {
      const body = SparePartUpdateSchema.partial().parse(req.body);
      const { id } = req.params;

      const patch: Record<string, unknown> = {
        ...body,
        last_updated: new Date().toISOString()
      };
      if ("item_code" in patch) patch.item_code = normalizeTextOrNull(patch.item_code);
      if ("item_name" in patch) patch.item_name = normalizeTextOrNull(patch.item_name);
      if ("category" in patch) patch.category = normalizeTextOrNull(patch.category);
      if ("company" in patch) patch.company = normalizeTextOrNull(patch.company);
      if ("date_issued" in patch) patch.date_issued = normalizeDateOrNull(patch.date_issued);

      const { data, error } = await ctx.supabase
        .from("spare_parts")
        .update(patch)
        .eq("id", id)
        .select(
          "id,item_code,item_name,category,company,stock_quantity,original_price,selling_price,low_stock_threshold,payment_status,date_issued,last_updated"
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
    const { error } = await ctx.supabase.from("spare_parts").delete().eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    res.status(204).send();
  });

  router.post("/use", requireAuth, async (req, res, next) => {
    try {
      const body = UseSparePartSchema.parse(req.body);
      const { data, error } = await ctx.supabase.rpc("use_spare_part_by_id", {
        p_job_id: body.job_id,
        p_spare_part_id: body.spare_part_id,
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
