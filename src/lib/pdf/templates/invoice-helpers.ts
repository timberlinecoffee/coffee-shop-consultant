// TIM-1912: Pure helper functions for the invoice PDF template.
// Kept in a .ts file so they can be imported by the test runner without JSX.

export type InvoiceBillingAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export function fmtCents(cents: number, currency: string): string {
  const symbol = currency.toUpperCase() === "CAD" ? "CAD $" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

export function fmtAddress(addr: InvoiceBillingAddress | null): string {
  if (!addr) return "—";
  const parts = [
    addr.name,
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Enumerate all Alberta-required field labels that must appear on a CRA-compliant invoice.
 * The PDF template renders each of these; this function is the testable contract.
 */
export const ALBERTA_REQUIRED_LABELS = [
  "INVOICE",           // document title
  "Invoice Date",      // date of invoice
  "Supply Period",     // supply date (service period)
  "Bill To",           // customer name + billing address
  "Status",            // paid / refunded
  "Currency",          // CAD
  "Subtotal",          // pre-tax amount
  "Total",             // final amount
] as const;

export type AlbertaRequiredLabel = (typeof ALBERTA_REQUIRED_LABELS)[number];
