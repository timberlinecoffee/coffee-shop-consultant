// TIM-1912: Alberta-compliant invoice PDF template using @react-pdf/renderer.
// Required fields per CRA / iBill CRA-compliant invoice guide:
//   legal business name + address, GST number (if registered), invoice #,
//   invoice date, supply date, customer name + billing address, line items,
//   tax breakdown (or small-supplier disclosure), subtotal/tax/total, currency CAD.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { BRAND, registerFonts } from "../brand";
import { PdfDocument } from "../components/PdfDocument";
import { fmtCents, fmtDate, fmtAddress } from "./invoice-helpers";
import type { InvoiceBillingAddress } from "./invoice-helpers";
export type { InvoiceBillingAddress } from "./invoice-helpers";

registerFonts();

// ── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitAmountCents: number;
  totalCents: number;
};

export type InvoicePdfContent = {
  // Seller (platform)
  businessName: string;
  businessAddress: string;
  gstRegistered: boolean;
  gstNumber: string | null;

  // Invoice metadata
  invoiceNumber: string;
  invoiceDate: string;     // ISO date string → formatted for display
  supplyDateStart: string | null;
  supplyDateEnd: string | null;
  status: "paid" | "refunded" | "void" | "uncollectible";

  // Buyer
  customerName: string | null;
  billingAddress: InvoiceBillingAddress | null;

  // Amounts (cents)
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;

  // Tax
  jurisdiction: string | null;
  taxRateBps: number;
  taxLabel: string;
  taxLineSuppressed: boolean;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: 40,
    paddingBottom: 60,
    paddingLeft: 40,
    paddingRight: 40,
  },
  // Header band
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  businessBlock: {
    flex: 1,
  },
  businessName: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 13,
    color: BRAND.colors.primary,
    marginBottom: 3,
  },
  businessAddress: {
    fontSize: 8,
    color: BRAND.colors.muted,
    lineHeight: 1.4,
  },
  gstNumber: {
    fontSize: 8,
    color: BRAND.colors.muted,
    marginTop: 3,
  },
  invoiceTitleBlock: {
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 18,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 9,
    color: BRAND.colors.muted,
  },
  // Status stamp
  stamp: {
    position: "absolute",
    top: 90,
    right: 40,
    fontSize: 28,
    fontWeight: 700,
    color: "#CC3333",
    opacity: 0.25,
    transform: "rotate(-20deg)",
  },
  // Meta table (dates + customer)
  metaRow: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 24,
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 7,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9,
    color: BRAND.colors.ink,
    lineHeight: 1.4,
  },
  // Line items table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND.colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 1,
  },
  tableHeaderText: {
    color: BRAND.colors.paper,
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  colDesc: { flex: 3 },
  colQty:  { flex: 1, textAlign: "right" },
  colUnit: { flex: 1.5, textAlign: "right" },
  colTotal:{ flex: 1.5, textAlign: "right" },
  tableCell: {
    fontSize: 9,
    color: BRAND.colors.ink,
  },
  // Totals
  totalsBlock: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 24,
    marginBottom: 3,
  },
  totalLabel: {
    fontSize: 8,
    color: BRAND.colors.muted,
    minWidth: 100,
    textAlign: "right",
  },
  totalValue: {
    fontSize: 9,
    color: BRAND.colors.ink,
    minWidth: 80,
    textAlign: "right",
  },
  grandTotal: {
    fontWeight: 700,
    fontSize: 10,
    color: BRAND.colors.ink,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 4,
  },
  // Small-supplier disclosure
  disclosure: {
    marginTop: 24,
    padding: 10,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 3,
    fontSize: 8,
    color: BRAND.colors.muted,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 6,
    fontSize: 7,
    color: BRAND.colors.muted,
    textAlign: "center",
  },
});

// ── Template ──────────────────────────────────────────────────────────────────

