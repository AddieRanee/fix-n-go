import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/auth.js";

type Ctx = { supabase: SupabaseClient };

export function salesRouter(ctx: Ctx) {
  const router = Router();

  router.use(requireAuth);

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

        // Calculate cost for inventory/spare_parts using original_price
        if (line.line_type === 'inventory' && line.inventory_item_code) {
          const { data: inv } = await ctx.supabase
            .from('inventory')
            .select('original_price')
            .eq('item_code', line.inventory_item_code)
            .single();
          const costPerUnit = inv?.original_price || 0;
          totalCost += costPerUnit * qty;
        } else if (line.line_type === 'spare_part' && line.spare_part_id) {
          const { data: sp } = await ctx.supabase
            .from('spare_parts')
            .select('original_price')
            .eq('id', line.spare_part_id)
            .single();
          const costPerUnit = sp?.original_price || 0;
          totalCost += costPerUnit * qty;
        }
      }

      return res.json({ totalRevenue: total, totalCost, grossProfit: total - totalCost });
    } catch (err) {
      console.error("Unexpected error in /total:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/receipts", async (req, res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : null;
    try {
      // Get all receipts with their lines
      let receiptsQuery = ctx.supabase
        .from("receipts")
        .select("id, rec_no, number_plate, staff_name, payment_status, created_at")
        .order("created_at", { ascending: false });
      
      if (month) {
        const yearMonth = month.match(/^(\d{4})-(\d{2})$/);
        if (yearMonth) {
          receiptsQuery = receiptsQuery.gte('created_at', `${yearMonth[1]}-${yearMonth[2]}-01`);
          receiptsQuery = receiptsQuery.lt('created_at', `${yearMonth[1]}-${String(Number(yearMonth[2]) + 1).padStart(2, '0')}-01`);
        }
      }
      
      const { data: receipts, error: receiptsError } = await receiptsQuery;

      if (receiptsError) {
        console.error("Error fetching receipts:", receiptsError);
        return res.status(500).json({ error: "Failed to fetch receipts" });
      }

      // Get all receipt lines
      let linesQuery = ctx.supabase
        .from("receipt_lines")
        .select("receipt_id, unit_price, quantity");
      
      if (month) {
        const yearMonth = month.match(/^(\d{4})-(\d{2})$/);
        if (yearMonth) {
          linesQuery = linesQuery.gte('created_at', `${yearMonth[1]}-${yearMonth[2]}-01`);
          linesQuery = linesQuery.lt('created_at', `${yearMonth[1]}-${String(Number(yearMonth[2]) + 1).padStart(2, '0')}-01`);
        }
      }
      
      const { data: lines, error: linesError } = await linesQuery;

      if (linesError) {
        console.error("Error fetching receipt lines:", linesError);
        return res.status(500).json({ error: "Failed to fetch receipt lines" });
      }

      // Group lines by receipt_id and calculate totals
      const linesByReceipt = new Map<string, any[]>();
      (lines ?? []).forEach(line => {
        if (!linesByReceipt.has(line.receipt_id)) {
          linesByReceipt.set(line.receipt_id, []);
        }
        linesByReceipt.get(line.receipt_id)!.push(line);
      });

      // Calculate total for each receipt
      const receiptsWithTotals = (receipts ?? []).map(receipt => {
        const receiptLines = linesByReceipt.get(receipt.id) || [];
        const total = receiptLines.reduce((sum, line) => {
          const price = line.unit_price || 0;
          const qty = line.quantity || 0;
          return sum + (price * qty);
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
      console.error("Unexpected error in /receipts:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
