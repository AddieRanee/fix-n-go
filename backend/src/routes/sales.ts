import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

type SaleRow = {
  id: string;
  item_code: string;
  item_name: string;
  price: number;
  quantity: number;
  total: number;
  customer_name?: string;
  sale_date: string;
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

export function salesRouter(ctx: Ctx) {
  const router = Router();

  router.use(requireAuth);

  router.get("/", async (_req, res) => {
    try {
      const [receiptsRes, linesRes] = await Promise.all([
        ctx.supabase
          .from("receipts")
          .select("id,number_plate,staff_name,created_at")
          .order("created_at", { ascending: false }),
        ctx.supabase
          .from("receipt_lines")
          .select(
            "id,receipt_id,line_type,inventory_item_code,spare_part_id,description,quantity,unit_price,created_at"
          )
          .order("created_at", { ascending: false })
      ]);

      if (receiptsRes.error) {
        return res.status(500).json({ error: receiptsRes.error.message });
      }
      if (linesRes.error) {
        return res.status(500).json({ error: linesRes.error.message });
      }

      const receipts = receiptsRes.data ?? [];
      const lines = linesRes.data ?? [];

      const receiptMap = new Map<
        string,
        { number_plate: string; staff_name: string; created_at: string }
      >();
      for (const receipt of receipts as any[]) {
        receiptMap.set(String(receipt.id), {
          number_plate: normalizeText(receipt.number_plate),
          staff_name: normalizeText(receipt.staff_name),
          created_at: String(receipt.created_at ?? new Date().toISOString())
        });
      }

      const sparePartIds = Array.from(
        new Set(
          (lines as any[])
            .filter((line) => line.line_type === "spare_part" && line.spare_part_id)
            .map((line) => String(line.spare_part_id).trim())
            .filter(Boolean)
        )
      );
      const inventoryCodes = Array.from(
        new Set(
          (lines as any[])
            .filter((line) => line.line_type === "inventory" && line.inventory_item_code)
            .map((line) => String(line.inventory_item_code).trim())
            .filter(Boolean)
        )
      );

      const sparePartMap = new Map<string, { item_code: string | null; item_name: string | null }>();
      const inventoryMap = new Map<string, { item_code: string | null; item_name: string | null }>();

      if (sparePartIds.length) {
        const { data: spRows, error: spErr } = await ctx.supabase
          .from("spare_parts")
          .select("id,item_code,item_name")
          .in("id", sparePartIds);
        if (spErr) return res.status(500).json({ error: spErr.message });
        for (const row of spRows ?? []) {
          sparePartMap.set(String((row as any).id), {
            item_code: (row as any).item_code ?? null,
            item_name: (row as any).item_name ?? null
          });
        }
      }

      if (inventoryCodes.length) {
        const { data: invRows, error: invErr } = await ctx.supabase
          .from("inventory")
          .select("item_code,item_name")
          .in("item_code", inventoryCodes);
        if (invErr) return res.status(500).json({ error: invErr.message });
        for (const row of invRows ?? []) {
          inventoryMap.set(normalizeText((row as any).item_code), {
            item_code: (row as any).item_code ?? null,
            item_name: (row as any).item_name ?? null
          });
        }
      }

      const sales: SaleRow[] = (lines as any[]).map((line) => {
        const receipt = receiptMap.get(String(line.receipt_id));
        const quantity = Number(line.quantity ?? 1);
        const price = Number(line.unit_price ?? 0);
        const lineDate = receipt?.created_at ?? String(line.created_at ?? new Date().toISOString());

        let itemCode = "";
        let itemName = "";

        if (line.line_type === "inventory") {
          const code = normalizeText(line.inventory_item_code);
          const resolved = code ? inventoryMap.get(code) : null;
          itemCode = resolved?.item_code ?? code;
          itemName = resolved?.item_name ?? normalizeText(line.description) ?? code;
        } else if (line.line_type === "spare_part") {
          const resolved = line.spare_part_id ? sparePartMap.get(String(line.spare_part_id)) : null;
          itemCode = resolved?.item_code ?? normalizeText(line.description);
          itemName = resolved?.item_name ?? normalizeText(line.description);
        } else {
          itemCode = normalizeText(line.description);
          itemName = normalizeText(line.description);
        }

        return {
          id: String(line.id),
          item_code: itemCode || "Blank",
          item_name: itemName || "Blank",
          price,
          quantity,
          total: price * quantity,
          customer_name: receipt?.number_plate || receipt?.staff_name || "Walk-in",
          sale_date: lineDate
        };
      });

      sales.sort((a, b) => b.sale_date.localeCompare(a.sale_date));
      return res.json({ sales });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Unexpected error in /sales:", err);
      return res.status(500).json({ error: message });
    }
  });

  router.get("/total", async (_req, res) => {
    try {
      const { data: lines, error } = await ctx.supabase
        .from("receipt_lines")
        .select("unit_price, quantity, line_type, inventory_item_code, spare_part_id");

      if (error) {
        console.error("Error fetching receipt lines:", error);
        return res.status(500).json({ error: "Failed to fetch receipt lines" });
      }

      let total = 0;
      let totalCost = 0;

      for (const line of lines ?? []) {
        const price = line.unit_price || 0;
        const qty = line.quantity || 0;
        const lineRevenue = price * qty;
        total += lineRevenue;

        if (line.line_type === "inventory" && line.inventory_item_code) {
          const { data: inv } = await ctx.supabase
            .from("inventory")
            .select("original_price")
            .eq("item_code", line.inventory_item_code)
            .single();
          const costPerUnit = inv?.original_price || 0;
          totalCost += costPerUnit * qty;
        } else if (line.line_type === "spare_part" && line.spare_part_id) {
          const { data: sp } = await ctx.supabase
            .from("spare_parts")
            .select("original_price")
            .eq("id", line.spare_part_id)
            .single();
          const costPerUnit = sp?.original_price || 0;
          totalCost += costPerUnit * qty;
        }
      }

      return res.json({ totalRevenue: total, totalCost, grossProfit: total - totalCost });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Unexpected error in /total:", err);
      return res.status(500).json({ error: message });
    }
  });

  router.get("/receipts", async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : null;
    try {
      let receiptsQuery = ctx.supabase
        .from("receipts")
        .select("id, rec_no, number_plate, staff_name, payment_status, created_at")
        .order("created_at", { ascending: false });

      if (month) {
        const yearMonth = month.match(/^(\d{4})-(\d{2})$/);
        if (yearMonth) {
          receiptsQuery = receiptsQuery.gte("created_at", `${yearMonth[1]}-${yearMonth[2]}-01`);
          receiptsQuery = receiptsQuery.lt(
            "created_at",
            `${yearMonth[1]}-${String(Number(yearMonth[2]) + 1).padStart(2, "0")}-01`
          );
        }
      }

      const { data: receipts, error: receiptsError } = await receiptsQuery;
      if (receiptsError) {
        console.error("Error fetching receipts:", receiptsError);
        return res.status(500).json({ error: "Failed to fetch receipts" });
      }

      let linesQuery = ctx.supabase.from("receipt_lines").select("receipt_id, unit_price, quantity");
      if (month) {
        const yearMonth = month.match(/^(\d{4})-(\d{2})$/);
        if (yearMonth) {
          linesQuery = linesQuery.gte("created_at", `${yearMonth[1]}-${yearMonth[2]}-01`);
          linesQuery = linesQuery.lt(
            "created_at",
            `${yearMonth[1]}-${String(Number(yearMonth[2]) + 1).padStart(2, "0")}-01`
          );
        }
      }

      const { data: lines, error: linesError } = await linesQuery;
      if (linesError) {
        console.error("Error fetching receipt lines:", linesError);
        return res.status(500).json({ error: "Failed to fetch receipt lines" });
      }

      const linesByReceipt = new Map<string, any[]>();
      (lines ?? []).forEach((line) => {
        if (!linesByReceipt.has(line.receipt_id)) {
          linesByReceipt.set(line.receipt_id, []);
        }
        linesByReceipt.get(line.receipt_id)!.push(line);
      });

      const receiptsWithTotals = (receipts ?? []).map((receipt) => {
        const receiptLines = linesByReceipt.get(receipt.id) || [];
        const total = receiptLines.reduce((sum, line) => {
          const price = line.unit_price || 0;
          const qty = line.quantity || 0;
          return sum + price * qty;
        }, 0);

        return {
          id: receipt.id,
          rec_no: receipt.rec_no,
          number_plate: receipt.number_plate,
          staff_name: receipt.staff_name,
          payment_status: receipt.payment_status || "paid",
          created_at: receipt.created_at,
          total
        };
      });

      return res.json({ receipts: receiptsWithTotals });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Unexpected error in /receipts:", err);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
