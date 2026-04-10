import React, { useState, useEffect } from 'react';
import { requireSupabase } from '../lib/supabase';
import { formatMYR } from '../lib/money';
import { api } from '../lib/api';
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

export function SalesPage() {
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    setLoading(true);
    try {
      const res = await api.get('/sales');
      setSales(res.data.sales || []);
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