export function InvoicePdf({ content }: { content: InvoicePdfContent }) {
  const {
    businessName, businessAddress, gstRegistered, gstNumber,
    invoiceNumber, invoiceDate, supplyDateStart, supplyDateEnd, status,
    customerName, billingAddress,
    lineItems, subtotalCents, taxCents, totalCents, currency,
    jurisdiction, taxRateBps, taxLabel: taxLabelText, taxLineSuppressed,
  } = content;

  const isRefunded = status === "refunded";
  const currencyLabel = currency.toUpperCase();

  const supplyPeriod =
    supplyDateStart && supplyDateEnd
      ? `${fmtDate(supplyDateStart)} – ${fmtDate(supplyDateEnd)}`
      : supplyDateStart
      ? fmtDate(supplyDateStart)
      : "—";

  return (
    <PdfDocument>
      <Page size="A4" style={S.page}>
        {/* REFUNDED stamp */}
        {isRefunded && <Text style={S.stamp}>REFUNDED</Text>}

        {/* Header — business name + invoice title */}
        <View style={S.headerRow}>
          <View style={S.businessBlock}>
            <Text style={S.businessName}>{businessName}</Text>
            <Text style={S.businessAddress}>{businessAddress}</Text>
            {gstRegistered && gstNumber && (
              <Text style={S.gstNumber}>GST/HST Reg. No.: {gstNumber}</Text>
            )}
          </View>
          <View style={S.invoiceTitleBlock}>
            <Text style={S.invoiceTitle}>INVOICE</Text>
            <Text style={S.invoiceNumber}>#{invoiceNumber}</Text>
          </View>
        </View>

        {/* Meta row — dates + bill-to */}
        <View style={S.metaRow}>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Invoice Date</Text>
            <Text style={S.metaValue}>{fmtDate(invoiceDate)}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Supply Period</Text>
            <Text style={S.metaValue}>{supplyPeriod}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Status</Text>
            <Text style={S.metaValue}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Currency</Text>
            <Text style={S.metaValue}>{currencyLabel}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={{ marginBottom: 20 }}>
          <Text style={S.metaLabel}>Bill To</Text>
          <Text style={S.metaValue}>
            {customerName ?? "—"}
            {billingAddress ? `\n${fmtAddress(billingAddress)}` : ""}
          </Text>
        </View>

        {/* Line items table */}
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colDesc]}>Description</Text>
          <Text style={[S.tableHeaderText, S.colQty]}>Qty</Text>
          <Text style={[S.tableHeaderText, S.colUnit]}>Unit Price</Text>
          <Text style={[S.tableHeaderText, S.colTotal]}>Amount</Text>
        </View>
        {lineItems.map((item, i) => (
          <View key={i} style={S.tableRow}>
            <Text style={[S.tableCell, S.colDesc]}>{item.description}</Text>
            <Text style={[S.tableCell, S.colQty]}>{item.quantity}</Text>
            <Text style={[S.tableCell, S.colUnit]}>{fmtCents(item.unitAmountCents, currency)}</Text>
            <Text style={[S.tableCell, S.colTotal]}>{fmtCents(item.totalCents, currency)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={S.totalsBlock}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Subtotal</Text>
            <Text style={S.totalValue}>{fmtCents(subtotalCents, currency)}</Text>
          </View>
          {!taxLineSuppressed && (
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>{taxLabelText}</Text>
              <Text style={S.totalValue}>{fmtCents(taxCents, currency)}</Text>
            </View>
          )}
          <View style={S.totalRow}>
            <Text style={[S.totalLabel, S.grandTotal]}>Total</Text>
            <Text style={[S.totalValue, S.grandTotal]}>{fmtCents(totalCents, currency)}</Text>
          </View>
        </View>

        {/* Small-supplier disclosure (when not GST-registered) */}
        {taxLineSuppressed && (
          <Text style={S.disclosure}>
            GST/HST is not applicable. Timberline Coffee School is a small supplier and is not
            registered for GST/HST purposes under the Excise Tax Act.
          </Text>
        )}

        {/* Footer */}
        <Text style={S.footer}>
          {businessName} · {businessAddress} · Thank you for your business.
        </Text>
      </Page>
    </PdfDocument>
  );
}

/** Render an invoice to a PDF Buffer (Node.js only, server-side). */
export async function renderInvoicePdf(content: InvoicePdfContent): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const element = React.createElement(InvoicePdf, { content });
  // @react-pdf/renderer types require DocumentProps directly; the renderer
  // traverses the tree to find the Document wrapper — cast is safe at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any) as Promise<Buffer>;
}
