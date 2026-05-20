// TIM-782: Location & Lease Summary PDF template.
// One page per candidate: header (name, address, status pill), rubric scores
// chart (6 factors 1-5), lease term highlights, AI commentary excerpt.
// Adopts the shared framework from TIM-712 — no framework code duplicated.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import type { ChartConfiguration } from "chart.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { BRAND } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfChartImage } from "../components/PdfChartImage"
import { chartToPng } from "../chart-to-png"
import type { PdfTemplate } from "../registry"

// ── DB row types ─────────────────────────────────────────────────────────────

type CandidateStatus =
  | "shortlisted"
  | "viewing_scheduled"
  | "lease_review"
  | "passed"
  | "signed"

type RubricFactorKey =
  | "foot_traffic"
  | "parking_transit"
  | "visibility"
  | "neighborhood_fit"
  | "buildout_cost_estimate"
  | "lease_terms"

type Candidate = {
  id: string
  name: string
  address: string | null
  neighborhood: string | null
  sq_ft: number | null
  asking_rent_cents: number | null
  status: CandidateStatus
  notes: string | null
}

type RubricScore = {
  candidate_id: string
  factor_key: RubricFactorKey
  score_1_5: number | null
  notes: string | null
}

type LeaseTerms = {
  candidate_id: string
  base_rent_cents: number | null
  rent_escalation_pct: number | null
  security_deposit_cents: number | null
  ti_allowance_cents: number | null
  term_months: number | null
  options_text: string | null
  personal_guarantee: string | null
  exit_clauses: string | null
}

type AiMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

// ── extra data loaded per-plan ───────────────────────────────────────────────

type LocationLeaseExtra = {
  candidates: Candidate[]
  scoresByCandidate: Record<string, RubricScore[]>
  termsByCandidate: Record<string, LeaseTerms>
  aiCommentary: string | null
}

async function locationLeaseDataLoader(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  planId: string,
): Promise<LocationLeaseExtra> {
  // First fetch candidates, then fan out to scores/terms using their IDs.
  const { data: candidateRows } = await supabase
    .from("location_candidates")
    .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes")
    .eq("plan_id", planId)
    .eq("archived", false)
    .order("position", { ascending: true })

  const candidateIds = ((candidateRows ?? []) as Candidate[]).map((c) => c.id)

  const [{ data: scoreRows }, { data: termRows }, { data: threadRow }] = await Promise.all([
    candidateIds.length > 0
      ? supabase
          .from("location_rubric_scores")
          .select("candidate_id, factor_key, score_1_5, notes")
          .in("candidate_id", candidateIds)
      : Promise.resolve({ data: [] }),

    candidateIds.length > 0
      ? supabase
          .from("location_lease_terms")
          .select(
            "candidate_id, base_rent_cents, rent_escalation_pct, security_deposit_cents, ti_allowance_cents, term_months, options_text, personal_guarantee, exit_clauses",
          )
          .in("candidate_id", candidateIds)
      : Promise.resolve({ data: [] }),

    supabase
      .from("ai_conversations")
      .select("messages")
      .eq("plan_id", planId)
      .eq("workspace_key", "location_lease")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])

  const candidates: Candidate[] = (candidateRows ?? []) as Candidate[]

  const scoresByCandidate: Record<string, RubricScore[]> = {}
  for (const s of (scoreRows ?? []) as RubricScore[]) {
    if (!scoresByCandidate[s.candidate_id]) scoresByCandidate[s.candidate_id] = []
    scoresByCandidate[s.candidate_id].push(s)
  }

  const termsByCandidate: Record<string, LeaseTerms> = {}
  for (const t of (termRows ?? []) as LeaseTerms[]) {
    termsByCandidate[t.candidate_id] = t
  }

  // Extract last assistant message from the most recent location_lease thread.
  let aiCommentary: string | null = null
  const messages = (threadRow?.messages ?? []) as AiMessage[]
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      aiCommentary = messages[i].content.slice(0, 600)
      break
    }
  }

  return { candidates, scoresByCandidate, termsByCandidate, aiCommentary }
}

