// TIM-728: buildout_plan PDF template wired to the shared PDF framework.
// Sections: cover · equipment (grouped by category) · contractor bids ·
// timeline · permits (with footer disclaimer).
// Equipment rows come from buildout_equipment_items table (dataLoader);
// bids/timeline/permits come from workspace_documents.content.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import type { PdfTemplate } from "../registry"

// ── types ────────────────────────────────────────────────────────────────────

type EquipmentCategory =
  | "espresso"
  | "grinder"
  | "refrigeration"
  | "plumbing"
  | "electrical"
  | "furniture"
  | "smallwares"
  | "pos"
  | "signage"
  | "other"

type PriorityTier = "must_have" | "nice_to_have"

type EquipmentItem = {
  id: string
  position: number
  name: string
  category: EquipmentCategory
  vendor: string | null
  model: string | null
  quantity: number
  unit_cost_cents: number
  priority_tier: PriorityTier
  notes: string | null
  archived: boolean
}

type BidScope =
  | "general"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "millwork"
  | "signage"
  | "other"

type BidStatus = "requested" | "received" | "accepted" | "rejected"

type ContractorBid = {
  id: string
  scope: BidScope
  contractor_name: string
  bid_total_cents: number
  scheduled_start: string | null
  scheduled_finish: string | null
  status: BidStatus
  notes: string | null
}

type MilestoneKey =
  | "permit_submit"
  | "demo"
  | "rough_in"
  | "inspections"
  | "finish"
  | "equipment_install"
  | "soft_open"

type Milestone = {
  id: string
  key: MilestoneKey | string
  label: string
  target_date: string | null
  completed: boolean
  notes: string | null
}

type Timeline = {
  target_open_date: string | null
  milestones: Milestone[]
}

type PermitStatus = "not_started" | "submitted" | "approved" | "denied" | "not_applicable"

type PermitItem = {
  id: string
  key: string
  label: string
  status: PermitStatus
  submitted_on: string | null
  approved_on: string | null
  notes: string | null
}

type PermitsData = {
  jurisdiction: { city: string | null; state_or_region: string | null; country: string }
  items: PermitItem[]
}

type WorkspaceContent = {
  schema_version: number
  contractor_bids: ContractorBid[]
  timeline: Timeline
  permits: PermitsData
  _digest?: {
    equipment_count: number
    must_have_total_cents: number
    nice_to_have_total_cents: number
    buildout_bid_total_cents: number
  }
}

export type BuildoutPlanContent = {
  equipment: EquipmentItem[]
  bids: ContractorBid[]
  timeline: Timeline
  permits: PermitsData
}

// ── label maps ───────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  espresso: "Espresso",
  grinder: "Grinder",
  refrigeration: "Refrigeration",
  plumbing: "Plumbing",
  electrical: "Electrical",
  furniture: "Furniture",
  smallwares: "Smallwares",
  pos: "POS",
  signage: "Signage",
  other: "Other",
}

const CATEGORY_ORDER: EquipmentCategory[] = [
  "espresso",
  "grinder",
  "refrigeration",
  "plumbing",
  "electrical",
  "furniture",
  "smallwares",
  "pos",
  "signage",
  "other",
]

const SCOPE_LABEL: Record<BidScope, string> = {
  general: "General",
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  millwork: "Millwork",
  signage: "Signage",
  other: "Other",
}

const BID_STATUS_LABEL: Record<BidStatus, string> = {
  requested: "Requested",
  received: "Received",
  accepted: "Accepted",
  rejected: "Rejected",
}

const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
  not_applicable: "N/A",
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

function fmtYyyymmdd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("")
}

