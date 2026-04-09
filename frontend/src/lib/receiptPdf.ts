import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMYR } from "./money";

export type ReceiptPdfLine = {
  name: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type ReceiptPdfData = {
  receiptNo: string;
  numberPlate: string;
  staffName: string;
  dateLabel: string;
  paymentMethod?: "cash" | "bank" | "other";
  bankNumber?: string;
  lines: ReceiptPdfLine[];
  total: number;
  note?: string;
};

type ReceiptPdfOptions = {
  autoPrint?: boolean;
};

function safeFilename(text: string) {
  return text.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

export function parseReceiptPaymentNote(note?: string | null) {
  const trimmed = (note ?? "").trim();
  if (!trimmed) {
    return { paymentMethod: "cash" as const, bankNumber: "", otherNote: "" };
  }
  if (trimmed.toLowerCase().startsWith("bank:")) {
    return {
      paymentMethod: "bank" as const,
      bankNumber: trimmed.slice(5).trim(),
      otherNote: ""
    };
  }
  return {
    paymentMethod: "other" as const,
    bankNumber: "",
    otherNote: trimmed
  };
}

export function buildReceiptPdfFilename(data: ReceiptPdfData) {
  return safeFilename(
    `Rec_${data.receiptNo}_${data.numberPlate}_${data.dateLabel}`.replace(/\s+/g, "_")
  ) + ".pdf";
}

export function createReceiptPdfBlob(data: ReceiptPdfData, options?: ReceiptPdfOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 24;
  let cursorY = 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("FIX & GO", marginX, cursorY);

  cursorY += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("202103371410 (PG0522795-T)", marginX, cursorY);

  cursorY += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Address: 827, Jln Industri, Taman Bandar Baru Selatan, 31900 Kampar, Perak", marginX, cursorY, {
    maxWidth: pageWidth - marginX * 2
  });
  cursorY += 15;
  doc.text("Phone: 016-503 7814", marginX, cursorY);

  cursorY += 18;

  const labelColor: [number, number, number] = [100, 100, 100];
  const textColor: [number, number, number] = [0, 0, 0];
  doc.setTextColor(...labelColor);
  doc.setFontSize(11);
  doc.text("Receipt No", marginX, cursorY);
  doc.text("Vehicle Number Plate", pageWidth / 2, cursorY);
  cursorY += 16;
  doc.setTextColor(...textColor);
  doc.setFont("helvetica", "bold");
  doc.text(data.receiptNo || "-", marginX, cursorY);
  doc.text(data.numberPlate || "-", pageWidth / 2, cursorY);

  cursorY += 20;
  doc.setTextColor(...labelColor);
  doc.setFont("helvetica", "normal");
  doc.text("Staff Name", marginX, cursorY);
  doc.text("Date", pageWidth / 2, cursorY);
  cursorY += 16;
  doc.setTextColor(...textColor);
  doc.setFont("helvetica", "bold");
  doc.text(data.staffName || "Blank", marginX, cursorY);
  doc.text(data.dateLabel || "-", pageWidth / 2, cursorY);

  cursorY += 20;
  doc.setTextColor(...labelColor);
  doc.setFont("helvetica", "normal");
  doc.text("Payment Method", marginX, cursorY);
  if (data.paymentMethod === "bank") {
    doc.text("Bank Number", pageWidth / 2, cursorY);
  }
  cursorY += 16;
  doc.setTextColor(...textColor);
  doc.setFont("helvetica", "bold");
  doc.text(
    data.paymentMethod ? data.paymentMethod.charAt(0).toUpperCase() + data.paymentMethod.slice(1) : "Cash",
    marginX,
    cursorY
  );
  if (data.paymentMethod === "bank") {
    doc.text(data.bankNumber || "-", pageWidth / 2, cursorY);
  }

  cursorY += 18;
  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    tableWidth: pageWidth - marginX * 2,
    head: [["Name", "Item ID", "Qty", "Price per unit", "Total"]],
    body: data.lines.length
      ? data.lines.map((line) => [
          line.name || "Blank",
          line.itemId || "-",
          String(line.qty ?? 1),
          formatMYR(Number(line.unitPrice ?? 0)),
          formatMYR(Number(line.total ?? 0))
        ])
      : [["Blank", "-", "0", formatMYR(0), formatMYR(0)]],
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 6,
      lineColor: [255, 255, 255],
      lineWidth: 0,
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255]
    },
    theme: "plain"
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? cursorY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total price: ${formatMYR(Number(data.total ?? 0))}`, marginX, finalY + 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const noteY = finalY + 40;
  doc.text(data.note || "Keep this receipt for your records", marginX, noteY);
  doc.setFontSize(9);
  doc.text("Bank: 8605049382", marginX, noteY + 14);
  doc.text("Cimb", marginX, noteY + 28);
  doc.text("FIX & GO GARAGE", marginX, noteY + 42);

  if (options?.autoPrint) {
    doc.autoPrint({ variant: "non-conform" });
  }

  return doc.output("blob");
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

export async function saveReceiptPdf(blob: Blob, suggestedName: string) {
  const maybeWindow = window as Window & { showSaveFilePicker?: SaveFilePicker };

  if (typeof maybeWindow.showSaveFilePicker === "function") {
    try {
      const handle = await maybeWindow.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "PDF Document",
            accept: { "application/pdf": [".pdf"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") {
        return null;
      }
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return false;
}

function initializeReceiptPrintWindow(win: Window) {
  win.document.open();
  win.document.write(`<!doctype html>
<html>
  <head>
    <title>Print Receipt</title>
    <style>
      html, body { margin: 0; height: 100%; background: #fff; overflow: hidden; }
      iframe { border: 0; width: 100vw; height: 100vh; display: block; }
    </style>
  </head>
  <body>
    <iframe id="pdfFrame" title="Receipt PDF"></iframe>
  </body>
</html>`);
  win.document.close();
}

function printPdfInWindow(win: Window, url: string) {
  const frame = win.document.getElementById("pdfFrame") as HTMLIFrameElement | null;
  if (!frame) throw new Error("Unable to open the receipt for printing.");

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    const pdfWindow = frame.contentWindow;
    if (pdfWindow) {
      pdfWindow.focus();
      pdfWindow.print();
    } else {
      win.focus();
      win.print();
    }
    window.setTimeout(() => win.close(), 1000);
  };

  frame.onload = triggerPrint;
  frame.src = url;
  window.setTimeout(triggerPrint, 1500);
}

export function openPdfPrintWindow(url: string, existingWindow?: Window | null) {
  const win = existingWindow ?? window.open("", "_blank");
  if (!win) throw new Error("Popup blocked. Please allow popups to print the receipt.");

  initializeReceiptPrintWindow(win);
  printPdfInWindow(win, url);
}

export function openReceiptPdfWindow(url: string) {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    win.focus();
    return true;
  }

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return false;
}

export async function printReceiptPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.title = "Receipt PDF";
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      let printed = false;
      const cleanup = () => {
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 500);
      };

      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        const win = frame.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error("Unable to open the receipt for printing."));
          return;
        }

        try {
          win.focus();
          win.print();
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      frame.onload = () => window.setTimeout(triggerPrint, 400);
      frame.onerror = () => {
        cleanup();
        reject(new Error("Failed to load the receipt PDF for printing."));
      };

      frame.src = url;
      window.setTimeout(triggerPrint, 2500);
    });
  } catch (err) {
    frame.remove();
    URL.revokeObjectURL(url);
    throw err;
  }
}
