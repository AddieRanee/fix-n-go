import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../state/auth";
import { Modal } from "../components/Modal";
import { formatMYR } from "../lib/money";
import { requireSupabase } from "../lib/supabase";
import { LOW_STOCK_THRESHOLD } from "../constants/stock";

type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  stock_quantity: number;
  price: number;
  date_issued: string | null;
  last_updated: string;
};

type InventoryForm = Omit<InventoryItem, "id" | "last_updated">;

const emptyForm: InventoryForm = {
  item_code: "",
  item_name: "",
  category: "",
  stock_quantity: 0,
  price: 0,
  date_issued: ""
};

export function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowAddQty, setRowAddQty] = useState<Record<string, string>>({});
  const [stockEditRowId, setStockEditRowId] = useState<string | null>(null);
  const [rowDateIssued, setRowDateIssued] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [addMode, setAddMode] = useState<"create" | "stock">("create");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      let query = supabase
        .from("inventory")
        .select("id,item_code,item_name,category,stock_quantity,price,date_issued,last_updated")
        .order("created_at", { ascending: false });
      const searchTerm = search.trim();
      if (searchTerm) {
        query = query.or(
          `item_code.ilike.%${searchTerm}%,item_name.ilike.%${searchTerm}%`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      setItems(data ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onInventoryChanged = () => {
      void load();
    };

    window.addEventListener("fixngo:inventory-changed", onInventoryChanged);
    return () => window.removeEventListener("fixngo:inventory-changed", onInventoryChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const lowStockCount = useMemo(
    () => items.filter((i) => i.stock_quantity < LOW_STOCK_THRESHOLD).length,
    [items]
  );

  const canEdit = true;

  return (
    <div className="container">
      <div className="card">
        <div className="cardHeader">
          <div className="row">
            <h1 className="title">Inventory</h1>
            <span className="muted">
              {loading ? "Loading..." : `${items.length} items`}
            </span>
            {lowStockCount ? (
              <span className="badge badgeWarn">LOW STOCK: {lowStockCount}</span>
            ) : null}
            <div className="spacer" />
            <div style={{ minWidth: 280 }}>
              <div className="formLabel" style={{ textAlign: "right" }}>
                Search Item Code or Name
              </div>
              <input
                className="input"
                placeholder="e.g. ITM001 or Brake Pad"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <button className="button" type="button" onClick={load}>
              Search
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
                setAddMode("create");
                setModalOpen(true);
              }}
            >
              Add Item
            </button>
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
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Date Issued</th>
                  <th>Price</th>
                  <th>Stock Quantity</th>
                  <th>Last Updated</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const low = item.stock_quantity < LOW_STOCK_THRESHOLD;
                  const qtyText = rowAddQty[item.id] ?? "1";
                  const dateIssuedValue =
                    rowDateIssued[item.id] ?? item.date_issued ?? "";
                  return (
                    <tr key={item.id}>
                      <td>{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={dateIssuedValue}
                          onChange={(e) =>
                            setRowDateIssued((m) => ({
                              ...m,
                              [item.id]: e.target.value
                            }))
                          }
                          onBlur={async () => {
                            if ((item.date_issued ?? "") === dateIssuedValue) return;
                            try {
                              const supabase = requireSupabase();
                              const { error } = await supabase
                                .from("inventory")
                                .update({
                                  date_issued: dateIssuedValue || null,
                                  last_updated: new Date().toISOString()
                                })
                                .eq("id", item.id);
                              if (error) throw error;
                              await load();
                            } catch (err: any) {
                              alert(err?.message ?? "Update date issued failed");
                            }
                          }}
                          aria-label={`Date issued for ${item.item_code}`}
                        />
                      </td>
                      <td>{formatMYR(item.price)}</td>
                      <td>
                        <span>
                          {item.stock_quantity}{" "}
                          {low ? <span className="badge badgeWarn">LOW</span> : null}
                        </span>
                        {stockEditRowId === item.id ? (
                          <input
                            className="input"
                            type="number"
                            min={1}
                            step={1}
                            value={qtyText}
                            onChange={(e) =>
                              setRowAddQty((m) => ({
                                ...m,
                                [item.id]: e.target.value
                              }))
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            onWheel={(e) =>
                              (e.currentTarget as HTMLInputElement).blur()
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setStockEditRowId(null);
                              if (e.key !== "Enter") return;
                              (e.currentTarget as HTMLInputElement).blur();
                            }}
                            style={{ width: 96, marginLeft: 10 }}
                            aria-label={`Add stock quantity for ${item.item_code}`}
                            autoFocus
                          />
                        ) : null}
                        <button
                          className="iconButtonSm"
                          type="button"
                          title="Update stock quantity"
                          aria-label={`Update stock quantity for ${item.item_code}`}
                          onClick={async () => {
                            if (stockEditRowId !== item.id) {
                              setStockEditRowId(item.id);
                              setRowAddQty((m) => ({
                                ...m,
                                [item.id]: m[item.id] ?? "1"
                              }));
                              return;
                            }
                            const qty = Math.trunc(Number(qtyText));
                            if (!Number.isFinite(qty) || qty <= 0) return;
                            try {
                              const supabase = requireSupabase();
                              const { data: current, error: readErr } = await supabase
                                .from("inventory")
                                .select("stock_quantity")
                                .eq("item_code", item.item_code)
                                .single();
                              if (readErr) throw readErr;
                              const nextQty = Number(current?.stock_quantity ?? 0) + qty;
                              const { error } = await supabase
                                .from("inventory")
                                .update({
                                  stock_quantity: nextQty,
                                  price: item.price,
                                  last_updated: new Date().toISOString()
                                })
                                .eq("item_code", item.item_code);
                              if (error) throw error;
                              setRowAddQty((m) => ({ ...m, [item.id]: "1" }));
                              setStockEditRowId(null);
                              await load();
                            } catch (err: any) {
                              alert(err?.message ?? "Update stock failed");
                            }
                          }}
                          style={{ marginLeft: stockEditRowId === item.id ? 8 : 10 }}
                        >
                          +
                        </button>
                      </td>
                      <td>{new Date(item.last_updated).toLocaleString()}</td>
                      {canEdit ? (
                        <td>
                          <div className="row">
                            <button
                              className="button"
                              type="button"
                              onClick={async () => {
                                const nextDate =
                                  rowDateIssued[item.id] ?? item.date_issued ?? "";
                                if ((item.date_issued ?? "") === nextDate) return;
                                try {
                                  const supabase = requireSupabase();
                                  const { error } = await supabase
                                    .from("inventory")
                                    .update({
                                      date_issued: nextDate || null,
                                      last_updated: new Date().toISOString()
                                    })
                                    .eq("id", item.id);
                                  if (error) throw error;
                                  await load();
                                } catch (err: any) {
                                  alert(
                                    err?.message ?? "Save date issued failed"
                                  );
                                }
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="button"
                              type="button"
                              onClick={() => {
                                setEditing(item);
                                setForm({
                                  item_code: item.item_code,
                                  item_name: item.item_name,
                                  category: item.category,
                                  stock_quantity: item.stock_quantity,
                                  price: item.price,
                                  date_issued: item.date_issued ?? ""
                                });
                                setModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="button buttonDanger"
                              type="button"
                              onClick={async () => {
                                const ok = confirm(`Delete ${item.item_code}?`);
                                if (!ok) return;
                                try {
                                  const supabase = requireSupabase();
                                  const { error } = await supabase
                                    .from("inventory")
                                    .delete()
                                    .eq("id", item.id);
                                  if (error) throw error;
                                  await load();
                                } catch (err: any) {
                                  alert(err?.message ?? "Delete failed");
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!items.length && !loading ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="muted">
                      No items found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.item_code}` : "Add Inventory Item"}
        solid
        onClose={() => setModalOpen(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const supabase = requireSupabase();
              if (editing) {
                const { error } = await supabase
                  .from("inventory")
                  .update({
                    item_code: form.item_code,
                    item_name: form.item_name,
                    category: form.category,
                    stock_quantity: form.stock_quantity,
                    price: form.price,
                    date_issued: form.date_issued || null,
                    last_updated: new Date().toISOString()
                  })
                  .eq("id", editing.id);
                if (error) throw error;
              } else if (addMode === "create") {
                const nextCode = form.item_code.trim();
                const existing = items.find(
                  (i) => i.item_code.trim().toLowerCase() === nextCode.toLowerCase()
                );
                if (existing) {
                  const ok = confirm(
                    `Item Code "${existing.item_code}" already exists.\n\nAre you sure you want to add the same thing twice?\n\nPress OK to add stock instead, or Cancel to go back.`
                  );
                  if (!ok) return;
                  const { data: current, error: readErr } = await supabase
                    .from("inventory")
                    .select("stock_quantity")
                    .eq("item_code", existing.item_code)
                    .single();
                  if (readErr) throw readErr;
                  const nextQty = Number(current?.stock_quantity ?? 0) + form.stock_quantity;
                  const { error } = await supabase
                    .from("inventory")
                    .update({
                      stock_quantity: nextQty,
                      price: form.price,
                      last_updated: new Date().toISOString()
                    })
                    .eq("item_code", existing.item_code);
                  if (error) throw error;
                } else {
                  const { error } = await supabase.from("inventory").insert({
                    item_code: nextCode,
                    item_name: form.item_name,
                    category: form.category,
                    stock_quantity: form.stock_quantity,
                    price: form.price,
                    date_issued: form.date_issued || null,
                    last_updated: new Date().toISOString()
                  });
                  if (error) throw error;
                }
              } else {
                const { data: current, error: readErr } = await supabase
                  .from("inventory")
                  .select("stock_quantity")
                  .eq("item_code", form.item_code)
                  .single();
                if (readErr) throw readErr;
                const nextQty = Number(current?.stock_quantity ?? 0) + form.stock_quantity;
                const { error } = await supabase
                  .from("inventory")
                  .update({
                    stock_quantity: nextQty,
                    price: form.price,
                    last_updated: new Date().toISOString()
                  })
                  .eq("item_code", form.item_code);
                if (error) throw error;
              }
              setModalOpen(false);
              await load();
            } catch (err: any) {
              alert(err?.message ?? "Save failed");
            }
          }}
        >
          <div
            className="row"
            style={{ flexDirection: "column", alignItems: "stretch" }}
          >
            {!editing ? (
              <div className="row" style={{ justifyContent: "center" }}>
                <button
                  className="button"
                  type="button"
                  onClick={() => setAddMode("create")}
                  style={
                    addMode === "create"
                      ? undefined
                      : { background: "rgba(255,255,255,0.06)" }
                  }
                >
                  Create New Item
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => setAddMode("stock")}
                  style={
                    addMode === "stock"
                      ? undefined
                      : { background: "rgba(255,255,255,0.06)" }
                  }
                >
                  Add Stock
                </button>
              </div>
            ) : null}

            <div className="formLabel">Item Code</div>
            <input
              className="input"
              placeholder="Item Code (e.g. ITM001)"
              value={form.item_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, item_code: e.target.value }))
              }
            />

            <div className="formLabel">Item Name</div>
            <input
              className="input"
              placeholder="Item Name"
              value={form.item_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, item_name: e.target.value }))
              }
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">Category</div>
            <input
              className="input"
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">Date Issued</div>
            <input
              className="input"
              type="date"
              value={form.date_issued ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, date_issued: e.target.value }))
              }
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">
              {editing
                ? "Stock Quantity"
                : addMode === "stock"
                  ? "Stock to Add"
                  : "Initial Stock"}
            </div>
            <input
              className="input"
              placeholder={
                editing
                  ? "Stock Quantity"
                  : addMode === "stock"
                    ? "Stock to Add"
                    : "Initial Stock"
              }
              type="number"
              min={editing ? 0 : addMode === "stock" ? 1 : 0}
              value={form.stock_quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) }))
              }
              onFocus={(e) => {
                if (Number(e.currentTarget.value) === 0) e.currentTarget.select();
              }}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            />

            <div className="formLabel">Price</div>
            <input
              className="input"
              placeholder="Price"
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: Number(e.target.value) }))
              }
              onFocus={(e) => {
                if (Number(e.currentTarget.value) === 0) e.currentTarget.select();
              }}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            />
            <button className="button" type="submit">
              {editing ? "Save" : addMode === "stock" ? "Add Stock" : "Create Item"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
