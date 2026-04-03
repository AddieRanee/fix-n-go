import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

const ReceiptLineSchema = z.object({
  type: z.enum(["inventory", "spare_part", "service", "custom"]),
  item_code: z.string().optional(), // inventory
  spare_part_id: z.string().uuid().optional(), // spare parts
  description: z.string().optional(), // service/custom
  qty: z.coerce.number().positive().optional(),
  unit_price: z.coerce.number().min(0).optional()
});

const CreateReceiptSchema = z.object({
  number_plate: z.string().min(1),
  staff_name: z.string().optional(),
  payment_status: z.enum(["paid", "unpaid", "other"]).optional(),
  payment_note: z.string().optional(),
  lines: z.array(ReceiptLineSchema).min(1)
});

const ReceiptLineUpdateSchema = ReceiptLineSchema.extend({
  id: z.string().uuid().optional()
});

const UpdateReceiptSchema = z.object({
  number_plate: z.string().min(1),
  staff_name: z.string().optional(),
  payment_status: z.enum(["paid", "unpaid", "other"]).optional(),
  payment_note: z.string().optional(),
  lines: z.array(ReceiptLineUpdateSchema).min(1)
});

type ReceiptLineInput = z.infer<typeof ReceiptLineSchema>;

function normalizeReceiptItemKey(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function assertNoDuplicateBillItems(lines: ReceiptLineInput[]) {
  const seen = new Set<string>();

  for (const line of lines) {
    let key = "";
    if (line.type === "inventory") {
      key = `inventory:${normalizeReceiptItemKey(line.item_code)}`;
    } else if (line.type === "spare_part") {
      key = `spare_part:${normalizeReceiptItemKey(line.spare_part_id || line.description)}`;
    }

    if (!key) continue;
    if (seen.has(key)) {
      throw new Error("Duplicate inventory or spare part items are not allowed in the same receipt.");
    }
    seen.add(key);
  }
}

export function receiptsRouter(ctx: Ctx) {
  const router = Router();

  router.get("/next-rec-no", requireAuth, async (req, res) => {
    try {
      // Get the highest rec_no from receipts
      const { data, error } = await ctx.supabase
        .from("receipts")
        .select("rec_no")
        .order("rec_no", { ascending: false })
        .limit(1);

      if (error) return res.status(500).json({ error: error.message });

      // If no receipts exist, start from 1000, otherwise add 1 to the highest
      const nextRecNo = (data && data.length > 0) ? (data[0].rec_no as number) + 1 : 1000;

      res.json({ nextRecNo });
    } catch (err: any) {
      console.error("Error fetching next rec_no:", err);
      return res.status(500).json({ error: err?.message || "Failed to fetch next rec_no" });
    }
  });

  router.get("/", requireAuth, async (req, res) => {
    const recNo = typeof req.query.rec_no === "string" ? req.query.rec_no : "";
    const numberPlate =
      typeof req.query.number_plate === "string" ? req.query.number_plate : "";

    let q = ctx.supabase
      .from("receipts")
      .select("id,rec_no,number_plate,staff_name,payment_status,payment_note,created_at")
      .order("created_at", { ascending: false });

    if (recNo) {
      const recNoNum = Number(recNo);
      if (!isNaN(recNoNum)) q = q.eq("rec_no", recNoNum);
    }
    if (numberPlate) q = q.ilike("number_plate", `%${numberPlate}%`);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ receipts: data ?? [] });
  });

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const body = CreateReceiptSchema.parse(req.body);
      assertNoDuplicateBillItems(body.lines);
      const receiptInsert = await ctx.supabase
        .from("receipts")
        .insert({
          number_plate: body.number_plate.trim(),
          staff_name: body.staff_name ?? "",
          payment_status: (body.payment_status as string) ?? 'paid',
          payment_note: (body.payment_note ?? "").trim() || null,
          created_by_id: req.user?.id ?? null
        })
        .select("id")
        .single();

      if (receiptInsert.error) {
        return res.status(400).json({ error: receiptInsert.error.message });
      }

      const receiptId = receiptInsert.data.id as string;
      const inventoryUpdates: { item_code: string; stock_quantity: number }[] = [];
      const sparePartUpdates: { id: string; stock_quantity: number }[] = [];

      try {
        for (const line of body.lines) {
          if (line.type === "inventory") {
            const itemCode = (line.item_code ?? "").trim();
            if (!itemCode) throw new Error("inventory item_code is required");

            const qty = line.qty ?? 1;
            const invRes = await ctx.supabase
              .from("inventory")
              .select("item_code,item_name,stock_quantity,price")
              .eq("item_code", itemCode)
              .single();
            if (invRes.error) throw invRes.error;
            if (!invRes.data) throw new Error(`item_code not found: ${itemCode}`);
            if (invRes.data.stock_quantity < qty) {
              throw new Error(
                `insufficient stock: ${itemCode} (have ${invRes.data.stock_quantity}, need ${qty})`
              );
            }

            const nextQty = invRes.data.stock_quantity - qty;
            const { error: updErr } = await ctx.supabase
              .from("inventory")
              .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
              .eq("item_code", itemCode);
            if (updErr) throw updErr;
            inventoryUpdates.push({ item_code: itemCode, stock_quantity: invRes.data.stock_quantity });

            const { error: lineErr } = await ctx.supabase.from("receipt_lines").insert({
              receipt_id: receiptId,
              line_type: "inventory",
              inventory_item_code: itemCode,
              description: invRes.data.item_name,
              quantity: qty,
              unit_price: invRes.data.price ?? null
            });
            if (lineErr) throw lineErr;
          } else if (line.type === "spare_part") {
            const sparePartId = line.spare_part_id ?? "";
            const qty = line.qty ?? 1;
            const linePayload: Record<string, unknown> = {
              receipt_id: receiptId,
              line_type: "spare_part",
              spare_part_id: sparePartId || null,
              description: sparePartId ? null : (line.description ?? "").trim() || "Blank",
              quantity: qty,
              unit_price: line.unit_price ?? null
            };

            if (sparePartId) {
              const spRes = await ctx.supabase
                .from("spare_parts")
                .select("id,item_code,item_name,stock_quantity,price")
                .eq("id", sparePartId)
                .single();
              if (spRes.error) throw spRes.error;
              if (!spRes.data) throw new Error(`spare_part id not found: ${sparePartId}`);
              if (spRes.data.stock_quantity < qty) {
                throw new Error(
                  `insufficient stock: ${spRes.data.item_code ?? spRes.data.id} (have ${spRes.data.stock_quantity}, need ${qty})`
                );
              }

              const nextQty = spRes.data.stock_quantity - qty;
              const { error: updErr } = await ctx.supabase
                .from("spare_parts")
                .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
                .eq("id", sparePartId);
              if (updErr) throw updErr;
              sparePartUpdates.push({ id: sparePartId, stock_quantity: spRes.data.stock_quantity });
              linePayload.description = spRes.data.item_name ?? spRes.data.item_code ?? "Blank";
              linePayload.unit_price = line.unit_price ?? spRes.data.price ?? null;
            }

            const { error: lineErr } = await ctx.supabase.from("receipt_lines").insert(linePayload);
            if (lineErr) throw lineErr;
          } else if (line.type === "service" || line.type === "custom") {
            const { error: lineErr } = await ctx.supabase.from("receipt_lines").insert({
              receipt_id: receiptId,
              line_type: line.type,
              description: (line.description ?? "").trim() || "Blank",
              quantity: line.qty ?? 1,
              unit_price: line.unit_price ?? null
            });
            if (lineErr) throw lineErr;
          } else {
            throw new Error(`invalid line type: ${line.type}`);
          }
        }

        res.status(201).json({ id: receiptId, lineCount: body.lines.length });
      } catch (createErr: any) {
        for (const u of inventoryUpdates.reverse()) {
          await ctx.supabase
            .from("inventory")
            .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
            .eq("item_code", u.item_code);
        }
        for (const u of sparePartUpdates.reverse()) {
          await ctx.supabase
            .from("spare_parts")
            .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
            .eq("id", u.id);
        }
        await ctx.supabase.from("receipts").delete().eq("id", receiptId);
        return res.status(400).json({ error: createErr?.message || "Failed to create receipt" });
      }
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const { data: receipt, error: rErr } = await ctx.supabase
        .from("receipts")
        .select("id,rec_no,number_plate,staff_name,payment_status,payment_note,created_at")
        .eq("id", id)
        .single();
      if (rErr) return res.status(404).json({ error: "Not found" });

      const { data: lines, error: lErr } = await ctx.supabase
        .from("receipt_lines")
        .select(
          "id,line_type,inventory_item_code,spare_part_id,description,quantity,unit_price,created_at"
        )
        .eq("receipt_id", id)
        .order("created_at", { ascending: true });
      if (lErr) return res.status(500).json({ error: lErr.message });

      const sparePartIds = (lines ?? [])
        .filter((l: any) => l.line_type === "spare_part" && l.spare_part_id)
        .map((l: any) => l.spare_part_id as string);
      const inventoryCodes = (lines ?? [])
        .filter((l: any) => l.line_type === "inventory" && l.inventory_item_code)
        .map((l: any) => String(l.inventory_item_code).trim())
        .filter((code: string) => code.length > 0);

      const sparePartMap = new Map<
        string,
        { item_code: string | null; item_name: string | null }
      >();
      const inventoryMap = new Map<
        string,
        { item_code: string | null; item_name: string | null }
      >();

      if (sparePartIds.length) {
        const { data: spRows, error: spErr } = await ctx.supabase
          .from("spare_parts")
          .select("id,item_code,item_name")
          .in("id", Array.from(new Set(sparePartIds)));
        if (spErr) return res.status(500).json({ error: spErr.message });
        for (const r of spRows ?? []) {
          sparePartMap.set(r.id as string, {
            item_code: (r as any).item_code ?? null,
            item_name: (r as any).item_name ?? null
          });
        }
      }

      if (inventoryCodes.length) {
        const { data: invRows, error: invErr } = await ctx.supabase
          .from("inventory")
          .select("item_code,item_name")
          .in("item_code", Array.from(new Set(inventoryCodes)));
        if (invErr) return res.status(500).json({ error: invErr.message });
        for (const r of invRows ?? []) {
          inventoryMap.set(String((r as any).item_code ?? "").trim(), {
            item_code: (r as any).item_code ?? null,
            item_name: (r as any).item_name ?? null
          });
        }
      }

      const safeLines = (lines ?? []).map((l: any) => {
        const qty = typeof l.quantity === "number" ? l.quantity : null;
        const unit =
          typeof l.unit_price === "number" ? Number(l.unit_price) : null;
        const total = (qty ?? 1) * (unit ?? 0);

        const resolved =
          l.line_type === "spare_part" && l.spare_part_id
            ? sparePartMap.get(l.spare_part_id as string) ?? null
            : null;

        const inventoryResolved =
          l.line_type === "inventory" && l.inventory_item_code
            ? inventoryMap.get(String(l.inventory_item_code).trim()) ?? null
            : null;

        const item_name_print =
          l.line_type === "inventory"
            ? (inventoryResolved?.item_name ??
                l.description ??
                l.inventory_item_code ??
                null)
            : l.line_type === "spare_part"
              ? (resolved?.item_name ?? l.description ?? null)
              : (l.description ?? null);

        const item_id_print =
          l.line_type === "inventory"
            ? (typeof l.inventory_item_code === "string" && l.inventory_item_code.trim()
                ? l.inventory_item_code.trim()
                : null)
            : l.line_type === "spare_part"
              ? (typeof resolved?.item_code === "string" && resolved.item_code.trim()
                  ? resolved.item_code.trim()
                  : null)
              : null;

        return { ...l, line_total: total, item_name_print, item_id_print };
      });

      const total = safeLines.reduce((sum, l) => sum + (l.line_total ?? 0), 0);
      res.json({ receipt, lines: safeLines, total });
    } catch (err: any) {
      console.error("Error fetching receipt:", err);
      return res.status(500).json({ error: err?.message || "Failed to fetch receipt" });
    }
  });

  router.put("/:id", requireAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const body = UpdateReceiptSchema.parse(req.body);
      assertNoDuplicateBillItems(body.lines);

      // Load existing lines to prevent changing inventory/spare-part quantities (stock already deducted).
      const { data: existingLines, error: eErr } = await ctx.supabase
        .from("receipt_lines")
        .select("line_type,inventory_item_code,spare_part_id,quantity")
        .eq("receipt_id", id);
      if (eErr) return res.status(400).json({ error: eErr.message });

      const existingLocked = (existingLines ?? []).filter(
        (l: any) => l.line_type === "inventory" || l.line_type === "spare_part"
      );

      const nextLocked = body.lines
        .filter((l) => l.type === "inventory" || l.type === "spare_part")
        .map((l) => ({
          line_type: l.type,
          inventory_item_code: l.type === "inventory" ? (l.item_code ?? "").trim() : null,
          spare_part_id: l.type === "spare_part" ? l.spare_part_id ?? null : null,
          quantity: l.qty ?? 1
        }));

      const sig = (l: any) =>
        [
          l.line_type,
          l.inventory_item_code ?? "",
          l.spare_part_id ?? "",
          String(l.quantity ?? 1)
        ].join("|");

      const a = existingLocked.map(sig).sort();
      const b = nextLocked.map(sig).sort();
      if (a.join(",") !== b.join(",")) {
        return res.status(400).json({
          error:
            "You can only edit receipt details and service/custom lines. Inventory/Spare Parts items and quantities cannot be changed."
        });
      }

      const { error: uErr } = await ctx.supabase
        .from("receipts")
        .update({
          number_plate: body.number_plate,
          staff_name: body.staff_name ?? "",
          payment_status: (body.payment_status as string) ?? 'paid',
          payment_note: (body.payment_note ?? "").trim() || null
        })
        .eq("id", id);
      if (uErr) return res.status(400).json({ error: uErr.message });

      // Replace lines (safe because locked lines are unchanged, and we do not adjust stock here).
      const { error: dErr } = await ctx.supabase
        .from("receipt_lines")
        .delete()
        .eq("receipt_id", id);
      if (dErr) return res.status(400).json({ error: dErr.message });

      const inserts = body.lines.map((l) => ({
        receipt_id: id,
        line_type: l.type,
        inventory_item_code: l.type === "inventory" ? (l.item_code ?? "").trim() : null,
        spare_part_id: l.type === "spare_part" ? l.spare_part_id ?? null : null,
        description:
          l.type === "service" || l.type === "custom" || l.type === "spare_part"
            ? (l.description ?? "").trim() || null
            : null,
        quantity: l.qty ?? 1,
        unit_price: l.unit_price ?? null
      }));

      const { error: iErr } = await ctx.supabase.from("receipt_lines").insert(inserts);
      if (iErr) return res.status(400).json({ error: iErr.message });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

router.delete("/bulk", requireAuth, async (req, res) => {
  const { ids, keep_stock } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  
  try {
    let restoredCount = 0;
    
    if (!keep_stock) {
      for (const receiptId of ids) {
        const { data: lines, error: linesErr } = await ctx.supabase
          .from("receipt_lines")
          .select("line_type,inventory_item_code,spare_part_id,quantity")
          .eq("receipt_id", receiptId);
        if (linesErr) continue;

        for (const line of lines ?? []) {
          const qty = Number((line as any).quantity ?? 1);
          if ((line as any).line_type === "inventory" && (line as any).inventory_item_code) {
            const itemCode = String((line as any).inventory_item_code).trim();
            if (!itemCode) continue;

            const { data: inv, error: invErr } = await ctx.supabase
              .from("inventory")
              .select("stock_quantity")
              .eq("item_code", itemCode)
              .single();
            if (invErr) continue;

            const nextQty = Number(inv?.stock_quantity ?? 0) + qty;
            await ctx.supabase
              .from("inventory")
              .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
              .eq("item_code", itemCode);
            restoredCount++;
          }

          if ((line as any).line_type === "spare_part" && (line as any).spare_part_id) {
            const sparePartId = String((line as any).spare_part_id).trim();
            if (!sparePartId) continue;

            const { data: sp, error: spErr } = await ctx.supabase
              .from("spare_parts")
              .select("stock_quantity")
              .eq("id", sparePartId)
              .single();
            if (spErr) continue;

            const nextQty = Number(sp?.stock_quantity ?? 0) + qty;
            await ctx.supabase
              .from("spare_parts")
              .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
              .eq("id", sparePartId);
            restoredCount++;
          }
        }
      }
    }

    const { error: delErr } = await ctx.supabase
      .from("receipts")
      .delete()
      .in("id", ids);

    if (delErr) return res.status(400).json({ error: delErr.message });

    res.json({ deleted: ids.length, stockRestored: keep_stock ? 0 : restoredCount });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to bulk delete receipts" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const keep_stock = req.query.keep_stock === 'true';
  
  if (keep_stock) {
    const { error: delErr } = await ctx.supabase
      .from("receipts")
      .delete()
      .eq("id", id);
    if (delErr) return res.status(400).json({ error: delErr.message });
    return res.status(204).send();
  }
  
  try {
    const { data: lines, error: linesErr } = await ctx.supabase
      .from("receipt_lines")
      .select("line_type,inventory_item_code,spare_part_id,quantity")
      .eq("receipt_id", id);
    if (linesErr) return res.status(400).json({ error: linesErr.message });

    for (const line of lines ?? []) {
      const qty = Number((line as any).quantity ?? 1);
      if ((line as any).line_type === "inventory" && (line as any).inventory_item_code) {
        const itemCode = String((line as any).inventory_item_code).trim();
        if (!itemCode) continue;

        const { data: inv, error: invErr } = await ctx.supabase
          .from("inventory")
          .select("stock_quantity")
          .eq("item_code", itemCode)
          .single();
        if (invErr) return res.status(400).json({ error: invErr.message });

        const nextQty = Number(inv?.stock_quantity ?? 0) + qty;
        const { error: updErr } = await ctx.supabase
          .from("inventory")
          .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
          .eq("item_code", itemCode);
        if (updErr) return res.status(400).json({ error: updErr.message });
      }

      if ((line as any).line_type === "spare_part" && (line as any).spare_part_id) {
        const sparePartId = String((line as any).spare_part_id).trim();
        if (!sparePartId) continue;

        const { data: sp, error: spErr } = await ctx.supabase
          .from("spare_parts")
          .select("stock_quantity")
          .eq("id", sparePartId)
          .single();
        if (spErr) return res.status(400).json({ error: spErr.message });

        const nextQty = Number(sp?.stock_quantity ?? 0) + qty;
        const { error: updErr } = await ctx.supabase
          .from("spare_parts")
          .update({ stock_quantity: nextQty, last_updated: new Date().toISOString() })
          .eq("id", sparePartId);
        if (updErr) return res.status(400).json({ error: updErr.message });
      }
    }

    const { error: delLinesErr } = await ctx.supabase.from("receipt_lines").delete().eq("receipt_id", id);
    if (delLinesErr) return res.status(400).json({ error: delLinesErr.message });

    const { error: delErr } = await ctx.supabase.from("receipts").delete().eq("id", id);
    if (delErr) return res.status(400).json({ error: delErr.message });

    res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to delete receipt" });
  }
});

  return router;
}
