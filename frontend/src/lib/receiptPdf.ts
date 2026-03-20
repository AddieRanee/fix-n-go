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
  lines: ReceiptPdfLine[];
  total: number;
  note?: string;
};

function safeFilename(text: string) {
  return text.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

export function buildReceiptPdfFilename(data: ReceiptPdfData) {
  return safeFilename(
    `Rec_${data.receiptNo}_${data.numberPlate}_${data.dateLabel}`.replace(/\s+/g, "_")
  ) + ".pdf";
}

export function createReceiptPdfBlob(data: ReceiptPdfData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 24;
  let cursorY = 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Fix n Go Garage", marginX, cursorY);

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
  doc.text(data.note || "Keep this receipt for your records.", marginX, finalY + 40);

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
      html, body { margin: 0; height: 100%; background: #fff; }
      iframe { border: 0; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <iframe id="pdfFrame"></iframe>
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
    win.focus();
    win.print();
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