// ── label dictionaries ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<CandidateStatus, string> = {
  shortlisted: "Shortlisted",
  viewing_scheduled: "Viewing scheduled",
  lease_review: "Lease review",
  passed: "Passed",
  signed: "Signed",
}

const STATUS_COLOR: Record<CandidateStatus, string> = {
  shortlisted: "#E8C24A",
  viewing_scheduled: "#3B82F6",
  lease_review: "#8B5CF6",
  passed: "#6B7B70",
  signed: "#1A6E3B",
}

const FACTOR_LABEL: Record<RubricFactorKey, string> = {
  foot_traffic: "Foot traffic",
  parking_transit: "Parking / transit",
  visibility: "Visibility",
  neighborhood_fit: "Neighborhood fit",
  buildout_cost_estimate: "Build-out cost",
  lease_terms: "Lease terms",
}

const FACTOR_ORDER: RubricFactorKey[] = [
  "foot_traffic",
  "parking_transit",
  "visibility",
  "neighborhood_fit",
  "buildout_cost_estimate",
  "lease_terms",
]

// ── formatters ────────────────────────────────────────────────────────────────

function fmtUsd(cents: number | null): string {
  if (cents === null) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtPct(val: number | null): string {
  if (val === null) return "—"
  return `${val}%`
}

function fmtMonths(val: number | null): string {
  if (val === null) return "—"
  if (val % 12 === 0) return `${val / 12} yr${val / 12 !== 1 ? "s" : ""}`
  return `${val} mo`
}

function fmtStr(val: string | null): string {
  return val?.trim() || "—"
}

function slugify(s: string | null): string {
  return (s ?? "plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "plan"
}

function fmtYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

// ── rubric chart ──────────────────────────────────────────────────────────────

function rubricChartConfig(scores: RubricScore[]): ChartConfiguration {
  const scoreMap: Record<string, number> = {}
  for (const s of scores) {
    if (s.score_1_5 !== null) scoreMap[s.factor_key] = s.score_1_5
  }
  const labels = FACTOR_ORDER.map((k) => FACTOR_LABEL[k])
  const values = FACTOR_ORDER.map((k) => scoreMap[k] ?? 0)
  const colors = values.map((v) =>
    v >= 4 ? "#1A6E3B" : v >= 3 ? "#3B82F6" : v >= 2 ? "#E8C24A" : v > 0 ? "#EF4444" : "#D9DEDA",
  )

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderRadius: 3,
          barThickness: 24,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: "#E5E7EB" },
        },
        y: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  }
}

async function renderRubricChart(scores: RubricScore[]): Promise<Buffer | null> {
  const hasAnyScore = scores.some((s) => s.score_1_5 !== null)
  if (!hasAnyScore) return null
  try {
    return await chartToPng({ config: rubricChartConfig(scores), width: 700, height: 280 })
  } catch {
    return null
  }
}

// ── styles ────────────────────────────────────────────────────────────────────

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
  // Candidate header
  candidateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  candidateName: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 18,
    color: BRAND.colors.primary,
    marginBottom: 2,
  },
  candidateAddress: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.muted,
    marginBottom: 2,
  },
  candidateMeta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusPillText: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 600,
    fontSize: 9,
    color: BRAND.colors.paper,
  },
  // Lease highlights grid
  leaseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  leaseCell: {
    width: "30%",
    backgroundColor: "#F8FAF9",
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  leaseCellLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  leaseCellValue: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 11,
    color: BRAND.colors.ink,
  },
  leaseNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
    marginTop: 4,
  },
  // AI commentary
  aiCommentary: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    lineHeight: 1.5,
    fontStyle: "italic",
    backgroundColor: "#F8FAF9",
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: BRAND.colors.primary,
  },
  emptyNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  // Cover page
  coverPage: {
    backgroundColor: BRAND.colors.primary,
    padding: BRAND.page.margin,
    justifyContent: "center",
    flex: 1,
  },
  coverEyebrow: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 600,
    fontSize: 11,
    color: BRAND.colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  coverHeading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 26,
    color: BRAND.colors.paper,
    marginBottom: 6,
  },
  coverShopName: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 14,
    color: "#A7C4B5",
    marginBottom: 24,
  },
  coverMeta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: "#A7C4B5",
  },
  coverCount: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 600,
    fontSize: 13,
    color: BRAND.colors.accent,
    marginBottom: 4,
  },
})

