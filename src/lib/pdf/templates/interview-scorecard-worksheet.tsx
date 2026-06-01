// TIM-1482: Printable interview scorecard worksheet.
// Landscape Letter matrix: value rows (question + weight) × candidate columns.
// Candidates are a print-time customisation passed via ?candidates=Alice,Bob,Carol
// — not persisted; no candidate entities created.

import React from "react"
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND, pdfDocMeta, brandFilePrefix } from "../brand"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import type { PdfTemplate } from "../registry"
import type { InterviewScorecard, InterviewQuestion, OrgRole } from "@/lib/hiring"

registerFonts()

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "untitled"
}

const MAX_CANDIDATES = 5
const DEFAULT_CANDIDATES = ["Candidate 1", "Candidate 2", "Candidate 3"]

function parseCandidates(raw: string | null): string[] {
  if (!raw?.trim()) return DEFAULT_CANDIDATES
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CANDIDATES)
  return parsed.length > 0 ? parsed : DEFAULT_CANDIDATES
}

// ── layout constants ──────────────────────────────────────────────────────────

// Landscape Letter: 792 × 612 pt
const MARGIN = 32
const PAGE_WIDTH = 792
const PAGE_HEIGHT = 612
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2  // 728
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - 32 // ~space for header/footer

const HEADER_FOOTER_ALLOWANCE = 40 // rough pts for PdfHeader + PdfFooter
const LEFT_COL = 200
// Candidate column width computed at render time from CONTENT_WIDTH - LEFT_COL

// ── styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: MARGIN,
    paddingBottom: MARGIN + 20, // extra for footer
    paddingLeft: MARGIN,
    paddingRight: MARGIN,
  },
  // Title block
  title: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 14,
    fontWeight: 600,
    color: BRAND.colors.ink,
    marginBottom: 2,
  },
  meta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 10,
  },
  rule: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 10,
  },
  // Table
  table: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 3,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#E8F0EA",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  lastDataRow: {
    flexDirection: "row",
  },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#F4F7F4",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
  },
  // Cells
  leftCell: {
    width: LEFT_COL,
    padding: 7,
    borderRightWidth: 1,
    borderRightColor: BRAND.colors.rule,
  },
  candidateCell: {
    flex: 1,
    padding: 7,
  },
  candidateCellBorder: {
    flex: 1,
    padding: 7,
    borderRightWidth: 1,
    borderRightColor: BRAND.colors.rule,
  },
  // Header cell text
  headerLeftLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    fontWeight: 700,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerCandidateName: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    fontWeight: 700,
    color: BRAND.colors.primary,
    textAlign: "center",
  },
  // Question cell content
  questionPrompt: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8.5,
    color: BRAND.colors.ink,
    lineHeight: 1.35,
    marginBottom: 4,
  },
  weightBadge: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    color: BRAND.colors.muted,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    alignSelf: "flex-start",
  },
  // Rating
  circleRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    marginBottom: 5,
    justifyContent: "center",
  },
  circle: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  circleNum: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 6.5,
    color: BRAND.colors.muted,
    textAlign: "center",
    lineHeight: 1,
  },
  // Notes
  notesLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    color: BRAND.colors.muted,
    marginBottom: 2,
  },
  noteLine: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 6,
  },
  // Summary
  summaryLeftLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    fontWeight: 700,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  summaryTotalLine: {
    height: 1,
    backgroundColor: BRAND.colors.ink,
    marginBottom: 8,
  },
  summaryRecommendLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    color: BRAND.colors.muted,
    marginBottom: 2,
  },
  emptyNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 10,
  },
  scaleNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    color: BRAND.colors.muted,
    marginTop: 6,
  },
})

// ── Sub-components ────────────────────────────────────────────────────────────

function RatingDots() {
  return (
    <View style={S.circleRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={S.circle}>
          <Text style={S.circleNum}>{n}</Text>
        </View>
      ))}
    </View>
  )
}

function CandidateScoreCell({ isLast }: { isLast: boolean }) {
  return (
    <View style={isLast ? S.candidateCell : S.candidateCellBorder}>
      <RatingDots />
      <Text style={S.notesLabel}>Notes:</Text>
      <View style={S.noteLine} />
      <View style={S.noteLine} />
    </View>
  )
}

// ── Main PDF component ────────────────────────────────────────────────────────

type WorksheetContent = {
  scorecard: InterviewScorecard
  questions: InterviewQuestion[]
  role: OrgRole | null
  candidates: string[]
}

function ScorecardWorksheetPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: WorksheetContent
  shopName: string | null
  generatedDate: string
}) {
  const { scorecard, questions, role, candidates } = content

  return (
    <Document {...pdfDocMeta(shopName)}>
      <Page size="LETTER" orientation="landscape" style={S.page}>
        <PdfHeader shopName={shopName} workspaceName="Interview Worksheet" />

        <Text style={S.title}>{scorecard.name}</Text>
        <Text style={S.meta}>
          {role ? `Role: ${role.role_title}` : "General Scorecard"} · Print and score candidates during interviews
        </Text>
        <View style={S.rule} />

        {questions.length === 0 ? (
          <Text style={S.emptyNote}>
            No questions added to this scorecard yet. Add questions to populate this worksheet.
          </Text>
        ) : (
          <View style={S.table}>
            {/* Header row */}
            <View style={S.headerRow} fixed>
              <View style={S.leftCell}>
                <Text style={S.headerLeftLabel}>Value / Question · Weight</Text>
              </View>
              {candidates.map((name, i) => (
                <View
                  key={i}
                  style={i < candidates.length - 1 ? S.candidateCellBorder : S.candidateCell}
                >
                  <Text style={S.headerCandidateName}>{name}</Text>
                </View>
              ))}
            </View>

            {/* Question rows */}
            {questions.map((q, idx) => {
              const isLast = idx === questions.length - 1
              return (
                <View
                  key={q.id}
                  style={isLast ? S.lastDataRow : S.dataRow}
                  wrap={false}
                >
                  <View style={S.leftCell}>
                    <Text style={S.questionPrompt}>
                      {idx + 1}. {q.prompt || "Untitled question"}
                    </Text>
                    <Text style={S.weightBadge}>Weight {q.weight}/5</Text>
                  </View>
                  {candidates.map((_, i) => (
                    <CandidateScoreCell key={i} isLast={i === candidates.length - 1} />
                  ))}
                </View>
              )
            })}

            {/* Summary row */}
            <View style={S.summaryRow} wrap={false}>
              <View style={S.leftCell}>
                <Text style={S.summaryLeftLabel}>Weighted Total</Text>
                <Text style={S.summaryRecommendLabel}>Higher weight = more impact on score</Text>
              </View>
              {candidates.map((_, i) => (
                <View
                  key={i}
                  style={i < candidates.length - 1 ? S.candidateCellBorder : S.candidateCell}
                >
                  <View style={S.summaryTotalLine} />
                  <Text style={S.summaryRecommendLabel}>Recommendation:</Text>
                  <View style={S.summaryTotalLine} />
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={S.scaleNote}>Rating scale: 1 = Does not meet expectations · 3 = Meets expectations · 5 = Exceeds expectations</Text>

        <PdfFooter generatedDate={generatedDate} />
      </Page>
    </Document>
  )
}

// ── Template export ───────────────────────────────────────────────────────────

export const scorecardWorksheetTemplate: PdfTemplate<WorksheetContent> = {
  workspace_key: "hiring",

  dataLoader: async (planId, _userId, supabase, searchParams) => {
    const scorecardId = searchParams.get("scorecard_id")

    let scorecard: InterviewScorecard | null = null

    if (scorecardId) {
      const { data } = await supabase
        .from("interview_scorecards")
        .select("*")
        .eq("id", scorecardId)
        .eq("plan_id", planId)
        .single()
      scorecard = data ?? null
    }

    if (!scorecard) {
      const { data: defaultSc } = await supabase
        .from("interview_scorecards")
        .select("*")
        .eq("plan_id", planId)
        .eq("is_default", true)
        .limit(1)
        .single()
      scorecard = defaultSc ?? null
    }

    if (!scorecard) {
      const { data: firstSc } = await supabase
        .from("interview_scorecards")
        .select("*")
        .eq("plan_id", planId)
        .order("order_index", { ascending: true })
        .limit(1)
        .single()
      scorecard = firstSc ?? null
    }

    if (!scorecard) {
      throw new Error("No scorecards found for this plan")
    }

    const { data: questionsData } = await supabase
      .from("interview_questions")
      .select("*")
      .eq("scorecard_id", scorecard.id)
      .order("order_index", { ascending: true })

    const questions: InterviewQuestion[] = questionsData ?? []

    let role: OrgRole | null = null
    if (scorecard.role_id) {
      const { data: roleData } = await supabase
        .from("hiring_plan_roles")
        .select("*")
        .eq("id", scorecard.role_id)
        .single()
      role = roleData ?? null
    }

    const candidates = parseCandidates(searchParams.get("candidates"))

    return { scorecard, questions, role, candidates }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <ScorecardWorksheetPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.content.scorecard.name)
    const date = fmtYyyymmdd(new Date())
    return `${brandFilePrefix(ctx.plan.shop_name)}-scorecard-worksheet-${slug}-${date}.pdf`
  },
}