function slugify(s: string | null | undefined): string {
  if (!s) return "untitled"
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ── styles ───────────────────────────────────────────────────────────────────

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
  coverPage: {
    fontFamily: BRAND.fonts.sans,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    padding: BRAND.page.margin * 1.5,
    flexDirection: "column",
    justifyContent: "center",
  },
  coverEyebrow: {
    fontSize: 11,
    color: BRAND.colors.primary,
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 16,
  },
  coverTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 36,
    fontWeight: 600,
    lineHeight: 1.15,
    color: BRAND.colors.ink,
    marginBottom: 12,
  },
  coverShop: {
    fontSize: 18,
    color: BRAND.colors.ink,
    marginBottom: 32,
  },
  coverRule: {
    height: 2,
    backgroundColor: BRAND.colors.primary,
    width: 64,
    marginBottom: 24,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize: 11,
    color: BRAND.colors.ink,
    marginBottom: 14,
  },
  coverFootnote: {
    position: "absolute",
    bottom: BRAND.page.margin,
    left: BRAND.page.margin * 1.5,
    right: BRAND.page.margin * 1.5,
    fontSize: 9,
    color: BRAND.colors.muted,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
    gap: 8,
  },
  summaryBox: {
    flexGrow: 1,
    flexBasis: "30%",
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    padding: 8,
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 8,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    color: BRAND.colors.ink,
    fontWeight: 700,
  },
  categoryHead: {
    fontSize: 9,
    fontWeight: 700,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingTop: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    marginBottom: 4,
  },
  badge: {
    fontSize: 7,
    fontWeight: 700,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    color: BRAND.colors.paper,
  },
  badgeMustHave: {
    backgroundColor: BRAND.colors.primary,
  },
  badgeNiceToHave: {
    backgroundColor: BRAND.colors.muted,
  },
  emptyNote: {
    fontSize: 10,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 8,
    backgroundColor: "#F5F6F5",
    borderRadius: 4,
    marginBottom: 8,
  },
  disclaimer: {
    fontSize: 8,
    color: BRAND.colors.muted,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    fontStyle: "italic",
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  milestoneCheck: {
    width: 14,
    fontSize: 9,
    color: BRAND.colors.primary,
    fontWeight: 700,
  },
  milestoneLabel: {
    flex: 1,
    fontSize: 9,
    color: BRAND.colors.ink,
  },
  milestoneDate: {
    width: 90,
    fontSize: 9,
    color: BRAND.colors.muted,
    textAlign: "right",
  },
})

// ── cover page ───────────────────────────────────────────────────────────────

function CoverPage({
  shopName,
  content,
  generatedDate,
}: {
  shopName: string | null
  content: BuildoutPlanContent
  generatedDate: string
}) {
  const active = content.equipment.filter((e) => !e.archived)
  const mustHaveTotal = active
    .filter((e) => e.priority_tier === "must_have")
    .reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0)
  const niceToHaveTotal = active
    .filter((e) => e.priority_tier === "nice_to_have")
    .reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0)
  const buildoutTotal = content.bids
    .filter((b) => b.status === "received" || b.status === "accepted")
    .reduce((s, b) => s + b.bid_total_cents, 0)
  const totalBudget = mustHaveTotal + niceToHaveTotal + buildoutTotal

  const openDate = content.timeline.target_open_date

  return (
    <Page size={BRAND.page.size} style={styles.coverPage}>
      <Text style={styles.coverEyebrow}>GROUNDWORK · BUILD-OUT PLAN</Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverTitle}>Build-out &amp; Equipment Plan</Text>
      <Text style={styles.coverShop}>{shopName ?? "Your coffee shop"}</Text>

      <Text style={styles.coverMetaLabel}>Generated</Text>
      <Text style={styles.coverMetaValue}>{generatedDate}</Text>

      {openDate && (
        <>
          <Text style={styles.coverMetaLabel}>Target open date</Text>
          <Text style={styles.coverMetaValue}>{fmtDate(openDate)}</Text>
        </>
      )}

      <Text style={styles.coverMetaLabel}>Equipment budget (must-have)</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(mustHaveTotal)}</Text>

      <Text style={styles.coverMetaLabel}>Equipment budget (nice-to-have)</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(niceToHaveTotal)}</Text>

      <Text style={styles.coverMetaLabel}>Build-out (received &amp; accepted bids)</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(buildoutTotal)}</Text>

      <Text style={styles.coverMetaLabel}>Total budget</Text>
      <Text style={styles.coverMetaValue}>{fmtUsd(totalBudget)}</Text>

      <Text style={styles.coverFootnote}>
        Costs are estimates. Contractor bids reflect received and accepted bids only.
        Equipment costs are operator-entered list prices — actual costs may vary.
      </Text>
    </Page>
  )
}

// ── equipment section ────────────────────────────────────────────────────────

