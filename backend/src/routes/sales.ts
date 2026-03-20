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
        .select("unit_price, quantity");

      if (error) {
        console.error("Error fetching receipt lines:", error);
        return res.status(500).json({ error: "Failed to fetch receipt lines" });
      }

      const total = (lines ?? []).reduce((sum, line) => {
        const price = line.unit_price || 0;
        const qty = line.quantity || 0;
        return sum + (price * qty);
      }, 0);

      return res.json({ total });
    } catch (err) {
      console.error("Unexpected error in /total:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/receipts", async (_req, res) => {
    try {
      // Get all receipts with their lines
      const { data: receipts, error: receiptsError } = await ctx.supabase
        .from("receipts")
        .select("id, rec_no, number_plate, staff_name, created_at")
        .order("created_at", { ascending: false });

      if (receiptsError) {
        console.error("Error fetching receipts:", receiptsError);
        return res.status(500).json({ error: "Failed to fetch receipts" });
      }

      // Get all receipt lines
      const { data: lines, error: linesError } = await ctx.supabase
        .from("receipt_lines")
        .select("receipt_id, unit_price, quantity");

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
