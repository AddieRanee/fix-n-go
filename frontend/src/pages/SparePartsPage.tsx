import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { CompanyFolderManager } from "../components/CompanyFolderManager";
import { formatMYR } from "../lib/money";
import { getApiErrorMessage } from "../lib/errors";
import { requireSupabase } from "../lib/supabase";
import { LOW_STOCK_THRESHOLD } from "../constants/stock";

export function SparePartsPage() {
  type SparePart = {
    id: string;
    item_code: string | null;
    item_name: string | null;
    category: string | null;
    company: string | null;
    stock_quantity: number;
    price: number;
    payment_status: "paid" | "unpaid";
    date_issued: string | null;
    last_updated: string;
  };

  type Form = {
    item_code: string;
    item_name: string;
    category: string;
    company: string;
    stock_quantity: number;
    price: number;
    payment_status: "paid" | "unpaid";
    date_issued: string;
  };

  const emptyForm: Form = {
    item_code: "",
    item_name: "",
    category: "",
    company: "",
    stock_quantity: 0,
    price: 0,
    payment_status: "unpaid",
    date_issued: ""
  };

  const [rows, setRows] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCompany, setFilterCompany] = useState("");
  const [filterCodeOrName, setFilterCodeOrName] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SparePart | null>(null);
  const [addMode, setAddMode] = useState<"create" | "stock">("create");
  const [form, setForm] = useState<Form>(emptyForm);
  const [stockTargetId, setStockTargetId] = useState<string | null>(null);
// const [rowAddQty, setRowAddQty] = useState<Record<string, string>>({});
// const [stockEditRowId, setStockEditRowId] = useState<string | null>(null);
  const [rowDateIssued, setRowDateIssued] = useState<Record<string, string>>({});
  const [rowPaymentStatus, setRowPaymentStatus] = useState<
    Record<string, "paid" | "unpaid">
  >({});

  const canSubmit = useMemo(() => {
    if (addMode === "stock" && !stockTargetId) return false;
    const stockOk =
      addMode === "stock"
        ? Number.isFinite(form.stock_quantity) && form.stock_quantity > 0
        : Number.isFinite(form.stock_quantity) && form.stock_quantity >= 0;
    if (!stockOk) return false;
    if (!Number.isFinite(form.price) || form.price < 0) return false;
    return true;
  }, [addMode, form, stockTargetId]);

  const companySuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.company?.trim() || "")
            .filter((company) => company.length > 0)
        )
      ),
    [rows]
  );

  function cellOrBlank(value: string | null | undefined) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return <span className="reqHint">Blank</span>;
    return trimmed;
  }

  function displayName(row: SparePart) {
    const code = (row.item_code ?? "").trim();
    if (code) return code;
    const name = (row.item_name ?? "").trim();
    if (name) return name;
    return "Blank";
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      let query = supabase
        .from("spare_parts")
        .select(
          "id,item_code,item_name,category,company,stock_quantity,price,payment_status,date_issued,last_updated"
        )
        .order("created_at", { ascending: false });
      const searchTerm = filterCodeOrName.trim();
      if (searchTerm) {
        query = query.or(
          `item_code.ilike.%${searchTerm}%,item_name.ilike.%${searchTerm}%`
        );
      }
      if (filterCompany) query = query.ilike("company", `%${filterCompany}%`);
      const { data, error } = await query;
      if (error) throw error;
      setRows(data ?? []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to load spare parts"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleInventoryChanged = () => {
      void load();
    };
    window.addEventListener("fixngo:inventory-changed", handleInventoryChanged as EventListener);
    return () => {
      window.removeEventListener(
        "fixngo:inventory-changed",
        handleInventoryChanged as EventListener
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompany, filterCodeOrName]);

// const lowStockCount = useMemo(
  //   () => rows.filter((r) => r.stock_quantity < LOW_STOCK_THRESHOLD).length,
  //   [rows]
  // );

  return (
    <div className="container">
      <div className="card">
        <div className="cardHeader">
          <div className="row">
            <h1 className="title">Spare Parts</h1>
            <span className="muted">
              {loading ? "Loading..." : `${rows.length} items`}
            </span>

            <div className="spacer" />

            <div style={{ minWidth: 260 }}>
              <div className="formLabel" style={{ textAlign: "right" }}>
                Search Item Code or Name
              </div>
              <input
                className="input"
                placeholder="e.g. SP001 or Oil Filter"
                value={filterCodeOrName}
                onChange={(e) => setFilterCodeOrName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ minWidth: 260 }}>
              <div className="formLabel" style={{ textAlign: "right" }}>
                Filter Company
              </div>
              <input
                className="input"
                placeholder="e.g. Company A"
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
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
                setAddMode("create");
                setStockTargetId(null);
                setForm(emptyForm);
                setModalOpen(true);
              }}
            >
              Add Spare Part
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
                  <th>Company</th>
                  <th>Date Issued</th>
                  <th>Price</th>