function EquipmentSection({ equipment }: { equipment: EquipmentItem[] }) {
  const active = equipment.filter((e) => !e.archived)

  if (active.length === 0) {
    return (
      <PdfSection title="Equipment">
        <Text style={styles.emptyNote}>
          No equipment items recorded yet. Add items in the Build-out &amp; Equipment workspace.
        </Text>
      </PdfSection>
    )
  }

  const grouped = new Map<EquipmentCategory, EquipmentItem[]>()
  for (const cat of CATEGORY_ORDER) grouped.set(cat, [])
  for (const item of active) {
    const cat = (grouped.has(item.category) ? item.category : "other") as EquipmentCategory
    grouped.get(cat)!.push(item)
  }

  const mustHaveTotal = active
    .filter((e) => e.priority_tier === "must_have")
    .reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0)
  const niceToHaveTotal = active
    .filter((e) => e.priority_tier === "nice_to_have")
    .reduce((s, e) => s + e.unit_cost_cents * e.quantity, 0)

  const columns: ColumnDef[] = [
    { key: "name", label: "Item" },
    { key: "vendor", label: "Vendor", width: 70 },
    { key: "qty", label: "Qty", numeric: true, width: 30 },
    { key: "unit_cost", label: "Unit cost", currency: true, width: 70 },
    { key: "subtotal", label: "Subtotal", currency: true, width: 70 },
    { key: "tier", label: "Tier", width: 70 },
  ]

  const rows: Row[] = []
  let lastCategory: EquipmentCategory | null = null

  for (const cat of CATEGORY_ORDER) {
    const items = grouped.get(cat)!
    if (items.length === 0) continue

    for (const item of items) {
      if (item.category !== lastCategory) {
        lastCategory = item.category
      }
      rows.push({
        name: item.name,
        vendor: item.vendor ?? "—",
        qty: item.quantity,
        unit_cost: item.unit_cost_cents,
        subtotal: item.unit_cost_cents * item.quantity,
        tier: item.priority_tier === "must_have" ? "Must-have" : "Nice-to-have",
      })
    }
  }

  const totalsRow: Row = {
    name: "",
    vendor: "",
    qty: "",
    unit_cost: "",
    subtotal: mustHaveTotal + niceToHaveTotal,
    tier: "",
  }

  return (
    <PdfSection title="Equipment">
      {(() => {
        const sectionRows: React.ReactNode[] = []
        let lastCat: EquipmentCategory | null = null

        for (const cat of CATEGORY_ORDER) {
          const items = grouped.get(cat)!
          if (items.length === 0) continue

          const catLabel = CATEGORY_LABEL[cat]
          const catRows: Row[] = items.map((item) => ({
            name: item.name,
            vendor: item.vendor ?? "—",
            qty: item.quantity,
            unit_cost: item.unit_cost_cents,
            subtotal: item.unit_cost_cents * item.quantity,
            tier: item.priority_tier === "must_have" ? "Must-have" : "Nice-to-have",
          }))
          const catTotal = items.reduce(
            (s, e) => s + e.unit_cost_cents * e.quantity,
            0
          )
          const catTotalsRow: Row = {
            name: `${catLabel} subtotal`,
            vendor: "",
            qty: "",
            unit_cost: "",
            subtotal: catTotal,
            tier: "",
          }

          if (lastCat !== cat) {
            lastCat = cat
            sectionRows.push(
              <Text key={`head-${cat}`} style={styles.categoryHead}>
                {catLabel}
              </Text>
            )
          }

          sectionRows.push(
            <PdfTable
              key={`table-${cat}`}
              columns={columns}
              rows={catRows}
              totalsRow={catTotalsRow}
            />
          )
        }

        return sectionRows
      })()}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Must-have total</Text>
          <Text style={styles.summaryValue}>{fmtUsd(mustHaveTotal)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Nice-to-have total</Text>
          <Text style={styles.summaryValue}>{fmtUsd(niceToHaveTotal)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Grand total</Text>
          <Text style={styles.summaryValue}>{fmtUsd(mustHaveTotal + niceToHaveTotal)}</Text>
        </View>
      </View>
    </PdfSection>
  )
}

// ── contractor bids section ───────────────────────────────────────────────────

function BidsSection({ bids }: { bids: ContractorBid[] }) {
  if (bids.length === 0) {
    return (
      <PdfSection title="Contractor bids">
        <Text style={styles.emptyNote}>
          No contractor bids recorded yet.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "scope", label: "Scope", width: 70 },
    { key: "contractor", label: "Contractor" },
    { key: "status", label: "Status", width: 70 },
    { key: "start", label: "Start", width: 70 },
    { key: "finish", label: "Finish", width: 70 },
    { key: "total", label: "Bid total", currency: true, width: 80 },
  ]

  const rows: Row[] = bids.map((b) => ({
    scope: SCOPE_LABEL[b.scope] ?? b.scope,
    contractor: b.contractor_name,
    status: BID_STATUS_LABEL[b.status] ?? b.status,
    start: fmtDate(b.scheduled_start),
    finish: fmtDate(b.scheduled_finish),
    total: b.bid_total_cents,
  }))

  const acceptedTotal = bids
    .filter((b) => b.status === "received" || b.status === "accepted")
    .reduce((s, b) => s + b.bid_total_cents, 0)

  const totalsRow: Row = {
    scope: "",
    contractor: "Received & accepted total",
    status: "",
    start: "",
    finish: "",
    total: acceptedTotal,
  }

  return (
    <PdfSection title="Contractor bids">
      <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
    </PdfSection>
  )
}

// ── timeline section ──────────────────────────────────────────────────────────

function TimelineSection({ timeline }: { timeline: Timeline }) {
  const milestones = timeline.milestones

  if (milestones.length === 0) {
    return (
      <PdfSection title="Build-out timeline">
        <Text style={styles.emptyNote}>
          No milestones recorded yet. Add milestones in the Build-out &amp; Equipment workspace.
        </Text>
      </PdfSection>
    )
  }

  return (
    <PdfSection title="Build-out timeline">
      {timeline.target_open_date && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Target open date</Text>
            <Text style={styles.summaryValue}>{fmtDate(timeline.target_open_date)}</Text>
          </View>
        </View>
      )}
      {milestones.map((m, i) => (
        <View key={m.id ?? i} style={styles.milestoneRow}>
          <Text style={styles.milestoneCheck}>{m.completed ? "✓" : "○"}</Text>
          <Text style={styles.milestoneLabel}>{m.label}</Text>
          <Text style={styles.milestoneDate}>{fmtDate(m.target_date)}</Text>
        </View>
      ))}
    </PdfSection>
  )
}

