import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatMYR } from "../lib/money";
import { requireSupabase } from "../lib/supabase";
import { getApiErrorMessage } from "../lib/errors";
import {
  buildReceiptPdfFilename,
  createReceiptPdfBlob,
  printReceiptPdfBlob,
  saveReceiptPdf
} from "../lib/receiptPdf";

type LegacyTransaction = {
  id: string;
  job_id: string;
  item_type: "inventory" | "spare_part";
  item_code: string | null;
  item_name: string | null;
  service_description: string | null;
  quantity_used: number;
  price: number;
  total_price: number;
  number_plate: string;
  staff_name: string;
  date: string;
  time: string;
};

type Receipt = {
  id: string;
  rec_no: number | null;
  job_id: string;
  number_plate: string;
  staff_name: string;
  created_at: string;
};

type ReceiptLine = {
  id: string;
  line_type: "inventory" | "spare_part" | "service" | "custom";
  inventory_item_code: string | null;
  spare_part_id: string | null;
  description: string | null;
  item_name_print: string | null;
  item_id_print: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
  created_at: string;
};

export function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [legacyTx, setLegacyTx] = useState<LegacyTransaction | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSaved, setPdfSaved] = useState(false);

  function formatDDMM(date: Date) {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit" }).format(
      date
    );
  }

  function formatFullDate(date: Date) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  }

  function buildPdfData() {
    return {
      receiptNo: receipt ? String(receipt.rec_no ?? receipt.id) : legacyTx?.job_id || "",
      numberPlate: receipt ? receipt.number_plate : legacyTx?.number_plate || "",
      staffName: receipt ? receipt.staff_name || "Blank" : legacyTx?.staff_name || "Blank",
      dateLabel: receipt
        ? new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          }).format(new Date(receipt.created_at))
        : legacyTx
          ? new Intl.DateTimeFormat("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric"
            }).format(new Date(legacyTx.date))
          : "",
      lines: receipt
        ? lines.map((l) => ({
            name: l.item_name_print ?? l.description ?? "Blank",
            itemId: l.item_id_print ?? "-",
            qty: l.quantity ?? 1,
            unitPrice: Number(l.unit_price ?? 0),
            total: Number(l.line_total ?? 0)
          }))
        : legacyTx
          ? [
              {
                name: legacyTx.item_name || "Blank",
                itemId: legacyTx.item_code || "-",
                qty: legacyTx.quantity_used,
                unitPrice: Number(legacyTx.price),
                total: Number(legacyTx.total_price)
              }
            ]
          : [],
      total: receipt ? total : legacyTx ? Number(legacyTx.total_price) : 0,
      note: "Keep this receipt for your records."
    };
  }

  async function handleSaveReceipt() {
    const pdfData = buildPdfData();

    if (!pdfData.receiptNo || !pdfData.numberPlate) return;

    setPdfBusy(true);
    try {
      const blob = createReceiptPdfBlob(pdfData);
      const filename = buildReceiptPdfFilename(pdfData);
      const saved = await saveReceiptPdf(blob, filename);
      if (saved === null) return;
      setPdfSaved(true);
      setError(
        saved === false
          ? "PDF downloaded. To choose a specific drive or folder, use Chrome or Edge."
          : null
      );
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to save the receipt PDF"));
    } finally {
      setPdfBusy(false);
    }
  }

  async function handlePrintReceipt() {
    const pdfData = buildPdfData();

    if (!pdfData.receiptNo || !pdfData.numberPlate) return;

    setPdfBusy(true);
    try {
      const blob = createReceiptPdfBlob(pdfData, { autoPrint: true });
      await printReceiptPdfBlob(blob);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to open the print dialog"));
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setError(null);
    setLegacyTx(null);
    setReceipt(null);
    setLines([]);
    setTotal(0);
    setPdfSaved(false);

    (async () => {
      try {
        const supabase = requireSupabase();
        const receiptRes = await supabase
          .from("receipts")
          .select("id,rec_no,number_plate,staff_name,created_at")
          .eq("id", id)
          .maybeSingle();
        if (receiptRes.error) throw receiptRes.error;

        if (receiptRes.data) {
          const linesRes = await supabase
            .from("receipt_lines")
            .select(
              "id,line_type,inventory_item_code,spare_part_id,description,quantity,unit_price,created_at"
            )
            .eq("receipt_id", id)
            .order("created_at", { ascending: true });
          if (linesRes.error) throw linesRes.error;

          const sparePartIds = (linesRes.data ?? [])
            .filter((l: any) => l.line_type === "spare_part" && l.spare_part_id)
            .map((l: any) => l.spare_part_id as string);
          const inventoryCodes = (linesRes.data ?? [])
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
            const { data: spRows, error: spErr } = await supabase
              .from("spare_parts")
              .select("id,item_code,item_name")
              .in("id", Array.from(new Set(sparePartIds)));
            if (spErr) throw spErr;
            for (const r of spRows ?? []) {
              sparePartMap.set(r.id as string, {
                item_code: (r as any).item_code ?? null,
                item_name: (r as any).item_name ?? null
              });
            }
          }

          if (inventoryCodes.length) {
            const { data: invRows, error: invErr } = await supabase
              .from("inventory")
              .select("item_code,item_name")
              .in("item_code", Array.from(new Set(inventoryCodes)));
            if (invErr) throw invErr;
            for (const r of invRows ?? []) {
              inventoryMap.set(String((r as any).item_code ?? "").trim(), {
                item_code: (r as any).item_code ?? null,
                item_name: (r as any).item_name ?? null
              });
            }
          }

          const safeLines = (linesRes.data ?? []).map((l: any) => {
            const qty = typeof l.quantity === "number" ? l.quantity : null;
            const unit = typeof l.unit_price === "number" ? Number(l.unit_price) : null;
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
                ? (inventoryResolved?.item_name ?? l.description ?? l.inventory_item_code ?? null)
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

          const total = safeLines.reduce((sum, l: any) => sum + (l.line_total ?? 0), 0);
          setReceipt(receiptRes.data as any);
          setLines(safeLines as any);
          setTotal(Number(total));
          return;
        }

        const legacyRes = await supabase
          .from("transactions")
          .select(
            "id,job_id,item_type,item_code,item_name,service_description,quantity_used,price,total_price,number_plate,staff_name,date,time"
          )
          .eq("id", id)
          .maybeSingle();
        if (legacyRes.error) throw legacyRes.error;
        if (legacyRes.data) {
          setLegacyTx(legacyRes.data as any);
          setTotal(Number((legacyRes.data as any).total_price ?? 0));
          return;
        }

        setError("Receipt not found.");
      } catch (fallbackErr: any) {
        setError(getApiErrorMessage(fallbackErr, "Failed to load receipt"));
      }
    })();
  }, [id]);

  useEffect(() => {
    const original = document.title;
    const safe = (v: string) =>
      v.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

    if (receipt) {
      const ddmm = formatDDMM(new Date(receipt.created_at)).replace("/", "-");
      document.title = safe(
        `Rec_${receipt.rec_no ?? receipt.job_id}_${receipt.number_plate}_${ddmm}`
      );
      return () => {
        document.title = original;
      };
    }

    if (legacyTx) {
      const ddmm = formatDDMM(new Date(legacyTx.date)).replace("/", "-");
      document.title = safe(
        `Rec_${legacyTx.job_id}_${legacyTx.number_plate}_${ddmm}`
      );
      return () => {
        document.title = original;
      };
    }
  }, [legacyTx, receipt]);

  return (
    <div className="container">
      <div className="card receiptCard" style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="cardHeader" style={{ position: "relative" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h1 className="title">Cash Bill</h1>
            </div>

            {(receipt || legacyTx) && (
              <div
                style={{
                  position: "absolute",
                  right: 16,
                  top: 16,
                  textAlign: "right"
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  Rec. No
                </div>
                <div style={{ fontWeight: 700 }}>
                  {receipt?.rec_no ?? legacyTx?.job_id}
                </div>
              </div>
            )}
          </div>
          <div className="muted noPrint" style={{ marginTop: 10 }}>
            Save the receipt PDF to any drive or folder first, then print it from the PDF viewer.
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
          <div className="row noPrint" style={{ marginBottom: 14, gap: 8 }}>
            <button
              className="button"
              type="button"
              onClick={() => void handleSaveReceipt()}
              disabled={pdfBusy}
            >
              {pdfBusy ? "Preparing..." : pdfSaved ? "Re-save PDF" : "Save PDF"}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void handlePrintReceipt()}
              disabled={pdfBusy}
            >
              {pdfBusy ? "Opening..." : "Print"}
            </button>
            <button
              className="button"
              type="button"
              onClick={() => navigate("/use")}
            >
              Back to Cash Bill
            </button>
          </div>
          {pdfSaved ? (
            <div className="muted noPrint" style={{ marginBottom: 14 }}>
              PDF saved. You can now print it whenever you are ready.
            </div>
          ) : (
            <div className="muted noPrint" style={{ marginBottom: 14 }}>
              You can save the PDF or print it directly.
            </div>
          )}
          {!receipt && !legacyTx ? (
            <div className="muted">Loading...</div>
          ) : receipt ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Fix n Go Garage</div>
              <div style={{ fontSize: 12, lineHeight: 1.4, marginTop: 4 }}>
                Address: 827, Jln Industri, Taman Bandar Baru Selatan, 31900 Kampar, Perak
                <br />
                Phone: 016-503 7814
              </div>
              <div className="hr" />
              <div className="row printOnly">
                <div style={{ flex: 1 }}>
                  <div className="muted">Vehicle Number Plate</div>
                  <div>{receipt.number_plate}</div>
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="muted">Date</div>
                  <div>{formatFullDate(new Date(receipt.created_at))}</div>
                </div>
              </div>

              <div className="tableWrap receiptTableWrap">
                <table style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Item ID</th>
                      <th>Qty</th>
                      <th>Price per unit</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.item_name_print ?? l.description ?? "Blank"}</td>
                        <td>{l.item_id_print ?? "-"}</td>
                        <td>{l.quantity ?? 1}</td>
                        <td>
                          {l.unit_price === null || l.unit_price === undefined
                            ? "Blank"
                            : formatMYR(Number(l.unit_price))}
                        </td>
                        <td>{formatMYR(Number(l.line_total ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="muted">Total price</div>
                  <div style={{ fontWeight: 800 }}>{formatMYR(Number(total))}</div>
                </div>
              </div>
            </div>
          ) : legacyTx ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Fix n Go Garage</div>
              <div className="hr" />
              <div className="row printOnly">
                <div style={{ flex: 1 }}>
                  <div className="muted">Job ID</div>
                  <div>{legacyTx.job_id}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted">Vehicle Number Plate</div>
                  <div>{legacyTx.number_plate}</div>
                </div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="muted">Item</div>
                  <div>
                    {legacyTx.item_name || "Blank"} ({legacyTx.item_code || "Blank"}){" "}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted">Quantity Used</div>
                  <div>{legacyTx.quantity_used}</div>
                </div>
              </div>
              {legacyTx.service_description ? (
                <div>
                  <div className="muted">Service Performed</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {legacyTx.service_description}
                  </div>
                </div>
              ) : null}
              <div className="tableWrap receiptTableWrap">
                <table style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Item ID</th>
                      <th>Qty</th>
                      <th>Price per unit</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{legacyTx.item_name || "Blank"}</td>
                      <td>{legacyTx.item_code || "-"}</td>
                      <td>{legacyTx.quantity_used}</td>
                      <td>{formatMYR(Number(legacyTx.price))}</td>
                      <td>{formatMYR(Number(legacyTx.total_price))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <div className="muted">Price per item</div>
                  <div>{formatMYR(Number(legacyTx.price))}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted">Total price</div>
                  <div style={{ fontWeight: 800 }}>
                    {formatMYR(Number(legacyTx.total_price))}
                  </div>
                </div>
              </div>
              <div className="row printOnly">
                <div style={{ flex: 1 }}>
                  <div className="muted">Date / Time</div>
                  <div>
                    {formatFullDate(new Date(legacyTx.date))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
