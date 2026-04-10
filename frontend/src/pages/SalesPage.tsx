import React, { useState, useEffect } from 'react';
import { requireSupabase } from '../lib/supabase';
import { formatMYR } from '../lib/money';
import { getApiErrorMessage } from '../lib/errors';

type SaleItem = {
  id: string;
  item_code: string;
  item_name: string;
  price: number;
  quantity: number;
  total: number;
  customer_name?: string;
  sale_date: string;
};

function toFiniteNumber(value: unknown) {
  const next = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

export function SalesPage() {
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSales();
  }, []);

  async function loadSales() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();

      const [receiptsRes, linesRes] = await Promise.all([
        supabase
          .from("receipts")
          .select("id,number_plate,staff_name,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("receipt_lines")
          .select(
            "id,receipt_id,line_type,inventory_item_code,spare_part_id,description,quantity,unit_price,created_at"
          )
          .order("created_at", { ascending: false })
      ]);

      if (receiptsRes.error) throw receiptsRes.error;
      if (linesRes.error) throw linesRes.error;

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
        const { data: spRows, error: spErr } = await supabase
          .from("spare_parts")
          .select("id,item_code,item_name")
          .in("id", sparePartIds);
        if (spErr) throw spErr;
        for (const row of spRows ?? []) {
          sparePartMap.set(String((row as any).id), {
            item_code: (row as any).item_code ?? null,
            item_name: (row as any).item_name ?? null
          });
        }
      }

      if (inventoryCodes.length) {
        const { data: invRows, error: invErr } = await supabase
          .from("inventory")
          .select("item_code,item_name")
          .in("item_code", inventoryCodes);
        if (invErr) throw invErr;
        for (const row of invRows ?? []) {
          inventoryMap.set(normalizeText((row as any).item_code), {
            item_code: (row as any).item_code ?? null,
            item_name: (row as any).item_name ?? null
          });
        }
      }

      const nextSales: SaleItem[] = (lines as any[]).map((line) => {
        const receipt = receiptMap.get(String(line.receipt_id));
        const quantity = toFiniteNumber(line.quantity ?? 1);
        const price = toFiniteNumber(line.unit_price ?? 0);
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

      nextSales.sort((a, b) => b.sale_date.localeCompare(a.sale_date));
      setSales(nextSales);
    } catch (err) {
      setError(getApiErrorMessage(err as Error, 'Failed to load sales'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="container"><div className="muted">Loading sales...</div></div>;
  if (error) return <div className="container"><div className="muted error">{error}</div></div>;

  const totalSales = sales.reduce((sum, sale) => {
    const lineTotal =
      toFiniteNumber((sale as Partial<SaleItem>).total) ||
      toFiniteNumber((sale as Partial<SaleItem>).price) *
        toFiniteNumber((sale as Partial<SaleItem>).quantity);
    return sum + lineTotal;
  }, 0);

  return (
    <div className="container">
      <div className="card salesCard">
        <div className="cardHeader salesHeader">
          <div className="salesHeaderCopy">
            <h1 className="title" style={{ marginBottom: 4 }}>Sales Report</h1>
            <span className="muted">Recent sales transactions</span>
          </div>
          <div className="salesHero">
            <div className="salesHeroLabel muted small">Total Sales</div>
            <div className="salesHeroValue">{formatMYR(totalSales)}</div>
            <div className="salesHeroHint">Live summary of all recorded sales</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="salesCellLeft">{new Date(sale.sale_date).toLocaleDateString('en-GB')}</td>
                    <td>{sale.customer_name || 'Walk-in'}</td>
                    <td className="salesCellLeft">{sale.item_code} - {sale.item_name}</td>
                    <td className="salesCellCenter salesQty">{toFiniteNumber(sale.quantity)}</td>
                    <td className="salesCellCenter salesMoney">{formatMYR(toFiniteNumber(sale.price))}</td>
                    <td className="salesCellCenter salesMoney salesLineTotal">{formatMYR(toFiniteNumber(sale.total))}</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                      No sales recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