// ── permits section ───────────────────────────────────────────────────────────

function PermitsSection({ permits }: { permits: PermitsData }) {
  const items = permits.items
  const { city, state_or_region } = permits.jurisdiction
  const jurisdictionLabel =
    [city, state_or_region].filter(Boolean).join(", ") || "Jurisdiction not set"

  const columns: ColumnDef[] = [
    { key: "label", label: "Permit" },
    { key: "status", label: "Status", width: 90 },
    { key: "submitted", label: "Submitted", width: 80 },
    { key: "approved", label: "Approved", width: 80 },
    { key: "notes", label: "Notes" },
  ]

  const rows: Row[] = items.map((p) => ({
    label: p.label,
    status: PERMIT_STATUS_LABEL[p.status] ?? p.status,
    submitted: fmtDate(p.submitted_on),
    approved: fmtDate(p.approved_on),
    notes: p.notes ?? "—",
  }))

  return (
    <PdfSection title={`Permits — ${jurisdictionLabel}`}>
      {items.length === 0 ? (
        <Text style={styles.emptyNote}>
          No permits recorded yet. Add permits in the Build-out &amp; Equipment workspace.
        </Text>
      ) : (
        <PdfTable columns={columns} rows={rows} />
      )}
      <Text style={styles.disclaimer}>
        Best-effort permit guidance — confirm specifics with your local jurisdiction.
      </Text>
    </PdfSection>
  )
}

// ── top-level document ────────────────────────────────────────────────────────

function BuildoutPlanPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: BuildoutPlanContent
  shopName: string | null
  generatedDate: string
}) {
  return (
    <PdfDocument>
      <CoverPage
        shopName={shopName}
        content={content}
        generatedDate={generatedDate}
      />
      <Page size={BRAND.page.size} style={styles.page}>
        <PdfHeader shopName={shopName} workspaceName="Build-out & Equipment Plan" />
        <EquipmentSection equipment={content.equipment} />
        <BidsSection bids={content.bids} />
        <PdfFooter generatedDate={generatedDate} />
      </Page>
      <Page size={BRAND.page.size} style={styles.page}>
        <PdfHeader shopName={shopName} workspaceName="Build-out & Equipment Plan" />
        <TimelineSection timeline={content.timeline} />
        <PermitsSection permits={content.permits} />
        <PdfFooter generatedDate={generatedDate} />
      </Page>
    </PdfDocument>
  )
}

// ── template export ───────────────────────────────────────────────────────────

const EMPTY_WORKSPACE_CONTENT: WorkspaceContent = {
  schema_version: 1,
  contractor_bids: [],
  timeline: { target_open_date: null, milestones: [] },
  permits: { jurisdiction: { city: null, state_or_region: null, country: "US" }, items: [] },
}

export const buildoutPlanTemplate: PdfTemplate<BuildoutPlanContent> = {
  workspace_key: "buildout_equipment",

  dataLoader: async (planId, _userId, supabase) => {
    const [equipmentResult, wsDocResult] = await Promise.all([
      supabase
        .from("buildout_equipment_items")
        .select("*")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("workspace_documents")
        .select("content")
        .eq("plan_id", planId)
        .eq("workspace_key", "buildout_equipment")
        .maybeSingle(),
    ])

    if (equipmentResult.error) {
      throw new Error(`buildout_equipment_items fetch failed: ${equipmentResult.error.message}`)
    }

    const wsContent: WorkspaceContent =
      (wsDocResult.data?.content as WorkspaceContent) ?? EMPTY_WORKSPACE_CONTENT

    return {
      equipment: (equipmentResult.data ?? []) as EquipmentItem[],
      bids: wsContent.contractor_bids ?? [],
      timeline: wsContent.timeline ?? { target_open_date: null, milestones: [] },
      permits: wsContent.permits ?? {
        jurisdiction: { city: null, state_or_region: null, country: "US" },
        items: [],
      },
    }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <BuildoutPlanPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.plan.shop_name)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-buildout-plan-${slug}-${date}.pdf`
  },
}
