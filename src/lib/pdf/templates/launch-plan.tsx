// TIM-737: Launch Plan workspace PDF template.
// Uses the shared framework from TIM-712 / TIM-621 via dataLoader — the launch
// plan stores data in row-based tables instead of workspace_documents JSONB.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import type { PdfTemplate } from "../registry"

// ── Data types (mirror the row shapes from the DB tables) ────────────────────

type LaunchItemStatus = "pending" | "in_progress" | "done" | "at_risk"
type HiringRoleStatus = "planned" | "posted" | "interviewing" | "hired"

export type TimelineItem = {
  id: string
  milestone: string
  target_date: string | null
  status: LaunchItemStatus
  depends_on: string | null
  notes: string | null
  order_index: number
}

export type SoftOpenItem = {
  id: string
  day_offset: number
  task: string
  owner: string | null
  status: LaunchItemStatus
  notes: string | null
}

export type MarketingItem = {
  id: string
  channel: string
  asset: string
  launch_date: string | null
  status: LaunchItemStatus
  responsible: string | null
  notes: string | null
}

export type HiringRole = {
  id: string
  role_title: string
  headcount: number
  start_date: string | null
  monthly_cost_cents: number | null
  status: HiringRoleStatus
  notes: string | null
}

type ReadinessStatus = "green" | "yellow" | "red"

type WorkspaceReadiness = {
  key: string
  status: ReadinessStatus
  blockers: string[]
  topNextActions: string[]
}

type ReadinessResult = {
  overall: ReadinessStatus
  perWorkspace: WorkspaceReadiness[]
  criticalPath: { action: string; owner: string; dueBy: string | null }[]
}

export type LaunchPlanContent = {
  planName: string
  shopName: string | null
  ownerEmail: string | null
  targetOpeningDate: string | null // ISO date YYYY-MM-DD
  timeline: TimelineItem[]
  softOpen: SoftOpenItem[]
  marketing: MarketingItem[]
  hiring: HiringRole[]
  readiness: ReadinessResult | null
  readinessCheckedAt: string | null
}

// ── Label dictionaries ────────────────────────────────────────────────────────

const ITEM_STATUS_LABEL: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  at_risk: "At risk",
}

const HIRING_STATUS_LABEL: Record<HiringRoleStatus, string> = {
  planned: "Planned",
  posted: "Posted",
  interviewing: "Interviewing",
  hired: "Hired",
}

const READINESS_LABEL: Record<ReadinessStatus, string> = {
  green: "Green — On track",
  yellow: "Yellow — Gaps to address",
  red: "Red — Critical blockers",
}

const WORKSPACE_LABELS: Record<string, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
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
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "untitled"
}

