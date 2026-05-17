// TIM-762: Buildout Plan PDF template.
// Covers: equipment (by category + must-have badges), contractor bids,
// timeline milestones, permits + jurisdiction.
// Footer disclaimer required by QA: "Best-effort permit guidance — confirm
// specifics with your local jurisdiction."

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import type { PdfTemplate } from "../registry"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  BuildoutDocument,
  ContractorBid,
  Milestone,
  PermitItem,
} from "@/lib/buildout/seedDefaults"

// ── data loader ────────────────────────────────────────────────────────────────

type EquipmentItem = {
  id: string
  name: string
  category: string
  vendor: string | null
  model: string | null
  quantity: number
  unit_cost_cents: number
  priority_tier: "must_have" | "important" | "nice_to_have"
  notes: string | null
}

type BuildoutPlanExtra = {
  equipment: EquipmentItem[]
}

async function buildoutPlanDataLoader(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  planId: string,
): Promise<BuildoutPlanExtra> {
  const { data } = await supabase
    .from("buildout_equipment_items")
    .select("id, name, category, vendor, model, quantity, unit_cost_cents, priority_tier, notes")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("category", { ascending: true })
    .order("position", { ascending: true })

  return { equipment: (data ?? []) as EquipmentItem[] }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const BID_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  received: "Received",
  accepted: "Accepted",
  rejected: "Rejected",
}

const PERMIT_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
  not_applicable: "N/A",
}

// ── styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: BRAND.page.margin,
    paddingBottom: BRAND.page.margin + 20,
    paddingLeft: BRAND.page.margin,
    paddingRight: BRAND.page.margin,
  },
  coverHeading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 22,
    color: BRAND.colors.primary,
    marginBottom: 6,
  },
  coverSubtitle: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 12,
    color: BRAND.colors.muted,
    marginBottom: 24,
  },
  summaryBox: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 4,
    padding: 12,
  },
  summaryLabel: {
    fontSize: 9,
    color: BRAND.colors.muted,
    marginBottom: 4,
    fontFamily: BRAND.fonts.sans,
  },
  summaryValue: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 16,
    color: BRAND.colors.primary,
  },
  categoryHeading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 10,
    color: BRAND.colors.ink,
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  mustHaveBadge: {
    fontSize: 7,
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    color: BRAND.colors.paper,
    backgroundColor: BRAND.colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 4,
  },
  disclaimerBox: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
  },
  disclaimerText: {
    fontSize: 8,
    color: BRAND.colors.muted,
    fontFamily: BRAND.fonts.sans,
    fontStyle: "italic",
  },
  milestone: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  milestoneLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    flex: 1,
  },
  milestoneDate: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.muted,
    width: 90,
    textAlign: "right",
  },
  milestoneDone: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 9,
    color: BRAND.colors.primary,
    width: 48,
    textAlign: "right",
  },
  noData: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.muted,
    paddingVertical: 8,
  },
})

// ── equipment section ──────────────────────────────────────────────────────────