<th>Quantity</th>
                  <th>Payment</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
// const low = r.stock_quantity < LOW_STOCK_THRESHOLD;
// const qtyText = rowAddQty[r.id] ?? "1";
                  const dateIssuedValue =
                    rowDateIssued[r.id] ?? r.date_issued ?? "";
                  const paymentValue =
                    rowPaymentStatus[r.id] ?? r.payment_status ?? "unpaid";
                  return (
                    <tr key={r.id}>
                      <td>{cellOrBlank(r.item_code)}</td>
                      <td>{cellOrBlank(r.item_name)}</td>
                      <td>{cellOrBlank(r.category)}</td>
                      <td>{cellOrBlank(r.company)}</td>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={dateIssuedValue}
                          onChange={(e) =>
                            setRowDateIssued((m) => ({
                              ...m,
                              [r.id]: e.target.value
                            }))
                          }
                          onBlur={async () => {
                            if ((r.date_issued ?? "") === dateIssuedValue) return;
                            try {
                              const supabase = requireSupabase();
                              const { error } = await supabase
                                .from("spare_parts")
                                .update({
                                  date_issued: dateIssuedValue || null,
                                  last_updated: new Date().toISOString()
                                })
                                .eq("id", r.id);
                              if (error) throw error;
                              await load();
                            } catch (err: any) {
                              alert(getApiErrorMessage(err, "Update date issued failed"));
                            }
                          }}
                          aria-label={`Date issued for ${displayName(r)}`}
                        />
                      </td>
                      <td>{formatMYR(r.price)}</td>
                      <td>
                        <span>
                          {r.stock_quantity}{" "}

                        </span>


                      </td>
                      <td>
                        <select
                          className="select selectDark"
                          value={paymentValue}
                          onChange={async (e) => {
                            const next = e.target.value as "paid" | "unpaid";
                            setRowPaymentStatus((m) => ({ ...m, [r.id]: next }));
                            try {
                              const supabase = requireSupabase();
                              const { error } = await supabase
                                .from("spare_parts")
                                .update({
                                  payment_status: next,
                                  last_updated: new Date().toISOString()
                                })
                                .eq("id", r.id);
                              if (error) throw error;
                              await load();
                            } catch (err: any) {
                              alert(
                                getApiErrorMessage(
                                  err,
                                  "Update payment status failed"
                                )
                              );
                            }
                          }}
                          aria-label={`Payment status for ${displayName(r)}`}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td>{new Date(r.last_updated).toLocaleString()}</td>
                      <td>
                        <div className="row">
                          <button
                            className="button"
                            type="button"
                            onClick={async () => {
                              const nextDate =
                                rowDateIssued[r.id] ?? r.date_issued ?? "";
                              const nextPayment =
                                rowPaymentStatus[r.id] ?? r.payment_status ?? "unpaid";
                              if (
                                (r.date_issued ?? "") === nextDate &&
                                (r.payment_status ?? "unpaid") === nextPayment
                              ) {
                                return;
                              }
                              try {
                                const supabase = requireSupabase();
                                const { error } = await supabase
                                  .from("spare_parts")
                                  .update({
                                    date_issued: nextDate || null,
                                    payment_status: nextPayment,
                                    last_updated: new Date().toISOString()
                                  })
                                  .eq("id", r.id);
                                if (error) throw error;
                                await load();
                              } catch (err: any) {
                                alert(getApiErrorMessage(err, "Save failed"));
                              }
                            }}
                          >
                            Save
                          </button>
                          <button
                            className="button"
                            type="button"
                            onClick={() => {
                              setEditing(r);
                              setAddMode("create");
                              setStockTargetId(null);
                              setForm({
                                item_code: r.item_code ?? "",
                                item_name: r.item_name ?? "",
                                category: r.category ?? "",
                                company: r.company ?? "",
                                stock_quantity: r.stock_quantity,
                                price: r.price,
                                payment_status: r.payment_status ?? "unpaid",
                                date_issued: r.date_issued ?? ""
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
                              const ok = confirm(`Delete ${displayName(r)}?`);
                              if (!ok) return;
                              try {
                                const supabase = requireSupabase();
                                const { error } = await supabase
                                  .from("spare_parts")
                                  .delete()
                                  .eq("id", r.id);
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
                    </tr>
                  );
                })}
                {!rows.length && !loading ? (
                  <tr>
                    <td colSpan={10} className="muted">
                      No spare parts found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <CompanyFolderManager companySuggestions={companySuggestions} />
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${displayName(editing)}` : "Add Spare Part"}
        solid
        onClose={() => {
          setModalOpen(false);
          setStockTargetId(null);
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canSubmit) {
              // Keep it quiet; just don't submit.
              return;
            }
            try {
              const payload: Form = { ...form };
              if (editing) {
                const supabase = requireSupabase();
                const { error } = await supabase
                  .from("spare_parts")
                  .update({
                    item_code: payload.item_code.trim() || null,
                    item_name: payload.item_name.trim() || null,
                    category: payload.category.trim() || null,
                    company: payload.company.trim() || null,
                    stock_quantity: payload.stock_quantity,
                    price: payload.price,
                    payment_status: payload.payment_status,
                    date_issued: payload.date_issued || null,
                    last_updated: new Date().toISOString()
                  })
                  .eq("id", editing.id);
                if (error) throw error;
              } else if (addMode === "create") {
                const nextCode = payload.item_code.trim();
                const existing =
                  nextCode.length > 0
                    ? rows.find(
                        (r) =>
                          (r.item_code ?? "").trim().toLowerCase() ===
                          nextCode.toLowerCase()
                      )
                    : null;
                if (existing) {
                  const ok = confirm(
                    `Item Code "${existing.item_code}" already exists.\n\nAre you sure you want to add the same thing twice?\n\nPress OK to add stock instead, or Cancel to go back.`
                  );
                  if (!ok) return;
                  const supabase = requireSupabase();
                  const { error } = await supabase.rpc(
                    "add_spare_part_stock_by_id",
                    {
                      p_id: existing.id,
                      p_add_quantity: payload.stock_quantity,
                      p_price: payload.price,
                      p_company: payload.company.trim() || null
                    }
                  );
                  if (error) throw error;
                } else {
                  const supabase = requireSupabase();
                  const { error } = await supabase.from("spare_parts").insert({
                    item_code: payload.item_code.trim() || null,
                    item_name: payload.item_name.trim() || null,
                    category: payload.category.trim() || null,
                    company: payload.company.trim() || null,
                    stock_quantity: payload.stock_quantity,
                    price: payload.price,
                    payment_status: payload.payment_status,
                    date_issued: payload.date_issued || null,
                    last_updated: new Date().toISOString()
                  });
                  if (error) throw error;
                }
              } else {
                const supabase = requireSupabase();
                const { error } = await supabase.rpc(
                  "add_spare_part_stock_by_id",
                  {
                    p_id: stockTargetId,
                    p_add_quantity: form.stock_quantity,
                    p_price: form.price,
                    p_company: form.company.trim() || null
                  }
                );
                if (error) throw error;
              }
              setModalOpen(false);
              setStockTargetId(null);
              await load();
            } catch (err: any) {
              alert(getApiErrorMessage(err, "Save failed"));
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
                  onClick={() => {
                    setAddMode("create");
                    setStockTargetId(null);
                  }}
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
                  onClick={() => {
                    setAddMode("stock");
                    setStockTargetId(null);
                  }}
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

            {addMode === "stock" && !editing ? (
              <>
                <div className="formLabel">Select Item</div>
                <select
                  className="input"
                  value={stockTargetId ?? ""}
                  onChange={(e) => {
                    const nextId = e.target.value || null;
                    setStockTargetId(nextId);
                    const row = nextId ? rows.find((r) => r.id === nextId) : null;
                    setForm((f) => ({
                      ...f,
                      item_code: row?.item_code ?? "",
                      item_name: row?.item_name ?? "",
                      category: row?.category ?? "",
                      company: row?.company ?? "",
                      stock_quantity: 1,
                      price: row?.price ?? f.price,
                      payment_status: row?.payment_status ?? "unpaid",
                      date_issued: row?.date_issued ?? ""
                    }));
                  }}
                >
                  <option value="">Choose an item…</option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {displayName(r)}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <div className="formLabel">Item Code</div>
            <input
              className="input"
              placeholder="e.g. SP001 (optional)"
              value={form.item_code}
              onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">Item Name</div>
            <input
              className="input"
              placeholder="e.g. Oil Filter"
              value={form.item_name}
              onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">Category</div>
            <input
              className="input"
              placeholder="e.g. Engine"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              disabled={!editing && addMode === "stock"}
            />

            <div className="formLabel">Company</div>
            <input
              className="input"
              placeholder="e.g. Company A"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              disabled={false}
            />

            <div className="formLabel">Date Issued</div>
            <input
              className="input"
              type="date"
              value={form.date_issued}
              onChange={(e) =>
                setForm((f) => ({ ...f, date_issued: e.target.value }))
              }
            />

            <div className="formLabel">Payment Status</div>
            <select
              className="select selectDark"
              value={form.payment_status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  payment_status: e.target.value as "paid" | "unpaid"
                }))
              }
              disabled={!editing && addMode === "stock"}
            >
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>

            <div className="formLabel">
              {editing
                ? "Stock Quantity"
                : addMode === "stock"
                  ? "Stock to Add"
                  : "Initial Stock"}
            </div>
            <input
              className="input"
              placeholder="e.g. 10"
              type="number"
              min={editing ? 0 : 1}
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
              placeholder="e.g. 40.50"
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
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