function computeTMinus(targetDate: string | null): number | null {
  if (!targetDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  const diffMs = target.getTime() - today.getTime()
  return Math.round(diffMs / 86_400_000)
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// Bucket soft-open tasks
const SOFT_OPEN_BUCKETS = [
  { label: "Pre-open (days -7 to -1)", min: -99, max: -1 },
  { label: "Day 0", min: 0, max: 0 },
  { label: "Week 1 (days +1 to +7)", min: 1, max: 7 },
  { label: "Month 1 (days +8 to +30)", min: 8, max: 999 },
]

function getSoftOpenBucket(dayOffset: number): string {
  for (const b of SOFT_OPEN_BUCKETS) {
    if (dayOffset >= b.min && dayOffset <= b.max) return b.label
  }
  return dayOffset < 0 ? SOFT_OPEN_BUCKETS[0].label : SOFT_OPEN_BUCKETS[3].label
}

// ── Page styles ───────────────────────────────────────────────────────────────

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
  emptyNote: {
    fontSize: 10,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 8,
    backgroundColor: "#F5F6F5",
    borderRadius: 4,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 10,
    color: BRAND.colors.ink,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  // Gantt strip
  ganttContainer: {
    marginBottom: 12,
    marginTop: 4,
  },
  ganttAxisRow: {
    flexDirection: "row",
    marginBottom: 4,
    height: 14,
  },
  ganttAxisLabel: {
    fontSize: 7,
    color: BRAND.colors.muted,
    textAlign: "center",
  },
  ganttTrack: {
    height: 2,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 4,
    position: "relative",
  },
  ganttItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
    height: 14,
  },
  ganttDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ganttItemLabel: {
    fontSize: 7,
    color: BRAND.colors.ink,
    flex: 1,
    marginLeft: 4,
  },
  ganttDotDone: { backgroundColor: BRAND.colors.primary },
  ganttDotInProgress: { backgroundColor: BRAND.colors.accent },
  ganttDotAtRisk: { backgroundColor: "#B23A1F" },
  ganttDotPending: { backgroundColor: BRAND.colors.rule },
  // Readiness
  readinessBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  readinessGreen: { backgroundColor: "#E6F4E6" },
  readinessYellow: { backgroundColor: "#FFF8E6" },
  readinessRed: { backgroundColor: "#FDE8E8" },
  readinessBadgeText: { fontSize: 11, fontWeight: 700 },
  readinessGreenText: { color: "#2d6a2d" },
  readinessYellowText: { color: "#8a6200" },
  readinessRedText: { color: "#B23A1F" },
  wsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    paddingVertical: 4,
  },
  wsKey: { width: 120, fontSize: 9, fontWeight: 700, color: BRAND.colors.ink },
  wsStatus: { width: 60, fontSize: 9 },
  wsBlocker: { flex: 1, fontSize: 8, color: BRAND.colors.muted },
  criticalPathRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  cpNumber: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BRAND.colors.primary,
    color: BRAND.colors.paper,
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
    lineHeight: 1,
    paddingTop: 3,
    marginRight: 6,
    marginTop: 1,
  },
  cpAction: { flex: 1, fontSize: 9, color: BRAND.colors.ink, fontWeight: 700 },
  cpMeta: { fontSize: 8, color: BRAND.colors.muted, marginTop: 1 },
  payrollFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: BRAND.colors.ink,
    paddingTop: 6,
    marginTop: 4,
  },
  payrollFooterLabel: { fontSize: 10, fontWeight: 700, color: BRAND.colors.ink },
  payrollFooterValue: { fontSize: 10, fontWeight: 700, color: BRAND.colors.primary },
  bucketHeader: {
    fontSize: 9,
    fontWeight: 700,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 3,
  },
})

// ── Gantt strip (pure layout, no chart library) ───────────────────────────────