function EquipmentSection({ items }: { items: EquipmentItem[] }) {
  if (items.length === 0) {
    return (
      <PdfSection title="Equipment">
        <Text style={styles.noData}>No equipment items recorded.</Text>
      </PdfSection>
    )
  }

  // Group by category
  const byCategory = items.reduce<Record<string, EquipmentItem[]>>((acc, item) => {
    const cat = item.category || "other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const eqCols: ColumnDef[] = [
    { key: "name", label: "Item", width: "35%" },
    { key: "vendor", label: "Vendor / Model", width: "25%" },
    { key: "qty", label: "Qty", numeric: true, width: "8%" },
    { key: "unit", label: "Unit Cost", currency: true, width: "16%" },
    { key: "subtotal", label: "Subtotal", currency: true, width: "16%" },
  ]

  const grandTotal = items.reduce(
    (s, i) => s + i.unit_cost_cents * i.quantity,
    0,
  )

  return (
    <PdfSection title="Equipment">
      {Object.entries(byCategory).map(([cat, catItems]) => {
        const catTotal = catItems.reduce(
          (s, i) => s + i.unit_cost_cents * i.quantity,
          0,
        )
        const rows: Row[] = catItems.map((item) => ({
          name: item.priority_tier === "must_have" ? `${item.name} ★` : item.name,
          vendor: [item.vendor, item.model].filter(Boolean).join(" / ") || "—",
          qty: item.quantity,
          unit: item.unit_cost_cents,
          subtotal: item.unit_cost_cents * item.quantity,
        }))
        return (
          <View key={cat}>
            <Text style={styles.categoryHeading}>{titleCase(cat)}</Text>
            <PdfTable
              columns={eqCols}
              rows={rows}
              totalsRow={{
                name: "Category subtotal",
                vendor: "",
                qty: "",
                unit: "",
                subtotal: catTotal,
              }}
            />
          </View>
        )
      })}
      <View style={{ marginTop: 8 }}>
        <Text style={{ fontFamily: BRAND.fonts.sans, fontSize: 9, color: BRAND.colors.muted }}>
          ★ = Must-have priority · Grand total: {fmtUsd(grandTotal)}
        </Text>
      </View>
    </PdfSection>
  )
}

// ── contractor bids section ────────────────────────────────────────────────────

function ContractorBidsSection({ bids }: { bids: ContractorBid[] }) {
  const bidCols: ColumnDef[] = [
    { key: "contractor", label: "Contractor", width: "30%" },
    { key: "scope", label: "Scope", width: "20%" },
    { key: "status", label: "Status", width: "15%" },
    { key: "start", label: "Start", width: "17%" },
    { key: "total", label: "Total", currency: true, width: "18%" },
  ]

  const receivedAccepted = bids.filter(
    (b) => b.status === "received" || b.status === "accepted",
  )
  const bidTotal = receivedAccepted.reduce((s, b) => s + b.bid_total_cents, 0)

  const rows: Row[] = bids.map((b) => ({
    contractor: b.contractor_name || "—",
    scope: titleCase(b.scope),
    status: BID_STATUS_LABEL[b.status] ?? b.status,
    start: fmtDate(b.scheduled_start),
    total: b.bid_total_cents,
  }))

  return (
    <PdfSection title="Contractor Bids">
      {bids.length === 0 ? (
        <Text style={styles.noData}>No contractor bids recorded.</Text>
      ) : (
        <>
          <PdfTable
            columns={bidCols}
            rows={rows}
            totalsRow={{
              contractor: "Received + accepted total",
              scope: "",
              status: "",
              start: "",
              total: bidTotal,
            }}
          />
        </>
      )}
    </PdfSection>
  )
}

// ── timeline section ───────────────────────────────────────────────────────────

function TimelineSection({
  milestones,
  targetOpenDate,
}: {
  milestones: Milestone[]
  targetOpenDate: string | null
}) {
  return (
    <PdfSection title="Build-out Timeline">
      {targetOpenDate && (
        <Text style={{ ...styles.noData, color: BRAND.colors.ink, marginBottom: 8 }}>
          Target open date: {fmtDate(targetOpenDate)}
        </Text>
      )}
      {milestones.length === 0 ? (
        <Text style={styles.noData}>No milestones recorded.</Text>
      ) : (
        milestones.map((m) => (
          <View key={m.id} style={styles.milestone}>
            <Text style={styles.milestoneLabel}>{m.label}</Text>
            <Text style={styles.milestoneDate}>{fmtDate(m.target_date)}</Text>
            <Text style={styles.milestoneDone}>{m.completed ? "Done ✓" : ""}</Text>
          </View>
        ))
      )}
    </PdfSection>
  )
}

// ── permits section ────────────────────────────────────────────────────────────

function PermitsSection({ permits }: { permits: BuildoutDocument["permits"] }) {
  const { jurisdiction, items } = permits ?? {
    jurisdiction: { city: null, state_or_region: null, country: "US" },
    items: [],
  }

  const jParts = [jurisdiction.city, jurisdiction.state_or_region, jurisdiction.country]
    .filter(Boolean)
    .join(", ")

  const permitCols: ColumnDef[] = [
    { key: "label", label: "Permit / License", width: "50%" },
    { key: "status", label: "Status", width: "20%" },
    { key: "submitted", label: "Submitted", width: "15%" },
    { key: "approved", label: "Approved", width: "15%" },
  ]

  const rows: Row[] = (items ?? []).map((p: PermitItem) => ({
    label: p.label,
    status: PERMIT_STATUS_LABEL[p.status] ?? p.status,
    submitted: fmtDate(p.submitted_on),
    approved: fmtDate(p.approved_on),
  }))

  return (
    <PdfSection title="Permits &amp; Licenses">
      {jParts && (
        <Text style={{ ...styles.noData, color: BRAND.colors.ink, marginBottom: 8 }}>
          Jurisdiction: {jParts}
        </Text>
      )}
      {items.length === 0 ? (
        <Text style={styles.noData}>No permits recorded.</Text>
      ) : (
        <PdfTable columns={permitCols} rows={rows} />
      )}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          Best-effort permit guidance — confirm specifics with your local jurisdiction.
        </Text>
      </View>
    </PdfSection>
  )
}

// ── template ───────────────────────────────────────────────────────────────────

export const buildoutPlanTemplate: PdfTemplate<BuildoutDocument | null, BuildoutPlanExtra> = {
  workspace_key: "buildout_equipment",
  dataLoader: buildoutPlanDataLoader,

  filename: (ctx) => {
    const slug = (ctx.plan.shop_name ?? "buildout-plan")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    return `${slug}-buildout-plan.pdf`
  },

  render: (ctx) => {
    const doc = ctx.content as BuildoutDocument | null
    const equipment = ctx.extra?.equipment ?? []
    const bids = doc?.contractor_bids ?? []
    const milestones = doc?.timeline?.milestones ?? []
    const targetOpenDate = doc?.timeline?.target_open_date ?? null
    const permits = doc?.permits ?? {
      jurisdiction: { city: null, state_or_region: null, country: "US" },
      items: [],
    }
    const digest = (doc?._digest ?? {}) as Record<string, number>

    const equipmentTotal = equipment.reduce(
      (s, i) => s + i.unit_cost_cents * i.quantity,
      0,
    )
    const bidTotal = bids
      .filter((b) => b.status === "received" || b.status === "accepted")
      .reduce((s, b) => s + b.bid_total_cents, 0)
    const combinedTotal =
      (digest.equipment_total_cents ?? equipmentTotal) +
      (digest.buildout_bid_total_cents ?? bidTotal)

    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    return (
      <PdfDocument>
        <Page size={BRAND.page.size} style={styles.page}>
          <PdfHeader
            shopName={ctx.plan.shop_name}
            workspaceName="Build-out &amp; Equipment Plan"
          />

          {/* Cover: title + budget summary */}
          <View>
            <Text style={styles.coverHeading}>
              {ctx.plan.shop_name ?? "Build-out Plan"}
            </Text>
            <Text style={styles.coverSubtitle}>
              Build-out &amp; Equipment Plan
            </Text>
            <View style={styles.summaryBox}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Equipment Total</Text>
                <Text style={styles.summaryValue}>{fmtUsd(equipmentTotal)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Build-out Bids (received/accepted)</Text>
                <Text style={styles.summaryValue}>{fmtUsd(bidTotal)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Combined Startup Total</Text>
                <Text style={styles.summaryValue}>{fmtUsd(combinedTotal)}</Text>
              </View>
            </View>
          </View>

          <EquipmentSection items={equipment} />
          <ContractorBidsSection bids={bids} />
          <TimelineSection milestones={milestones} targetOpenDate={targetOpenDate} />
          <PermitsSection permits={permits} />

          <PdfFooter generatedDate={generatedDate} />
        </Page>
      </PdfDocument>
    )
  },
}