// ── cover page ────────────────────────────────────────────────────────────────

function CoverPage({
  shopName,
  candidateCount,
  generatedDate,
}: {
  shopName: string | null
  candidateCount: number
  generatedDate: string
}) {
  return (
    <Page size={BRAND.page.size} style={styles.page}>
      <View style={styles.coverPage}>
        <Text style={styles.coverEyebrow}>Groundwork</Text>
        <Text style={styles.coverHeading}>Location & Lease{"\n"}Summary</Text>
        <Text style={styles.coverShopName}>{shopName ?? "Your coffee shop"}</Text>
        <Text style={styles.coverCount}>{candidateCount} candidate{candidateCount !== 1 ? "s" : ""}</Text>
        <Text style={styles.coverMeta}>Generated {generatedDate}</Text>
      </View>
    </Page>
  )
}

// ── per-candidate page ────────────────────────────────────────────────────────

function RubricSection({
  scores,
  chartPng,
}: {
  scores: RubricScore[]
  chartPng: Buffer | null
}) {
  const hasAnyScore = scores.some((s) => s.score_1_5 !== null)
  if (!hasAnyScore) {
    return (
      <PdfSection title="Rubric scores">
        <Text style={styles.emptyNote}>No rubric scores recorded yet.</Text>
      </PdfSection>
    )
  }

  const avg =
    scores.filter((s) => s.score_1_5 !== null).reduce((acc, s) => acc + (s.score_1_5 ?? 0), 0) /
    scores.filter((s) => s.score_1_5 !== null).length

  return (
    <PdfSection title={`Rubric scores — avg ${avg.toFixed(1)} / 5`}>
      {chartPng ? (
        <PdfChartImage src={chartPng} caption="Score 1 = poor, 5 = excellent. Colour: green ≥ 4, blue ≥ 3, yellow ≥ 2, red < 2." />
      ) : (
        // Fallback text table when chart rendering fails
        <View>
          {FACTOR_ORDER.map((key) => {
            const s = scores.find((x) => x.factor_key === key)
            return (
              <View
                key={key}
                style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: BRAND.colors.rule }}
              >
                <Text style={{ fontSize: 9 }}>{FACTOR_LABEL[key]}</Text>
                <Text style={{ fontSize: 9, fontWeight: 700 }}>
                  {s?.score_1_5 !== null && s?.score_1_5 !== undefined ? `${s.score_1_5} / 5` : "—"}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </PdfSection>
  )
}

function LeaseHighlightsSection({ terms }: { terms: LeaseTerms | undefined }) {
  if (!terms) {
    return (
      <PdfSection title="Lease highlights">
        <Text style={styles.emptyNote}>No lease terms recorded yet.</Text>
      </PdfSection>
    )
  }

  const cells: { label: string; value: string }[] = [
    { label: "Base rent / mo", value: fmtUsd(terms.base_rent_cents) },
    { label: "Escalation", value: fmtPct(terms.rent_escalation_pct) },
    { label: "TI allowance", value: fmtUsd(terms.ti_allowance_cents) },
    { label: "Security deposit", value: fmtUsd(terms.security_deposit_cents) },
    { label: "Term", value: fmtMonths(terms.term_months) },
    { label: "Personal guarantee", value: fmtStr(terms.personal_guarantee) },
  ]

  const hasExitClauses = terms.exit_clauses?.trim()
  const hasOptions = terms.options_text?.trim()

  return (
    <PdfSection title="Lease highlights">
      <View style={styles.leaseGrid}>
        {cells.map(({ label, value }) => (
          <View key={label} style={styles.leaseCell}>
            <Text style={styles.leaseCellLabel}>{label}</Text>
            <Text style={styles.leaseCellValue}>{value}</Text>
          </View>
        ))}
      </View>
      {hasOptions && (
        <Text style={styles.leaseNote}>Options: {terms.options_text}</Text>
      )}
      {hasExitClauses && (
        <Text style={styles.leaseNote}>Exit clauses: {terms.exit_clauses}</Text>
      )}
    </PdfSection>
  )
}

function AiCommentarySection({ commentary }: { commentary: string | null }) {
  if (!commentary) return null
  return (
    <PdfSection title="Co-pilot commentary">
      <Text style={styles.aiCommentary}>{commentary}</Text>
    </PdfSection>
  )
}

async function CandidatePage({
  candidate,
  scores,
  terms,
  aiCommentary,
  shopName,
  generatedDate,
}: {
  candidate: Candidate
  scores: RubricScore[]
  terms: LeaseTerms | undefined
  aiCommentary: string | null
  shopName: string | null
  generatedDate: string
}) {
  const chartPng = await renderRubricChart(scores)
  const statusColor = STATUS_COLOR[candidate.status] ?? BRAND.colors.muted

  return (
    <Page size={BRAND.page.size} style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName="Location & Lease Summary" />

      {/* Candidate header */}
      <View style={styles.candidateHeader}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={styles.candidateName}>{candidate.name}</Text>
          {candidate.address && (
            <Text style={styles.candidateAddress}>{candidate.address}</Text>
          )}
          {candidate.neighborhood && (
            <Text style={styles.candidateMeta}>
              {candidate.neighborhood}
              {candidate.sq_ft ? `  ·  ${candidate.sq_ft.toLocaleString()} sq ft` : ""}
            </Text>
          )}
          {!candidate.neighborhood && candidate.sq_ft && (
            <Text style={styles.candidateMeta}>{candidate.sq_ft.toLocaleString()} sq ft</Text>
          )}
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusPillText}>{STATUS_LABEL[candidate.status]}</Text>
        </View>
      </View>

      <RubricSection scores={scores} chartPng={chartPng} />
      <LeaseHighlightsSection terms={terms} />
      <AiCommentarySection commentary={aiCommentary} />

      <PdfFooter generatedDate={generatedDate} />
    </Page>
  )
}

// ── top-level document ────────────────────────────────────────────────────────

async function renderDocument(
  extra: LocationLeaseExtra,
  shopName: string | null,
  generatedDate: string,
): Promise<React.ReactElement> {
  const { candidates, scoresByCandidate, termsByCandidate, aiCommentary } = extra

  const candidatePages = await Promise.all(
    candidates.map((c) =>
      CandidatePage({
        candidate: c,
        scores: scoresByCandidate[c.id] ?? [],
        terms: termsByCandidate[c.id],
        aiCommentary,
        shopName,
        generatedDate,
      }),
    ),
  )

  return (
    <PdfDocument>
      <CoverPage
        shopName={shopName}
        candidateCount={candidates.length}
        generatedDate={generatedDate}
      />
      {candidatePages}
    </PdfDocument>
  )
}

// ── template export ───────────────────────────────────────────────────────────

export const locationLeaseTemplate: PdfTemplate<unknown, LocationLeaseExtra> = {
  workspace_key: "location_lease",

  dataLoader: locationLeaseDataLoader,

  render: async (ctx) => {
    const generatedDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    return renderDocument(ctx.extra ?? { candidates: [], scoresByCandidate: {}, termsByCandidate: {}, aiCommentary: null }, ctx.plan.shop_name, generatedDate)
  },

  filename: (ctx) => {
    const slug = slugify(ctx.plan.shop_name)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-location-lease-${slug}-${date}.pdf`
  },
}
