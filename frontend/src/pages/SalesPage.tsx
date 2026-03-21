import React, { useEffect, useState } from "react";
import { formatMYR } from "../lib/money";
import { requireSupabase } from "../lib/supabase";

interface Receipt {
  id: string;
  rec_no: number;
  number_plate: string;
  staff_name: string;
  payment_status: "paid" | "unpaid" | "other";
  created_at: string;
  total: number;
}

export function SalesPage() {
  const [totalSales, setTotalSales] = useState<number>(0);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSalesData();
  }, []);

  async function loadSalesData() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [linesRes, receiptsRes] = await Promise.all([
        supabase.from("receipt_lines").select("unit_price, quantity, receipt_id"),
        supabase
          .from("receipts")
          .select("id,rec_no,number_plate,staff_name,payment_status,created_at")
          .order("created_at", { ascending: false })
      ]);
      if (linesRes.error) throw linesRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      const lines = linesRes.data ?? [];
      const total = lines.reduce((sum, line: any) => {
        const price = line.unit_price || 0;
        const qty = line.quantity || 0;
        return sum + price * qty;
      }, 0);
      setTotalSales(Number(total || 0));

      const linesByReceipt = new Map<string, any[]>();
      lines.forEach((line: any) => {
        if (!linesByReceipt.has(line.receipt_id)) {
          linesByReceipt.set(line.receipt_id, []);
        }
        linesByReceipt.get(line.receipt_id)!.push(line);
      });

      const receiptsWithTotals = (receiptsRes.data ?? []).map((receipt: any) => {
        const receiptLines = linesByReceipt.get(receipt.id) || [];
        const rTotal = receiptLines.reduce((sum, line: any) => {
          const price = line.unit_price || 0;
          const qty = line.quantity || 0;
          return sum + price * qty;
        }, 0);
        return { ...receipt, total: rTotal, payment_status: receipt.payment_status ?? "paid" };
      });
      setReceipts(receiptsWithTotals);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load sales data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div className="cardHeader">
          <div className="row">
            <h1 className="title">Total Sales</h1>
            <span className="muted">Garage revenue summary</span>
          </div>
          {error ? (
            <div
              className="muted"
              style={{ color: "rgba(255,88,118,0.92)", marginTop: 10 }}
            >
              {error}
            </div>
          ) : null}
        </div>
        <div className="cardBody">
          {loading ? (
            <div className="muted">Loading...</div>
          ) : (
            <>
              <div style={{ textAlign: "center", padding: 40, borderBottom: "1px solid #333", marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 700, color: "#64d4ff" }}>
                  {formatMYR(totalSales)}
                </div>
                <div className="muted" style={{ marginTop: 10 }}>
                  Total Revenue from All Cash Bills
                </div>
              </div>

              <h2 style={{ marginBottom: 20 }}>Receipt Breakdown</h2>
              {receipts.length === 0 ? (
                <div className="muted">No receipts found</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#2a2a2a" }}>
                      <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #444" }}>Rec. No</th>
                      <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #444" }}>Number Plate</th>
                      <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #444" }}>Staff</th>
                      <th style={{ padding: 12, textAlign: "left", borderBottom: "1px solid #444" }}>Date</th>
                      <th style={{ padding: 12, textAlign: "right", borderBottom: "1px solid #444" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt) => (
                      <tr key={receipt.id} style={{ borderBottom: "1px solid #333" }}>
                        <td style={{ padding: 12 }}>{receipt.rec_no}</td>
                        <td style={{ padding: 12 }}>{receipt.number_plate}</td>
                        <td style={{ padding: 12 }}>{receipt.staff_name || "N/A"}</td>
                        <td style={{ padding: 12 }}>
                          {new Date(receipt.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: 12, textAlign: "right", fontWeight: 600 }}>
                          {formatMYR(receipt.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 30 }}>
                <h3 style={{ marginBottom: 20 }}>Payment Status Summary</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                  {["paid", "unpaid", "other"].map((status) => {
                    const statusReceipts = receipts.filter(r => r.payment_status === status);
                    const statusTotal = statusReceipts.reduce((sum, r) => sum + r.total, 0);
                    const statusCount = statusReceipts.length;
                    const color = status === "paid" ? "#10b981" : status === "unpaid" ? "#f59e0b" : "#6b7280";
                    return (
                      <div key={status} className="card" style={{ padding: 20 }}>
                        <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 8 }}>
                          {formatMYR(statusTotal)}
                        </div>
                        <div style={{ fontSize: 14, color, marginBottom: 4 }}>
                          {statusCount} {status.charAt(0).toUpperCase() + status.slice(1)} receipt{statusCount !== 1 ? 's' : ''}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {status === "paid" ? "💰 Collected" : status === "unpaid" ? "⚠️ Pending" : "📝 Other"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
