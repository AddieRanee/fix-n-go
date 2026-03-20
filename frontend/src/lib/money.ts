const myrFormatter = new Intl.NumberFormat("ms-MY", {
  style: "currency",
  currency: "MYR",
  currencyDisplay: "symbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatMYR(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return myrFormatter
    .format(safe)
    .replace(/\u00A0/g, " ")
    .replace(/^MYR\s?/, "RM ")
    .replace(/^RM\s?/, "RM ");
}

