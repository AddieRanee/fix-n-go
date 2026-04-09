import React, { useEffect, useMemo, useState } from "react";
import type { InventoryItem, SparePartItem, ReceiptLine, ReceiptDetail, ReceiptEditOriginalLine, ReceiptEditOriginalReceipt } from "../types/receipt";
import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { useAuth } from "../state/auth";
import { formatMYR } from "../lib/money";
import { requireSupabase } from "../lib/supabase";
import { getApiErrorMessage } from "../lib/errors";















export function UseInventoryPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);


  const [receipts, setReceipts] = useState<
    { id: string; rec_no?: number; number_plate: string; staff_name: string; created_at: string }[]
  >([]);
  const [itemSearch, setItemSearch] = useState(() => localStorage.getItem("receiptForm_itemSearch") || "");
  
  const sparePartLabel = (i: SparePartItem) => `${i.item_code ?? i.id} - ${i.item_name}${i.company ? ` (${i.company})` : ''}`;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextRecNo, setNextRecNo] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<ReceiptLine[]>([]);
  const [editOriginalLines, setEditOriginalLines] = useState<ReceiptEditOriginalLine[]>([]);
  const [editOriginalReceipt, setEditOriginalReceipt] =
    useState<ReceiptEditOriginalReceipt>(null);
  const [editRecNo, setEditRecNo] = useState<number | null>(null);
  const [editNumberPlate, setEditNumberPlate] = useState("");
  const [editStaffName, setEditStaffName] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState<"paid" | "unpaid" | "other">("paid");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash">("cash");
  const [clearFromDate, setClearFromDate] = useState("");
  const [clearToDate, setClearToDate] = useState("");
  const [bulkClearing, setBulkClearing] = useState(false);

  const [jobId, setJobId] = useState(() => localStorage.getItem("receiptForm_jobId") || "J");
  const [numberPlate, setNumberPlate] = useState(() => localStorage.getItem("receiptForm_numberPlate") || "");
  const [staffName, setStaffName] = useState(() => localStorage.getItem("receiptForm_staffName") || "");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid" | "other">("paid");
  const [otherReason, setOtherReason] = useState(() => localStorage.getItem("receiptForm_otherReason") || "");
  const [paymentMethod, setPaymentMethod] = useState<"cash">("cash");

  const [lines, setLines] = useState<ReceiptLine[]>(() => {
    const savedLines = localStorage.getItem("receiptForm_lines");
    if (savedLines) {
      try {
        const parsedLines = JSON.parse(savedLines);
        if (Array.isArray(parsedLines) && parsedLines.length > 0) {
          return parsedLines;
        }
      } catch (e) {
        console.warn("Failed to parse saved lines:", e);
      }
    }
    return [];
  });

  function normalizeLookup(value?: string | null) {
    return (value ?? "").trim().toLowerCase();
  }

  function buildPaymentNote(
    status: "paid" | "unpaid" | "other",
    method: "cash",
    otherNote: string
  ) {
    if (status === "other") return otherNote.trim() || null;
    return null;
  }

  function parsePaymentNote(note?: string | null) {
    const trimmed = (note ?? "").trim();
    if (!trimmed) {
      return { method: "cash" as const, otherNote: "" };
    }
    return { method: "cash" as const, otherNote: trimmed };
  }

  function hasDuplicateBillItem(candidate: ReceiptLine, excludeId?: string) {
    if (candidate.type === "inventory") {
      const candidateCode = normalizeLookup(candidate.item_code);
      if (!candidateCode) return false;
      return lines.some(
        (row) =>
          row.id !== excludeId &&
          row.type === "inventory" &&
          normalizeLookup(row.item_code) === candidateCode
      );
    }

    if (candidate.type === "spare_part") {
      const candidateKey = normalizeLookup(candidate.spare_part_id || candidate.description);
      if (!candidateKey) return false;
      return lines.some(
        (row) =>
          row.id !== excludeId &&
          row.type === "spare_part" &&
          normalizeLookup(row.spare_part_id || row.description) === candidateKey
      );
    }

    return false;
  }

  function hasDuplicateEditBillItem(candidate: ReceiptLine, excludeId?: string) {
    if (candidate.type === "inventory") {
      const candidateCode = normalizeLookup(candidate.item_code);
      if (!candidateCode) return false;
      return editLines.some(
        (row) =>
          row.id !== excludeId &&
          row.type === "inventory" &&
          normalizeLookup(row.item_code) === candidateCode
      );
    }

    if (candidate.type === "spare_part") {
      const candidateKey = normalizeLookup(candidate.spare_part_id || candidate.description);
      if (!candidateKey) return false;
      return editLines.some(
        (row) =>
          row.id !== excludeId &&
          row.type === "spare_part" &&
          normalizeLookup(row.spare_part_id || row.description) === candidateKey
      );
    }

    return false;
  }

  // Save form data to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("receiptForm_jobId", jobId);
  }, [jobId]);

  useEffect(() => {
    localStorage.setItem("receiptForm_numberPlate", numberPlate);
  }, [numberPlate]);

  useEffect(() => {
    localStorage.setItem("receiptForm_staffName", staffName);
  }, [staffName]);

  useEffect(() => {
    localStorage.setItem("receiptForm_paymentStatus", paymentStatus);
  }, [paymentStatus]);

  useEffect(() => {
    localStorage.setItem("receiptForm_otherReason", otherReason);
  }, [otherReason]);

  useEffect(() => {
    localStorage.setItem("receiptForm_paymentMethod", paymentMethod);
  }, [paymentMethod]);

  useEffect(() => {
    localStorage.setItem("receiptForm_itemSearch", itemSearch);
  }, [itemSearch]);

  useEffect(() => {
    localStorage.setItem("receiptForm_lines", JSON.stringify(lines));
  }, [lines]);

  useEffect(() => {
    setItemSearch("");
    setError(null);
    setLoading(true);
    const load = async () => {
      try {
        const supabase = requireSupabase();
        const [inv, sp, rec, lastRec] = await Promise.all([
          supabase
            .from("inventory")
            .select("id,item_code,item_name,stock_quantity,price")
            .order("created_at", { ascending: false }),
          supabase
            .from("spare_parts")
            .select("id,item_code,item_name,company,price,stock_quantity")
            .order("item_code"),
          supabase
            .from("receipts")
            .select("id,rec_no,number_plate,staff_name,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("receipts")
            .select("rec_no")
            .order("rec_no", { ascending: false })
            .limit(1)
        ]);
        if (inv.error) throw inv.error;
        if (sp.error) throw sp.error;
        if (rec.error) throw rec.error;
        if (lastRec.error) throw lastRec.error;

        setItems(inv.data ?? []);
        setSpareParts(sp.data ?? []);
        setReceipts(rec.data ?? []);
        const nextRec =
          lastRec.data && lastRec.data.length > 0
            ? Number(lastRec.data[0].rec_no) + 1
            : 1000;
        setNextRecNo(nextRec);
      } catch (err: any) {
        setError(getApiErrorMessage(err, "Failed to load items"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return { inv: items, sp: spareParts };
    
    const inv = items.filter((i) => 
      i.item_code.toLowerCase().includes(q) || i.item_name.toLowerCase().includes(q)
    );
    const sp = spareParts.filter((s) =>
      s.item_code?.toLowerCase().includes(q) || 
      s.item_name.toLowerCase().includes(q) || 
      s.company?.toLowerCase().includes(q)
    );
    return { inv, sp };
  }, [items, spareParts, itemSearch]);

function addQuickItem(selection: string) {
    if (!selection) return;
    const [type, rawId] = selection.split(":", 2);
    if (type === "inventory") {
      const item = items.find((entry) => entry.id === rawId);
      if (!item) return;
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "inventory",
          item_code: item.item_code,
          item_name: item.item_name,
          qty: 1,
          unit_price: item.price.toFixed(2)
        }
      ]);
      setItemSearch("");
      return;
    }
    if (type === "spare") {
      const item = spareParts.find((entry) => entry.id === rawId);
      if (!item) return;
      setLines((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "spare_part",
          spare_part_id: item.id,
          description: sparePartLabel(item),
          qty: 1,
          unit_price: item.price.toFixed(2)
        }
      ]);
      setItemSearch("");
      return;
    }
  }



  function getInventoryName(itemCode?: string | null) {
    const code = (itemCode ?? "").trim();
    if (!code) return "";
    return items.find((i) => i.item_code === code)?.item_name ?? "";
  }

  async function refreshNextRecNo(supabase = requireSupabase()) {
    try {
      const lastRec = await supabase
        .from("receipts")
        .select("rec_no")
        .order("rec_no", { ascending: false })
        .limit(1);
      if (lastRec.error) throw lastRec.error;
      const nextRec =
        lastRec.data && lastRec.data.length > 0 ? Number(lastRec.data[0].rec_no) + 1 : 1000;
      setNextRecNo(nextRec);
    } catch {
      // Silently fail, nextRecNo will be refreshed on page reload
    }
  }

  async function refreshReceiptsOnly(supabase = requireSupabase()) {
    const rec = await supabase
      .from("receipts")
      .select("id,rec_no,number_plate,staff_name,created_at")
      .order("created_at", { ascending: false });
    if (rec.error) throw rec.error;
    setReceipts(rec.data ?? []);
  }

  async function saveReceiptDirect() {
    const trimmedNumberPlate = numberPlate.trim();
    if (!trimmedNumberPlate) {
      setError("Vehicle Number Plate is required.");
      return null;
    }
    const seenInventory = new Set<string>();
    const seenSpareParts = new Set<string>();
    for (const row of lines) {
      if (row.type === "inventory") {
        const key = normalizeLookup(row.item_code);
        if (key && seenInventory.has(key)) {
          throw new Error("The same inventory item cannot appear more than once on the bill.");
        }
        if (key) seenInventory.add(key);
      }
      if (row.type === "spare_part") {
        const key = normalizeLookup(row.spare_part_id || row.description);
        if (key && seenSpareParts.has(key)) {
          throw new Error("The same spare part cannot appear more than once on the bill.");
        }
        if (key) seenSpareParts.add(key);
      }
    }

    const supabase = requireSupabase();
    const createdById = user?.id ?? null;
    const receiptInsert = await supabase
      .from("receipts")
      .insert({
        number_plate: trimmedNumberPlate,
        staff_name: staffName.trim(),
        payment_status: paymentStatus,
        payment_note: buildPaymentNote(paymentStatus, paymentMethod, otherReason),
        created_by_id: createdById
      })
      .select("id")
      .single();
    if (receiptInsert.error) throw receiptInsert.error;

    const receiptId = receiptInsert.data.id as string;
    const inventoryRollbacks: { item_code: string; stock_quantity: number }[] = [];
    const spareRollbacks: { id: string; stock_quantity: number }[] = [];

    const rollback = async () => {
      for (const u of inventoryRollbacks.reverse()) {
        await supabase
          .from("inventory")
          .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
          .eq("item_code", u.item_code);
      }
      for (const u of spareRollbacks.reverse()) {
        await supabase
          .from("spare_parts")
          .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
          .eq("id", u.id);
      }
      await supabase.from("receipt_lines").delete().eq("receipt_id", receiptId);
      await supabase.from("receipts").delete().eq("id", receiptId);
    };

    try {
      for (const l of lines) {
        const unit_price_raw = (l.unit_price ?? "").trim();
        const parsed = unit_price_raw.length > 0 ? Number(unit_price_raw) : NaN;
        const unit_price = Number.isFinite(parsed) ? parsed : undefined;
        const qty = l.qty ?? 1;

        if (l.type === "inventory") {
          const itemCode = (l.item_code ?? "").trim();
          if (!itemCode) throw new Error("inventory item_code is required");

          const invRes = await supabase
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

          inventoryRollbacks.push({
            item_code: itemCode,
            stock_quantity: invRes.data.stock_quantity
          });

          const { error: updErr } = await supabase
            .from("inventory")
            .update({
              stock_quantity: invRes.data.stock_quantity - qty,
              last_updated: new Date().toISOString()
            })
            .eq("item_code", itemCode);
          if (updErr) throw updErr;

          const { error: lineErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: "inventory",
            inventory_item_code: itemCode,
            description: invRes.data.item_name,
            quantity: qty,
            unit_price: unit_price ?? invRes.data.price ?? null
          });
          if (lineErr) throw lineErr;
          continue;
        }



        if (l.type === "spare_part") {
          let sparePartId = (l.spare_part_id ?? "").trim();
          const sparePartName = (l.description ?? "").trim();

          if (sparePartId) {
            const spRes = await supabase
              .from("spare_parts")
              .select("id,item_code,item_name,company,stock_quantity,price")
              .eq("id", sparePartId)
              .single();
            if (spRes.error) throw spRes.error;
            if (!spRes.data) throw new Error(`spare_part not found: ${sparePartId}`);
            if (spRes.data.stock_quantity < qty) throw new Error(
              `insufficient stock: ${spRes.data.item_code ?? spRes.data.id} (${spRes.data.stock_quantity} < ${qty})`
            );

            spareRollbacks.push({ id: sparePartId, stock_quantity: spRes.data.stock_quantity });

            const { error: updErr } = await supabase
              .from("spare_parts")
              .update({ stock_quantity: spRes.data.stock_quantity - qty, last_updated: new Date().toISOString() })
              .eq("id", sparePartId);
            if (updErr) throw updErr;

            const { error: lineErr } = await supabase.from("receipt_lines").insert({
              receipt_id: receiptId,
              line_type: "spare_part",
              spare_part_id: sparePartId,
              description: spRes.data.item_name ?? spRes.data.item_code ?? "Blank",
              quantity: qty,
              unit_price: unit_price ?? spRes.data.price ?? null
            });
            if (lineErr) throw lineErr;
            continue;
          }

          const { error: lineErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: "spare_part",
            spare_part_id: null,
            description: sparePartName || "Blank",
            quantity: qty,
            unit_price: unit_price ?? null
          });
          if (lineErr) throw lineErr;
          continue;
        }

        if (l.type === "service" || l.type === "custom") {
          const { error: lineErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: l.type,
            description: (l.description ?? "").trim() || "Blank",
            quantity: qty,
            unit_price: unit_price ?? null
          });
          if (lineErr) throw lineErr;
          continue;
        }

        throw new Error(`invalid line type: ${l.type}`);
      }

      const verify = await supabase
        .from("receipt_lines")
        .select("id")
        .eq("receipt_id", receiptId);
      if (verify.error) throw verify.error;
      if (!verify.data?.length) {
        throw new Error("Receipt was created but no receipt lines were saved.");
      }

      return receiptId;
    } catch (err) {
      await rollback();
      throw err;
    }
  }

  async function submit(action: "receipt") {
    setError(null);
    setSubmitting(true);
    try {
      const id = await saveReceiptDirect();
      if (!id) return;

      const supabase = requireSupabase();
      await refreshReceiptsOnly(supabase);
      await refreshNextRecNo(supabase);

      localStorage.removeItem("receiptForm_numberPlate");
      localStorage.removeItem("receiptForm_staffName");
      localStorage.removeItem("receiptForm_lines");
      localStorage.removeItem("receiptForm_itemSearch");  

      nav(`/receipt/${id}`);
      window.dispatchEvent(new CustomEvent("fixngo:inventory-changed"));
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to submit"));
    } finally {
      setSubmitting(false);
    }
  }

  function clearForm() {
    setJobId("J");
    setNumberPlate("");
    setStaffName("");
    setOtherReason("");
  setItemSearch("");  
    setLines([]);  
    setError(null);  
    
    // Clear localStorage
    localStorage.removeItem("receiptForm_jobId");
    localStorage.removeItem("receiptForm_numberPlate");
    localStorage.removeItem("receiptForm_staffName");
    localStorage.removeItem("receiptForm_lines");
    localStorage.removeItem("receiptForm_itemSearch");
    localStorage.removeItem("receiptForm_otherReason");
  }

  function addLine(type: ReceiptLine["type"]) {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, qty: 1, unit_price: "" }
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const estimatedTotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const unit = Number((l.unit_price ?? "").trim());
      const add = (() => {
        const qty = Number.isFinite(l.qty) ? l.qty : 0;
        if (Number.isFinite(unit)) return unit * qty;
        if (l.type === "inventory" && l.item_code) {
          const it = items.find((i) => i.item_code === l.item_code);
          if (it) return it.price * qty;
        }
        // For service, and custom: only use unit_price if provided
        return 0;
      })();
      return sum + add;
    }, 0);
  }, [items, lines]);

  async function refreshReceipts() {
    const supabase = requireSupabase();
    const rec = await supabase
      .from("receipts")
      .select("id,rec_no,number_plate,staff_name,created_at")
      .order("created_at", { ascending: false });
    if (rec.error) throw rec.error;
    setReceipts(rec.data ?? []);
  }

  async function deleteReceiptDirect(id: string, keepStock = false) {
    const supabase = requireSupabase();

    if (keepStock) {
      const { error: delLinesErr } = await supabase.from("receipt_lines").delete().eq("receipt_id", id);
      if (delLinesErr) throw delLinesErr;

      const { error: delErr } = await supabase.from("receipts").delete().eq("id", id);
      if (delErr) throw delErr;

      window.dispatchEvent(new CustomEvent("fixngo:inventory-changed"));
      return;
    }

    const linesRes = await supabase
      .from("receipt_lines")
      .select("line_type,inventory_item_code,spare_part_id,quantity")
      .eq("receipt_id", id);
    if (linesRes.error) throw linesRes.error;

    const inventoryRollbacks: { item_code: string; stock_quantity: number }[] = [];
    const spareRollbacks: { id: string; stock_quantity: number }[] = [];

    const rollback = async () => {
      for (const u of inventoryRollbacks.reverse()) {
        await supabase
          .from("inventory")
          .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
          .eq("item_code", u.item_code);
      }
      for (const u of spareRollbacks.reverse()) {
        await supabase
          .from("spare_parts")
          .update({ stock_quantity: u.stock_quantity, last_updated: new Date().toISOString() })
          .eq("id", u.id);
      }
    };

    try {
      for (const rawLine of linesRes.data ?? []) {
        const line = rawLine as any;
        const qty = Number(line.quantity ?? 1);

        if (line.line_type === "inventory" && line.inventory_item_code) {
          const itemCode = String(line.inventory_item_code).trim();
          if (!itemCode) continue;
          const { data: invRows, error: invErr } = await supabase
            .from("inventory")
            .select("stock_quantity")
            .eq("item_code", itemCode)
            .limit(1);
          if (invErr) throw invErr;
          const inv = invRows?.[0];
          if (!inv) {
            // Older test receipts can point at inventory rows that no longer exist.
            // In that case we skip the rollback and still allow the receipt delete.
            continue;
          }
          inventoryRollbacks.push({
            item_code: itemCode,
            stock_quantity: Number(inv?.stock_quantity ?? 0)
          });
          const { error: updErr } = await supabase
            .from("inventory")
            .update({ stock_quantity: Number(inv?.stock_quantity ?? 0) + qty, last_updated: new Date().toISOString() })
            .eq("item_code", itemCode);
          if (updErr) throw updErr;
        }

        if (line.line_type === "spare_part" && line.spare_part_id) {
          const sparePartId = String(line.spare_part_id).trim();
          if (!sparePartId) continue;
          const { data: spRows, error: spErr } = await supabase
            .from("spare_parts")
            .select("stock_quantity")
            .eq("id", sparePartId)
            .limit(1);
          if (spErr) throw spErr;
          const sp = spRows?.[0];
          if (!sp) {
            // Legacy receipts may reference spare parts that were deleted during testing.
            // We can still delete the receipt even if there is no stock row to restore.
            continue;
          }
          spareRollbacks.push({
            id: sparePartId,
            stock_quantity: Number(sp?.stock_quantity ?? 0)
          });
          const { error: updErr } = await supabase
            .from("spare_parts")
            .update({ stock_quantity: Number(sp?.stock_quantity ?? 0) + qty, last_updated: new Date().toISOString() })
            .eq("id", sparePartId);
          if (updErr) throw updErr;
        }
      }

      const { error: delErr } = await supabase.from("receipts").delete().eq("id", id);
      if (delErr) throw delErr;
      window.dispatchEvent(new CustomEvent("fixngo:inventory-changed"));
    } catch (err) {
      await rollback();
      throw err;
    }
  }

  function toLocalDateKey(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async function clearReceiptsByDateRange() {
    if (!clearFromDate || !clearToDate) {
      alert("Please choose both a start date and an end date.");
      return;
    }

    const from = clearFromDate <= clearToDate ? clearFromDate : clearToDate;
    const to = clearFromDate <= clearToDate ? clearToDate : clearFromDate;
    const targets = receipts.filter((r) => {
      const receiptDate = toLocalDateKey(r.created_at);
      return receiptDate >= from && receiptDate <= to;
    });

    if (!targets.length) {
      alert("No receipts were found in that date range.");
      return;
    }

    const ok = confirm(
      `Clear ${targets.length} receipt(s) from ${from} to ${to} without restocking the used items?`
    );
    if (!ok) return;

    setBulkClearing(true);
    try {
      for (const receipt of targets) {
        await deleteReceiptDirect(receipt.id, true);
      }
      await refreshReceipts();
    } catch (err: any) {
      alert(getApiErrorMessage(err, "Failed to clear receipts"));
    } finally {
      setBulkClearing(false);
    }
  }

  async function saveModifiedReceiptDirect() {
    if (!editId) return null;

    const supabase = requireSupabase();
    const receiptId = editId;
    const originalReceipt = editOriginalReceipt;
    const originalLines = editOriginalLines;
    const originalLineSnapshots: { kind: "inventory" | "spare_part"; id: string; stock_quantity: number }[] = [];
    const appliedLineSnapshots: { kind: "inventory" | "spare_part"; id: string; stock_quantity: number }[] = [];

    const restoreSnapshots = async (
      snapshots: { kind: "inventory" | "spare_part"; id: string; stock_quantity: number }[]
    ) => {
      for (const snap of snapshots.reverse()) {
        if (snap.kind === "inventory") {
          await supabase
            .from("inventory")
            .update({ stock_quantity: snap.stock_quantity, last_updated: new Date().toISOString() })
            .eq("item_code", snap.id);
        } else {
          await supabase
            .from("spare_parts")
            .update({ stock_quantity: snap.stock_quantity, last_updated: new Date().toISOString() })
            .eq("id", snap.id);
        }
      }
    };

    try {
      const seenInventory = new Set<string>();
      const seenSpareParts = new Set<string>();
      for (const row of editLines) {
        if (row.type === "inventory") {
          const key = normalizeLookup(row.item_code);
          if (key && seenInventory.has(key)) {
            throw new Error("The same inventory item cannot appear more than once on the bill.");
          }
          if (key) seenInventory.add(key);
        }
        if (row.type === "spare_part") {
          const key = normalizeLookup(row.spare_part_id || row.description);
          if (key && seenSpareParts.has(key)) {
            throw new Error("The same spare part cannot appear more than once on the bill.");
          }
          if (key) seenSpareParts.add(key);
        }
      }

      for (const line of originalLines) {
        const qty = Number(line.quantity ?? 1);
        if (line.line_type === "inventory" && line.inventory_item_code) {
          const itemCode = String(line.inventory_item_code).trim();
          if (!itemCode) continue;
          const { data: inv, error: invErr } = await supabase
            .from("inventory")
            .select("stock_quantity")
            .eq("item_code", itemCode)
            .single();
          if (invErr) throw invErr;
          const currentStock = Number(inv?.stock_quantity ?? 0);
          originalLineSnapshots.push({ kind: "inventory", id: itemCode, stock_quantity: currentStock });
          const { error: updErr } = await supabase
            .from("inventory")
            .update({ stock_quantity: currentStock + qty, last_updated: new Date().toISOString() })
            .eq("item_code", itemCode);
          if (updErr) throw updErr;
          continue;
        }

        if (line.line_type === "spare_part" && line.spare_part_id) {
          const sparePartId = String(line.spare_part_id).trim();
          if (!sparePartId) continue;
          const { data: sp, error: spErr } = await supabase
            .from("spare_parts")
            .select("stock_quantity")
            .eq("id", sparePartId)
            .single();
          if (spErr) throw spErr;
          const currentStock = Number(sp?.stock_quantity ?? 0);
          originalLineSnapshots.push({ kind: "spare_part", id: sparePartId, stock_quantity: currentStock });
          const { error: updErr } = await supabase
            .from("spare_parts")
            .update({ stock_quantity: currentStock + qty, last_updated: new Date().toISOString() })
            .eq("id", sparePartId);
          if (updErr) throw updErr;
        }
      }

      const { error: receiptUpdateErr } = await supabase
        .from("receipts")
        .update({
          number_plate: editNumberPlate.trim(),
          staff_name: editStaffName.trim(),
          payment_status: editPaymentStatus,
          payment_note: buildPaymentNote(
            editPaymentStatus,
            editPaymentMethod,
            editPaymentNote
          )
        })
        .eq("id", receiptId);
      if (receiptUpdateErr) throw receiptUpdateErr;

      const { error: deleteLinesErr } = await supabase
        .from("receipt_lines")
        .delete()
        .eq("receipt_id", receiptId);
      if (deleteLinesErr) throw deleteLinesErr;

      const unitLines = editLines.map((l) => {
        const unit_raw = (l.unit_price ?? "").trim();
        const parsed = unit_raw.length > 0 ? Number(unit_raw) : NaN;
        const unit_price = Number.isFinite(parsed) ? parsed : null;
        return {
          type: l.type,
          item_code: l.item_code,
          item_name:
            l.type === "inventory" ? getInventoryName(l.item_code) || l.item_name : undefined,
          spare_part_id: l.spare_part_id,
          description: l.description,
          qty: l.qty,
          unit_price
        };
      });

      for (const l of unitLines) {
        const qty = Number(l.qty ?? 1);
        if (l.type === "inventory") {
          const itemCode = (l.item_code ?? "").trim();
          if (!itemCode) throw new Error("inventory item_code is required");

          const invRes = await supabase
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

          appliedLineSnapshots.push({
            kind: "inventory",
            id: itemCode,
            stock_quantity: invRes.data.stock_quantity
          });

          const { error: updErr } = await supabase
            .from("inventory")
            .update({
              stock_quantity: invRes.data.stock_quantity - qty,
              last_updated: new Date().toISOString()
            })
            .eq("item_code", itemCode);
          if (updErr) throw updErr;

          const { error: insErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: "inventory",
            inventory_item_code: itemCode,
            description: invRes.data.item_name,
            quantity: qty,
            unit_price: l.unit_price ?? invRes.data.price ?? null
          });
          if (insErr) throw insErr;
          continue;
        }

        if (l.type === "spare_part") {
          let sparePartId = (l.spare_part_id ?? "").trim();
          const sparePartName = (l.description ?? "").trim();

          if (sparePartId) {
            const spRes = await supabase
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

            appliedLineSnapshots.push({
              kind: "spare_part",
              id: sparePartId,
              stock_quantity: spRes.data.stock_quantity
            });

            const { error: updErr } = await supabase
              .from("spare_parts")
              .update({
                stock_quantity: spRes.data.stock_quantity - qty,
                last_updated: new Date().toISOString()
              })
              .eq("id", sparePartId);
            if (updErr) throw updErr;

            const { error: insErr } = await supabase.from("receipt_lines").insert({
              receipt_id: receiptId,
              line_type: "spare_part",
              spare_part_id: sparePartId,
              description: spRes.data.item_name ?? spRes.data.item_code ?? "Blank",
              quantity: qty,
              unit_price: l.unit_price ?? spRes.data.price ?? null
            });
            if (insErr) throw insErr;
            continue;
          }

          const { error: insErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: "spare_part",
            spare_part_id: null,
            description: sparePartName || "Blank",
            quantity: qty,
            unit_price: l.unit_price ?? null
          });
          if (insErr) throw insErr;
          continue;
        }

        if (l.type === "service" || l.type === "custom") {
          const { error: insErr } = await supabase.from("receipt_lines").insert({
            receipt_id: receiptId,
            line_type: l.type,
            description: (l.description ?? "").trim() || "Blank",
            quantity: qty,
            unit_price: l.unit_price ?? null
          });
          if (insErr) throw insErr;
          continue;
        }

        throw new Error(`invalid line type: ${l.type}`);
      }

      const verify = await supabase.from("receipt_lines").select("id").eq("receipt_id", receiptId);
      if (verify.error) throw verify.error;
      if (!verify.data?.length) {
        throw new Error("Receipt update was saved but no receipt lines were written.");
      }

      return receiptId;
    } catch (err) {
      await restoreSnapshots(appliedLineSnapshots);
      await supabase.from("receipt_lines").delete().eq("receipt_id", receiptId);

        const reinserts = originalLines.map((l) => ({
        receipt_id: receiptId,
        line_type: l.line_type,
        inventory_item_code: l.line_type === "inventory" ? l.inventory_item_code : null,
        spare_part_id: l.line_type === "spare_part" ? l.spare_part_id : null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price
      })).filter(r => r.inventory_item_code || r.spare_part_id || r.description); // skip blank lines

      if (reinserts.length) {
        await supabase.from("receipt_lines").insert(reinserts);
      }

      if (originalReceipt) {
        await supabase
          .from("receipts")
          .update({
            number_plate: originalReceipt.number_plate,
            staff_name: originalReceipt.staff_name,
            payment_status: originalReceipt.payment_status,
            payment_note: originalReceipt.payment_note || null
          })
          .eq("id", receiptId);
      }

      await restoreSnapshots(originalLineSnapshots);
      throw err;
    }
  }

  async function openModify(id: string) {
    const supabase = requireSupabase();
    const receiptRes = await supabase
      .from("receipts")
      .select("id,rec_no,number_plate,staff_name,payment_status,payment_note,created_at")
      .eq("id", id)
      .single();
    if (receiptRes.error) throw receiptRes.error;
    const linesRes = await supabase
      .from("receipt_lines")
      .select(
        "id,line_type,inventory_item_code,spare_part_id,description,quantity,unit_price"
      )
      .eq("receipt_id", id)
      .order("created_at", { ascending: true });
    if (linesRes.error) throw linesRes.error;

    const data = {
      receipt: receiptRes.data as any,
      lines: (linesRes.data ?? []) as Array<{
        id: string;
        line_type: ReceiptEditOriginalLine["line_type"];
        inventory_item_code: string | null;
        spare_part_id: string | null;
        description: string | null;
        quantity: number | null;
        unit_price: number | null;
      }>
    };
    setEditId(id);
    setEditRecNo(data.receipt.rec_no ?? null);
    setEditOriginalReceipt({
      number_plate: data.receipt.number_plate,
      staff_name: data.receipt.staff_name ?? "",
      payment_status: (data.receipt.payment_status ?? "paid") as "paid" | "unpaid" | "other",
      payment_note: data.receipt.payment_note ?? ""
    });
    setEditNumberPlate(data.receipt.number_plate);
    setEditStaffName(data.receipt.staff_name ?? "");
    setEditPaymentStatus((data.receipt.payment_status ?? "paid") as "paid" | "unpaid" | "other");
    const parsedPaymentNote = parsePaymentNote(data.receipt.payment_note);
    setEditPaymentMethod(parsedPaymentNote.method);
    setEditPaymentNote(parsedPaymentNote.otherNote);
    setEditOriginalLines(
      (data.lines ?? []).map((l) => ({
        line_type: l.line_type,
        inventory_item_code: l.inventory_item_code,
        spare_part_id: l.spare_part_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price
      }))
    );
    setEditLines(
      (data.lines ?? []).map((l) => ({
        id: l.id,
        type: l.line_type,
        item_code: l.inventory_item_code ?? undefined,
        item_name:
          l.line_type === "inventory"
            ? getInventoryName(l.inventory_item_code) || undefined
            : undefined,
        spare_part_id: l.spare_part_id ?? undefined,
        description:
          l.line_type === "spare_part"
            ? spareParts.find((part) => part.id === l.spare_part_id)?.item_name ??
              l.description ??
              undefined
            : l.description ?? undefined,
        qty: l.quantity ?? 1,
        unit_price: l.unit_price === null ? "" : String(l.unit_price ?? "")
      }))
    );
    setEditOpen(true);
  }

  return (
    <div className="container">
      <div className="card">
        <div className="cardHeader">
          <div className="row">
            <h1 className="title">Use Inventory</h1>
            <span className="muted">Record item usage and print receipt</span>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit("receipt");
              }}
            >
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="formLabel">Rec. No</div>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "rgba(255,255,255,0.9)" }}>
                  {nextRecNo}
                </div>
              </div>

              <div className="row" style={{ alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="formLabel">Vehicle Number Plate</div>
                  <input
                    className="input"
                    placeholder="e.g. WXY1234"
                    value={numberPlate}
                    onChange={(e) => setNumberPlate(e.target.value)}
                    required
                    disabled={submitting}
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="formLabel">Staff Name</div>
                  <input
                    className="input"
                    placeholder="(optional)"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    disabled={submitting}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div className="hr" />

              <div className="row" style={{ alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div className="formLabel">Search (Inventory/Spare Parts)</div>
                  <input
                    className="input"
                    placeholder="Search item (code / name / company)"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    disabled={submitting}
                    style={{ width: "100%" }}
                  />
                  {itemSearch.trim() ? (
                    <div className="searchDropdown">
{(filteredItems.inv?.length ?? 0) === 0 && (filteredItems.sp?.length ?? 0) === 0 ? (
                        <div className="searchDropdownEmpty">No matches found</div>
                      ) : (
                        <>
                          {filteredItems.inv?.length ? (
                            <div className="searchDropdownGroup">
                              <div className="searchDropdownLabel">Inventory</div>
                              {filteredItems.inv.map((i) => (
                                <button
                                  key={`inv-${i.id}`}
                                  type="button"
                                  className="searchDropdownItem"
                                  onClick={() => addQuickItem(`inventory:${i.id}`)}
                                >
                                  <span className="searchDropdownMain">
                                    {i.item_code} - {i.item_name}
                                  </span>
                                  <span className="searchDropdownSub">
                                    Stock {i.stock_quantity}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {filteredItems.sp.length ? (
                            <div className="searchDropdownGroup">
                              <div className="searchDropdownLabel">Spare Parts</div>
                              {filteredItems.sp.map((i) => (
                                <button
                                  key={`sp-${i.id}`}
                                  type="button"
                                  className="searchDropdownItem"
                                  onClick={() => addQuickItem(`spare:${i.id}`)}
                                >
                                  <span className="searchDropdownMain">
                                    {sparePartLabel(i)}
                                  </span>
                                  <span className="searchDropdownSub">
                                    Stock {i.stock_quantity}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "grid", alignContent: "end", gap: 10 }}>
                  <button className="button" type="button" onClick={() => addLine("inventory")}>
                    + Inventory Item
                  </button>
                  <button className="button" type="button" onClick={() => addLine("spare_part")}>
                    + Spare Part
                  </button>
                </div>
                <div style={{ display: "grid", alignContent: "end", gap: 10 }}>
                  <button className="button" type="button" onClick={() => addLine("service")}>
                    + Service
                  </button>
                  <button
                    className="button"
                    type="button"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                    onClick={() => addLine("custom")}
                  >
                    + Custom
                  </button>
                </div>
              </div>

              <div className="hr" />

              <div className="tableWrap">
                <table style={{ minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Type</th>
                      <th>Description / Item</th>
                      <th style={{ width: 120 }}>Qty</th>
                      <th style={{ width: 160 }}>Unit Price (optional)</th>
                      <th style={{ width: 160 }}>Line Total</th>
                      <th style={{ width: 110 }}>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const unit = Number((l.unit_price ?? "").trim());
                      const qty = Number.isFinite(l.qty) ? l.qty : 0;
                      const lineTotal = (() => {
                        if (Number.isFinite(unit)) return unit * qty;
                        if (l.type === "inventory" && l.item_code) {
                          const it = items.find((i) => i.item_code === l.item_code);
                          if (it) return it.price * qty;
                        }
                        // For spare parts, service, and custom: only use unit_price if provided
                        return 0;
                      })();
                      return (
                        <tr key={l.id}>
                          <td>
                            <select
                              className="select"
                              value={l.type}
                              disabled={submitting}
                              onChange={(e) => {
                                const nextType = e.target.value as ReceiptLine["type"];
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id
                                      ? {
                                          ...x,
                                          type: nextType,
                                          item_code: nextType === "inventory" ? "" : undefined,
                                          item_name: nextType === "inventory" ? "" : undefined,
                                          spare_part_id:
                                            nextType === "spare_part" ? "" : undefined,
                                          description:
                                            nextType === "service" || nextType === "custom"
                                              ? ""
                                              : undefined
                                        }
                                      : x
                                  )
                                );
                              }}
                            >
                              <option value="inventory">Inventory</option>
                              <option value="spare_part">Spare Parts</option>
                              <option value="service">Service</option>
                              <option value="custom">Custom</option>
                            </select>
                          </td>
                          <td>
                            {l.type === "inventory" ? (
                              <select
                                className="select"
                                value={l.item_code ?? ""}
                                disabled={submitting}
                                onChange={(e) => {
                                  const nextCode = e.target.value;
                                  if (nextCode && hasDuplicateBillItem({
                                    id: l.id,
                                    type: "inventory",
                                    item_code: nextCode,
                                    item_name: "",
                                    qty: l.qty,
                                    unit_price: l.unit_price
                                  }, l.id)) {
                                    setError("The same inventory item cannot appear more than once on the bill.");
                                    return;
                                  }
                                  setLines((prev) => {
                                    const it = items.find((i) => i.item_code === nextCode);
                                    return prev.map((x) =>
                                      x.id === l.id
                                        ? {
                                            ...x,
                                            item_code: nextCode,
                                            item_name: it ? it.item_name : "",
                                            unit_price:
                                              (x.unit_price ?? "").trim().length > 0
                                                ? x.unit_price
                                                : it
                                                  ? it.price.toFixed(2)
                                                  : ""
                                          }
                                        : x
                                    );
                                  });
                                }}
                                style={{ width: "100%" }}
                              >
                                <option value="">Choose item...</option>
                                {items.map((i: InventoryItem) => (
                                  <option key={i.id} value={i.item_code}>
                                    {i.item_code} - {i.item_name} (stock: {i.stock_quantity})
                                  </option>
                                )) || []}
                              </select>
                            ) : l.type === "spare_part" ? (
                              <input
                                className="input"
                                placeholder="Type what you want to add"
                                value={l.description ?? ""}
                                disabled={submitting}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((x) =>
                                      x.id === l.id
                                        ? {
                                            ...x,
                                            description: e.target.value,
                                            spare_part_id: undefined
                                          }
                                        : x
                                    )
                                  )
                                }
                                style={{ width: "100%" }}
                              />
                            ) : (
                              <input
                                className="input"
                                placeholder="(optional) description"
                                value={l.description ?? ""}
                                disabled={submitting}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((x) =>
                                      x.id === l.id
                                        ? { ...x, description: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                style={{ width: "100%" }}
                              />
                            )}
                          </td>
                          <td>
                          <input
                              className="input"
                              type="number"
                              min={0.01}
                              step="0.01"
                              inputMode="decimal"
                              value={l.qty}
                              disabled={submitting}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setLines((prev) =>
                                  prev.map((x) => (x.id === l.id ? { ...x, qty: v } : x))
                                );
                              }}
                              onFocus={(e) => e.currentTarget.select()}
                              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                              style={{ width: "100%" }}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              placeholder="Blank"
                              value={l.unit_price ?? ""}
                              disabled={submitting}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id
                                      ? { ...x, unit_price: e.target.value }
                                      : x
                                  )
                                )
                              }
                              style={{ width: "100%" }}
                            />
                          </td>
                          <td>{formatMYR(lineTotal)}</td>
                          <td>
                            <button
                              className="button buttonDanger"
                              type="button"
                              onClick={() => removeLine(l.id)}
                              disabled={submitting || lines.length <= 1}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <div className="muted" style={{ flex: 1 }}>
                  Estimated total (blank prices count as RM 0.00)
                </div>
                <div style={{ fontWeight: 800 }}>{formatMYR(estimatedTotal)}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <div className="formLabel" style={{ marginBottom: 4 }}>
                    Payment Status
                  </div>
                  <select 
                    className="select"
                    style={{ minWidth: 140, fontSize: 14 }}
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as "paid" | "unpaid" | "other")}
                    disabled={submitting}
                  >
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {paymentStatus === "other" ? (
                  <div style={{ marginTop: 8 }}>
                    <input
                      className="input"
                      value={otherReason}
                      onChange={(e) => setOtherReason(e.target.value)}
                      placeholder="Reason for reference only"
                      disabled={submitting}
                      style={{ minWidth: 260 }}
                    />
                    <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                      This note is for your reference only and will not appear in the cash bill PDF.
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <div className="formLabel" style={{ marginBottom: 4 }}>
                    Payment Method
                  </div>
                  <select
                    className="select"
                    style={{ minWidth: 140, fontSize: 14 }}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "cash")}
                    disabled={submitting}
                  >
                    <option value="cash">Cash</option>
                </select>
              </div>
              </div>

              <div className="row" style={{ marginTop: 14, justifyContent: "flex-end", gap: 12 }}>
                <button
                  className="button"
                  type="button"
                  style={{ background: "rgba(255,88,118,0.1)", border: "1px solid rgba(255,88,118,0.3)" }}
                  onClick={clearForm}
                  disabled={submitting}
                >
                  Clear Form
                </button>
                <button
                  className="button"
                  type="button"
                  style={{ minWidth: 180 }}
                  onClick={() => void submit("receipt")}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit & Receipt"}
                </button>
                <button
                  className="button"
                  type="button"
                  style={{ minWidth: 180, background: "rgba(255,255,255,0.06)" }}
                  onClick={() => void submit("receipt")}
                  disabled={submitting}
                >
                  Preview PDF
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div className="row">
            <h2 className="title" style={{ fontSize: 18 }}>
              All Receipts
            </h2>
            <span className="muted">{`${receipts.length} receipts`}</span>
            <div className="spacer" />
            <button
              className="button"
              type="button"
              onClick={async () => {
                await refreshReceipts();
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 12, alignItems: "flex-end" }}>
            <div>
              <div className="formLabel" style={{ marginBottom: 4 }}>
                From date
              </div>
              <input
                className="input"
                type="date"
                value={clearFromDate}
                onChange={(e) => setClearFromDate(e.target.value)}
                disabled={bulkClearing}
              />
            </div>
            <div>
              <div className="formLabel" style={{ marginBottom: 4 }}>
                To date
              </div>
              <input
                className="input"
                type="date"
                value={clearToDate}
                onChange={(e) => setClearToDate(e.target.value)}
                disabled={bulkClearing}
              />
            </div>
            <button
              className="button buttonDanger"
              type="button"
              onClick={() => void clearReceiptsByDateRange()}
              disabled={bulkClearing}
            >
              {bulkClearing ? "Clearing..." : "Clear Records Only"}
            </button>
            <div className="muted" style={{ fontSize: 12, maxWidth: 380 }}>
              This deletes receipts in the selected date range without restocking inventory or spare parts.
            </div>
          </div>
          <div className="tableWrap">
            <table style={{ minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th>Rec. No</th>
                      <th>Number Plate</th>
                      <th>Date (DD/MM/YYYY)</th>
                      <th>Staff Name</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rec_no}</td>
                    <td>{r.number_plate}</td>
                    <td>
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      }).format(new Date(r.created_at))}
                    </td>
                    <td>{r.staff_name || <span className="reqHint">Blank</span>}</td>
                    <td>
                      <div className="row">
                        <button
                          className="button"
                          type="button"
                          onClick={() => nav(`/receipt/${r.id}`)}
                        >
                          View
                        </button>
                        <button
                          className="button"
                          type="button"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                          onClick={() => void openModify(r.id)}
                        >
                          Modify
                        </button>
                        <button
                          className="button"
                          type="button"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                          onClick={() => nav(`/receipt/${r.id}`)}
                        >
                          Preview PDF
                        </button>
                        <button
                          className="button buttonDanger"
                          type="button"
                          onClick={async () => {
                            const ok = confirm(
                              "Are you sure you want to delete this receipt and restock the used items?"
                            );
                            if (!ok) return;
                            try {
                              await deleteReceiptDirect(r.id);
                              await refreshReceipts();
                            } catch (err: any) {
                              alert(getApiErrorMessage(err, "Failed to delete receipt"));
                            }
                          }}
                        >
                          Delete & Restock
                        </button>
                        <button
                          className="button buttonDanger"
                          type="button"
                          onClick={async () => {
                            const ok = confirm(
                              "Are you sure you want to delete this receipt without restocking the used items?"
                            );
                            if (!ok) return;
                            try {
                              await deleteReceiptDirect(r.id, true);
                              await refreshReceipts();
                            } catch (err: any) {
                              alert(getApiErrorMessage(err, "Failed to delete receipt"));
                            }
                          }}
                        >
                          Clear Record Only
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!receipts.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No receipts yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={editOpen}
        title={editId ? `Modify Receipt` : "Modify Receipt"}
        solid
        width="min(1280px, 98vw)"
        maxHeight="calc(100vh - 24px)"
        cardClassName="receiptModifyModal"
        onClose={() => {
          setEditOpen(false);
          setEditId(null);
          setEditOriginalLines([]);
          setEditOriginalReceipt(null);
          setEditPaymentNote("");
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editId) return;
            try {
              const savedReceiptId = await saveModifiedReceiptDirect();
              setEditOpen(false);
              setEditId(null);
              setEditOriginalLines([]);
              setEditOriginalReceipt(null);
              setEditPaymentNote("");
              window.dispatchEvent(new CustomEvent("fixngo:inventory-changed"));
              if (savedReceiptId) {
                nav(`/receipt/${savedReceiptId}`);
              }
            } catch (err: any) {
              setError(getApiErrorMessage(err, "Failed to save receipt changes"));
            }
          }}
        >
          <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12
              }}
            >
              <div>
                <div className="formLabel">Rec. No</div>
                <input
                  className="input"
                  type="text"
                  value={editRecNo ?? ""}
                  disabled
                  style={{ width: "100%", opacity: 0.7 }}
                />
              </div>
              <div>
                <div className="formLabel">Vehicle Number Plate</div>
                <input
                  className="input"
                  value={editNumberPlate}
                  onChange={(e) => setEditNumberPlate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <div className="formLabel">Staff Name</div>
                <input
                  className="input"
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <div className="formLabel">Payment Status</div>
                <select
                  className="select"
                  value={editPaymentStatus}
                  onChange={(e) =>
                    setEditPaymentStatus(e.target.value as "paid" | "unpaid" | "other")
                  }
                  style={{ width: "100%" }}
                >
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
                {editPaymentStatus === "other" ? (
                  <div style={{ marginTop: 2 }}>
                    <input
                      className="input"
                      value={editPaymentNote}
                      onChange={(e) => setEditPaymentNote(e.target.value)}
                      placeholder="Reason for reference only"
                      style={{ width: "100%" }}
                    />
                    <div className="muted" style={{ marginTop: 2, fontSize: 10, lineHeight: 1.05 }}>
                      Saved with the receipt, but not printed on the cash bill PDF.
                    </div>
                  </div>
                ) : null}
              </div>
              <div>
                <div className="formLabel">Payment Method</div>
                  <select
                    className="select"
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value as "cash")}
                    style={{ width: "100%" }}
                  >
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="hr" style={{ marginTop: 0, marginBottom: 0 }} />

            <div
              className="muted"
              style={{ textAlign: "center", marginBottom: 0, fontSize: 10, lineHeight: 1.05 }}
            >
              You can edit all receipt details, items, quantities, and prices.
            </div>

            <div className="tableWrap receiptModifyTableWrap" style={{ marginTop: -6 }}>
              <table style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description / Item</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((l) => {
                    return (
                      <tr key={l.id}>
                        <td style={{ minWidth: 140 }}>
                          <select
                            className="select"
                            value={l.type}
                            onChange={(e) => {
                              const nextType = e.target.value as ReceiptLine["type"];
                              setEditLines((prev) =>
                                prev.map((x) =>
                                  x.id === l.id
                                    ? {
                                        ...x,
                                        type: nextType,
                                        item_code: nextType === "inventory" ? "" : undefined,
                                        item_name: nextType === "inventory" ? "" : undefined,
                                        spare_part_id:
                                          nextType === "spare_part" ? "" : undefined,
                                        description:
                                          nextType === "service" || nextType === "custom"
                                            ? ""
                                            : undefined
                                      }
                                    : x
                                )
                              );
                            }}
                          >
                            <option value="inventory">Inventory</option>
                            <option value="spare_part">Spare Parts</option>
                            <option value="service">Service</option>
                            <option value="custom">Custom</option>
                          </select>
                        </td>
                        <td>
                          {l.type === "inventory" ? (
                            <select
                              className="select"
                              value={l.item_code ?? ""}
                              onChange={(e) => {
                                const nextCode = e.target.value;
                                const item = items.find((i) => i.item_code === nextCode);
                                setEditLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id
                                      ? {
                                          ...x,
                                          item_code: nextCode,
                                          item_name: item ? item.item_name : "",
                                          unit_price:
                                            (x.unit_price ?? "").trim().length > 0
                                              ? x.unit_price
                                              : item
                                                ? item.price.toFixed(2)
                                                : ""
                                        }
                                      : x
                                  )
                                );
                              }}
                              style={{ width: "100%" }}
                            >
                              <option value="">Choose item...</option>
                              {items.map((i) => (
                                <option key={i.id} value={i.item_code}>
                                  {i.item_code} - {i.item_name} (stock: {i.stock_quantity})
                                </option>
                              ))}
                            </select>
                          ) : l.type === "spare_part" ? (
                            <input
                              className="input"
                              placeholder="Type what you want to add"
                              value={l.description ?? ""}
                              onChange={(e) => {
                                const nextValue = e.target.value;
                                if (
                                  nextValue &&
                                  hasDuplicateEditBillItem(
                                    {
                                      id: l.id,
                                      type: "spare_part",
                                      description: nextValue,
                                      qty: l.qty,
                                      unit_price: l.unit_price
                                    },
                                    l.id
                                  )
                                ) {
                                  setError("The same spare part cannot appear more than once on the bill.");
                                  return;
                                }
                                setEditLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id
                                      ? {
                                          ...x,
                                          description: nextValue,
                                          spare_part_id: undefined
                                        }
                                      : x
                                  )
                                );
                              }}
                              style={{ width: "100%" }}
                            />
                          ) : (
                            <input
                              className="input"
                              placeholder="(optional) description"
                              value={l.description ?? ""}
                              onChange={(e) =>
                                setEditLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id ? { ...x, description: e.target.value } : x
                                  )
                                )
                              }
                            />
                          )}
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={0.01}
                            step="0.01"
                            inputMode="decimal"
                            value={l.qty}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEditLines((prev) =>
                                prev.map((x) => (x.id === l.id ? { ...x, qty: v } : x))
                              );
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                          />
                        </td>
                        <td>
                            <input
                              className="input"
                              placeholder="Blank"
                              value={l.unit_price ?? ""}
                              onChange={(e) =>
                                setEditLines((prev) =>
                                  prev.map((x) =>
                                    x.id === l.id ? { ...x, unit_price: e.target.value } : x
                                  )
                                )
                              }
                            />
                        </td>
                        <td>
                          <button
                            className="button buttonDanger"
                            type="button"
                            onClick={() =>
                              setEditLines((prev) => prev.filter((x) => x.id !== l.id))
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="button"
                  type="button"
                  onClick={() =>
                    setEditLines((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        type: "inventory",
                        item_code: "",
                        item_name: "",
                        qty: 1,
                        unit_price: ""
                      }
                    ])
                  }
                >
                + Inventory Item
              </button>
              <button
                className="button"
                type="button"
                style={{ background: "rgba(255,255,255,0.06)" }}
                onClick={() =>
                  setEditLines((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), type: "spare_part", spare_part_id: "", qty: 1, unit_price: "" }
                  ])
                }
              >
                + Spare Part
              </button>
              <button
                className="button"
                type="button"
                onClick={() =>
                  setEditLines((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), type: "service", description: "", qty: 1, unit_price: "" }
                  ])
                }
              >
                + Service
              </button>
              <button
                className="button"
                type="button"
                style={{ background: "rgba(255,255,255,0.06)" }}
                onClick={() =>
                  setEditLines((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), type: "custom", description: "", qty: 1, unit_price: "" }
                  ])
                }
              >
                + Custom
              </button>
            </div>

            <button className="button" type="submit" style={{ marginTop: 10 }}>
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