function GanttStrip({ items, launchDate }: { items: TimelineItem[]; launchDate: string | null }) {
  const dated = items.filter((i) => i.target_date != null)
  if (dated.length === 0 || !launchDate) {
    return (
      <Text style={styles.emptyNote}>
        Set a launch date and add milestones with target dates to see the Gantt strip.
      </Text>
    )
  }

  // Determine date range for the strip
  const launchMs = new Date(launchDate).getTime()
  const allDates = dated.map((i) => new Date(i.target_date!).getTime())
  const minMs = Math.min(...allDates, launchMs - 90 * 86_400_000)
  const maxMs = Math.max(...allDates, launchMs + 30 * 86_400_000)
  const rangeMs = maxMs - minMs
  if (rangeMs <= 0) return null

  const toPercent = (ms: number) =>
    Math.max(0, Math.min(100, ((ms - minMs) / rangeMs) * 100))

  // Axis labels: up to 5 evenly spaced dates
  const axisCount = 5
  const axisLabels: { label: string; pct: number }[] = []
  for (let i = 0; i <= axisCount; i++) {
    const ms = minMs + (rangeMs * i) / axisCount
    axisLabels.push({
      pct: (i / axisCount) * 100,
      label: new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })
  }

  const launchPct = toPercent(launchMs)

  const dotStyleForStatus = (status: LaunchItemStatus) => {
    switch (status) {
      case "done": return styles.ganttDotDone
      case "in_progress": return styles.ganttDotInProgress
      case "at_risk": return styles.ganttDotAtRisk
      default: return styles.ganttDotPending
    }
  }

  // Track width available (A4 minus margins)
  const trackWidth = 515 // approx content width

  return (
    <View style={styles.ganttContainer}>
      {/* Axis */}
      <View style={styles.ganttAxisRow}>
        {axisLabels.map((ax, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: `${ax.pct}%`,
              width: 50,
              marginLeft: -25,
            }}
          >
            <Text style={styles.ganttAxisLabel}>{ax.label}</Text>
          </View>
        ))}
      </View>

      {/* Track line */}
      <View style={styles.ganttTrack}>
        {/* Launch day marker */}
        <View
          style={{
            position: "absolute",
            left: `${launchPct}%`,
            top: -4,
            width: 2,
            height: 10,
            backgroundColor: BRAND.colors.primary,
          }}
        />
      </View>

      {/* Milestones as dot + label rows positioned horizontally */}
      {dated.slice(0, 20).map((item) => {
        const pct = toPercent(new Date(item.target_date!).getTime())
        return (
          <View key={item.id} style={styles.ganttItemRow}>
            <View style={{ position: "absolute", left: `${pct}%`, marginLeft: -3 }}>
              <View style={[styles.ganttDot, dotStyleForStatus(item.status)]} />
            </View>
            <View style={{ position: "absolute", left: `${Math.min(pct, 80)}%`, marginLeft: 6 }}>
              <Text style={styles.ganttItemLabel} numberOfLines={1}>
                {item.milestone}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── Section renderers ─────────────────────────────────────────────────────────

function CoverPage({ content, generatedDate }: { content: LaunchPlanContent; generatedDate: string }) {
  const tMinus = computeTMinus(content.targetOpeningDate)
  const launchDateLabel = content.targetOpeningDate
    ? fmtDate(content.targetOpeningDate)
    : "Not set"

  const tMinusLabel =
    tMinus == null
      ? "—"
      : tMinus > 0
      ? `T-${tMinus} day${tMinus !== 1 ? "s" : ""}`
      : tMinus === 0
      ? "Day 0 — Launch day!"
      : `Launched ${Math.abs(tMinus)} day${Math.abs(tMinus) !== 1 ? "s" : ""} ago`

  return (
    <Page size={BRAND.page.size} style={styles.coverPage}>
      <Text style={styles.coverEyebrow}>GROUNDWORK · LAUNCH PLAN</Text>
      <View style={styles.coverRule} />
      <Text style={styles.coverTitle}>Launch plan</Text>
      <Text style={styles.coverShop}>{content.shopName ?? content.planName}</Text>

      <Text style={styles.coverMetaLabel}>Owner</Text>
      <Text style={styles.coverMetaValue}>{content.ownerEmail ?? "—"}</Text>

      <Text style={styles.coverMetaLabel}>Target opening date</Text>
      <Text style={styles.coverMetaValue}>{launchDateLabel}</Text>

      <Text style={styles.coverMetaLabel}>Countdown</Text>
      <Text style={styles.coverMetaValue}>{tMinusLabel}</Text>

      <Text style={styles.coverMetaLabel}>Generated</Text>
      <Text style={styles.coverMetaValue}>{generatedDate}</Text>

      <Text style={styles.coverFootnote}>
        Milestones: {content.timeline.length} · Soft-open tasks: {content.softOpen.length} ·
        Marketing items: {content.marketing.length} · Hiring roles: {content.hiring.length}
      </Text>
    </Page>
  )
}

function TimelineSection({ content }: { content: LaunchPlanContent }) {
  if (content.timeline.length === 0) {
    return (
      <PdfSection title="Timeline &amp; Milestones">
        <Text style={styles.emptyNote}>
          No milestones yet. Add milestones in the Launch Plan workspace to populate this section.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "order", label: "#", width: 24 },
    { key: "milestone", label: "Milestone" },
    { key: "target_date", label: "Target date", width: 80 },
    { key: "status", label: "Status", width: 70 },
    { key: "notes", label: "Notes", width: 90 },
  ]

  const rows: Row[] = content.timeline.map((item, i) => ({
    order: i + 1,
    milestone: item.milestone,
    target_date: fmtDate(item.target_date),
    status: ITEM_STATUS_LABEL[item.status],
    notes: item.notes ?? "—",
  }))

  return (
    <PdfSection title="Timeline &amp; Milestones">
      <PdfTable columns={columns} rows={rows} />
      <Text style={[styles.paragraph, { marginTop: 8 }]}>Gantt strip</Text>
      <GanttStrip items={content.timeline} launchDate={content.targetOpeningDate} />
    </PdfSection>
  )
}

function SoftOpenSection({ content }: { content: LaunchPlanContent }) {
  if (content.softOpen.length === 0) {
    return (
      <PdfSection title="Soft-Open Plan">
        <Text style={styles.emptyNote}>
          No soft-open tasks yet. Add tasks in the Launch Plan workspace.
        </Text>
      </PdfSection>
    )
  }

  const bucketed = SOFT_OPEN_BUCKETS.map((b) => ({
    label: b.label,
    rows: content.softOpen.filter((r) => r.day_offset >= b.min && r.day_offset <= b.max),
  })).filter((b) => b.rows.length > 0)

  const columns: ColumnDef[] = [
    { key: "day", label: "Day", width: 32 },
    { key: "task", label: "Task" },
    { key: "owner", label: "Owner", width: 70 },
    { key: "status", label: "Status", width: 70 },
  ]

  return (
    <PdfSection title="Soft-Open Plan">
      {bucketed.map((bucket) => (
        <View key={bucket.label}>
          <Text style={styles.bucketHeader}>{bucket.label}</Text>
          <PdfTable
            columns={columns}
            rows={bucket.rows.map((r) => ({
              day: r.day_offset >= 0 ? `+${r.day_offset}` : String(r.day_offset),
              task: r.task,
              owner: r.owner ?? "—",
              status: ITEM_STATUS_LABEL[r.status],
            }))}
          />
        </View>
      ))}
    </PdfSection>
  )
}

function MarketingSection({ content }: { content: LaunchPlanContent }) {
  if (content.marketing.length === 0) {
    return (
      <PdfSection title="Marketing Kickoff">
        <Text style={styles.emptyNote}>
          No marketing items yet. Add items in the Launch Plan workspace.
        </Text>
      </PdfSection>
    )
  }

  // Group by channel
  const channels = Array.from(new Set(content.marketing.map((r) => r.channel))).sort()
  const columns: ColumnDef[] = [
    { key: "asset", label: "Asset" },
    { key: "launch_date", label: "Launch date", width: 80 },
    { key: "responsible", label: "Who", width: 70 },
    { key: "status", label: "Status", width: 70 },
  ]

  return (
    <PdfSection title="Marketing Kickoff">
      {channels.map((ch) => {
        const rows = content.marketing.filter((r) => r.channel === ch)
        return (
          <View key={ch}>
            <Text style={styles.bucketHeader}>{ch}</Text>
            <PdfTable
              columns={columns}
              rows={rows.map((r) => ({
                asset: r.asset,
                launch_date: fmtDate(r.launch_date),
                responsible: r.responsible ?? "—",
                status: ITEM_STATUS_LABEL[r.status],
              }))}
            />
          </View>
        )
      })}
    </PdfSection>
  )
}

function HiringPlanSection({ content }: { content: LaunchPlanContent }) {
  if (content.hiring.length === 0) {
    return (
      <PdfSection title="Hiring Plan">
        <Text style={styles.emptyNote}>
          No roles yet. Add roles in the Launch Plan workspace.
        </Text>
      </PdfSection>
    )
  }

  const columns: ColumnDef[] = [
    { key: "role", label: "Role" },
    { key: "count", label: "#", width: 28, numeric: true },
    { key: "start_date", label: "Start date", width: 80 },
    { key: "monthly_cost", label: "Monthly cost", width: 90, currency: true },
    { key: "status", label: "Status", width: 70 },
  ]

  const totalPayrollCents = content.hiring.reduce(
    (sum, r) => sum + (r.monthly_cost_cents ?? 0) * r.headcount,
    0
  )
  const totalHeadcount = content.hiring.reduce((sum, r) => sum + r.headcount, 0)

  const rows: Row[] = content.hiring.map((r) => ({
    role: r.role_title,
    count: r.headcount,
    start_date: fmtDate(r.start_date),
    monthly_cost: r.monthly_cost_cents != null ? r.monthly_cost_cents * r.headcount : null,
    status: HIRING_STATUS_LABEL[r.status],
  }))

  return (
    <PdfSection title="Hiring Plan">
      <PdfTable columns={columns} rows={rows} />
      <View style={styles.payrollFooter}>
        <Text style={styles.payrollFooterLabel}>
          Total headcount: {totalHeadcount}
        </Text>
        <Text style={styles.payrollFooterValue}>
          Monthly payroll: {totalPayrollCents > 0 ? fmtUsd(totalPayrollCents) : "—"}
        </Text>
      </View>
    </PdfSection>
  )
}

function ReadinessSection({ content }: { content: LaunchPlanContent }) {
  const r = content.readiness
  if (!r) {
    return (
      <PdfSection title="AI Readiness Verdict">
        <Text style={styles.emptyNote}>
          No readiness check has been run yet. Use the Launch Readiness Check button in the Launch
          Plan workspace to generate a verdict.
        </Text>
      </PdfSection>
    )
  }

  const overall = r.overall
  const badgeStyle =
    overall === "green"
      ? styles.readinessGreen
      : overall === "yellow"
      ? styles.readinessYellow
      : styles.readinessRed
  const textStyle =
    overall === "green"
      ? styles.readinessGreenText
      : overall === "yellow"
      ? styles.readinessYellowText
      : styles.readinessRedText

  const checkedAt = content.readinessCheckedAt
    ? fmtDate(content.readinessCheckedAt)
    : "Unknown date"

  return (
    <PdfSection title="AI Readiness Verdict">
      <Text style={styles.paragraph}>Checked on {checkedAt}</Text>
      <View style={[styles.readinessBadge, badgeStyle]}>
        <Text style={[styles.readinessBadgeText, textStyle]}>
          Overall: {READINESS_LABEL[overall]}
        </Text>
      </View>

      {/* Per-workspace breakdown */}
      <Text style={styles.bucketHeader}>Workspace breakdown</Text>
      {r.perWorkspace.map((ws) => (
        <View key={ws.key} style={styles.wsRow}>
          <Text style={styles.wsKey}>{WORKSPACE_LABELS[ws.key] ?? ws.key}</Text>
          <Text style={[styles.wsStatus, { color: ws.status === "green" ? "#2d6a2d" : ws.status === "yellow" ? "#8a6200" : "#B23A1F" }]}>
            {ws.status.charAt(0).toUpperCase() + ws.status.slice(1)}
          </Text>
          <Text style={styles.wsBlocker}>
            {ws.blockers.length > 0 ? ws.blockers[0] : ws.topNextActions[0] ?? "—"}
          </Text>
        </View>
      ))}

      {/* Critical path */}
      {r.criticalPath.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.bucketHeader}>Critical path</Text>
          {r.criticalPath.slice(0, 5).map((item, i) => (
            <View key={i} style={styles.criticalPathRow}>
              <Text style={styles.cpNumber}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cpAction}>{item.action}</Text>
                <Text style={styles.cpMeta}>
                  {item.owner}
                  {item.dueBy ? ` · by ${item.dueBy}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </PdfSection>
  )
}

// ── Top-level document ────────────────────────────────────────────────────────

function LaunchPlanPdf({ content, generatedDate }: { content: LaunchPlanContent; generatedDate: string }) {
  const shopName = content.shopName ?? content.planName
  return (
    <PdfDocument>
      {/* Page 1: Cover */}
      <CoverPage content={content} generatedDate={generatedDate} />

      {/* Page 2: Timeline */}
      <Page size={BRAND.page.size} style={styles.page}>
        <PdfHeader shopName={shopName} workspaceName="Launch plan" />
        <TimelineSection content={content} />
        <PdfFooter generatedDate={generatedDate} />
      </Page>

      {/* Page 3: Soft-Open + Marketing */}
      <Page size={BRAND.page.size} style={styles.page}>
        <PdfHeader shopName={shopName} workspaceName="Launch plan" />
        <SoftOpenSection content={content} />
        <MarketingSection content={content} />
        <PdfFooter generatedDate={generatedDate} />
      </Page>

      {/* Page 4: Hiring Plan + AI Readiness */}
      <Page size={BRAND.page.size} style={styles.page}>
        <PdfHeader shopName={shopName} workspaceName="Launch plan" />
        <HiringPlanSection content={content} />
        <ReadinessSection content={content} />
        <PdfFooter generatedDate={generatedDate} />
      </Page>
    </PdfDocument>
  )
}

// ── Data loader ───────────────────────────────────────────────────────────────

async function loadLaunchPlanData(
  planId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<LaunchPlanContent> {
  const [planResult, userResult, timelineResult, softOpenResult, marketingResult, hiringResult] =
    await Promise.all([
      supabase
        .from("coffee_shop_plans")
        .select("plan_name, shop_name, latest_readiness_check, latest_readiness_check_at")
        .eq("id", planId)
        .single(),
      supabase
        .from("users")
        .select("email, target_opening_date")
        .eq("id", userId)
        .single(),
      supabase
        .from("launch_timeline_items")
        .select("id, milestone, target_date, status, depends_on, notes, order_index")
        .eq("plan_id", planId)
        .order("order_index", { ascending: true }),
      supabase
        .from("soft_open_plan_items")
        .select("id, day_offset, task, owner, status, notes")
        .eq("plan_id", planId)
        .order("day_offset", { ascending: true }),
      supabase
        .from("marketing_kickoff_items")
        .select("id, channel, asset, launch_date, status, responsible, notes")
        .eq("plan_id", planId)
        .order("launch_date", { ascending: true, nullsFirst: true }),
      supabase
        .from("hiring_plan_roles")
        .select("id, role_title, headcount, start_date, monthly_cost_cents, status, notes")
        .eq("plan_id", planId)
        .order("start_date", { ascending: true, nullsFirst: true }),
    ])

  return {
    planName: planResult.data?.plan_name ?? "Launch Plan",
    shopName: planResult.data?.shop_name ?? null,
    ownerEmail: userResult.data?.email ?? null,
    targetOpeningDate: userResult.data?.target_opening_date ?? null,
    timeline: (timelineResult.data ?? []) as TimelineItem[],
    softOpen: (softOpenResult.data ?? []) as SoftOpenItem[],
    marketing: (marketingResult.data ?? []) as MarketingItem[],
    hiring: (hiringResult.data ?? []) as HiringRole[],
    readiness: (planResult.data?.latest_readiness_check as ReadinessResult | null) ?? null,
    readinessCheckedAt: planResult.data?.latest_readiness_check_at ?? null,
  }
}

// ── Template export ───────────────────────────────────────────────────────────

export const launchPlanTemplate: PdfTemplate<LaunchPlanContent> = {
  workspace_key: "launch_plan",

  dataLoader: (planId, userId, supabase) =>
    loadLaunchPlanData(planId, userId, supabase),

  render: (ctx) => {
    return (
      <LaunchPlanPdf
        content={ctx.content}
        generatedDate={fmtDateLong(new Date())}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.content.shopName ?? ctx.content.planName)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-launch-plan-${slug}-${date}.pdf`
  },
}
