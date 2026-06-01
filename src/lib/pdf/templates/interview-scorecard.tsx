import React from "react"
import { Document, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { LetterPageShell } from "../components/LetterPageShell"
import type { PdfTemplate } from "../registry"
import type { InterviewScorecard, InterviewQuestion, OrgRole } from "@/lib/hiring"

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scorecardTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 20,
    fontWeight: 600,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  meta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
    marginBottom: 14,
  },
  rule: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 14,
  },
  // Candidate header fields
  fieldRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 14,
  },
  fieldBox: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.ink,
    paddingBottom: 2,
  },
  fieldLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  // Question block
  questionBlock: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  questionPrompt: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    flex: 1,
    lineHeight: 1.4,
    marginRight: 8,
  },
  weightBadge: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    flexShrink: 0,
  },
  circleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  circleLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginRight: 4,
  },
  circle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
  },
  circleNumber: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 7,
    color: BRAND.colors.muted,
    textAlign: "center",
    lineHeight: 1,
    paddingTop: 2,
  },
  notesLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 2,
  },
  notesLine: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 1,
  },
  // Overall score box
  overallBox: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 4,
    padding: 10,
    marginTop: 8,
  },
  overallTitle: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 10,
    color: BRAND.colors.primary,
    marginBottom: 8,
  },
  overallScoreLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overallScoreLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    width: 100,
  },
  overallScoreBlank: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.ink,
    height: 16,
  },
  emptyNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 8,
  },
})

// ── content type ──────────────────────────────────────────────────────────────

type ScorecardContent = {
  scorecard: InterviewScorecard
  questions: InterviewQuestion[]
  role: OrgRole | null
}

// ── PDF component ─────────────────────────────────────────────────────────────

function ScorecardCircle({ filled }: { filled: boolean }) {
  return (
    <View
      style={[
        styles.circle,
        filled ? { backgroundColor: BRAND.colors.primary, borderColor: BRAND.colors.primary } : {},
      ]}
    />
  )
}

function RatingCircles({ count = 5, filled = 0 }: { count?: number; filled?: number }) {
  return (
    <View style={styles.circleRow}>
      <Text style={styles.circleLabel}>Rating (1–5):</Text>
      {Array.from({ length: count }, (_, i) => (
        <ScorecardCircle key={i} filled={i < filled} />
      ))}
    </View>
  )
}

function ScorecardBlankPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: ScorecardContent
  shopName: string | null
  generatedDate: string
}) {
  const { scorecard, questions, role } = content
  return (
    <Document creator="Timberline Coffee School" producer="Timberline Coffee School">
      <LetterPageShell
        shopName={shopName}
        workspaceName="Interview Scorecard"
        generatedDate={generatedDate}
      >
        <Text style={styles.scorecardTitle}>{scorecard.name}</Text>
        <Text style={styles.meta}>
          {role ? `Role: ${role.role_title}` : "General Scorecard"} · Blank form — print and complete during interview
        </Text>
        <View style={styles.rule} />

        {/* Candidate fields */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Candidate Name</Text>
          </View>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Interview Date</Text>
          </View>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Interviewer</Text>
          </View>
        </View>

        {/* Questions */}
        {questions.length === 0 ? (
          <Text style={styles.emptyNote}>
            No questions added to this scorecard yet. Add questions to populate this form.
          </Text>
        ) : (
          questions.map((q, idx) => (
            <View key={q.id} style={styles.questionBlock}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionPrompt}>
                  {idx + 1}. {q.prompt || "Untitled question"}
                </Text>
                <Text style={styles.weightBadge}>Weight: {q.weight}</Text>
              </View>
              <RatingCircles count={5} filled={0} />
              <Text style={styles.notesLabel}>Notes:</Text>
              <View style={styles.notesLine} />
              <View style={[styles.notesLine, { marginTop: 10 }]} />
            </View>
          ))
        )}

        {/* Overall score */}
        <View style={styles.overallBox}>
          <Text style={styles.overallTitle}>Overall Score</Text>
          <View style={styles.overallScoreLine}>
            <Text style={styles.overallScoreLabel}>Weighted total:</Text>
            <View style={styles.overallScoreBlank} />
          </View>
          <View style={[styles.overallScoreLine, { marginTop: 8 }]}>
            <Text style={styles.overallScoreLabel}>Recommendation:</Text>
            <View style={styles.overallScoreBlank} />
          </View>
        </View>
      </LetterPageShell>
    </Document>
  )
}

// ── template export ───────────────────────────────────────────────────────────

export const scorecardBlankTemplate: PdfTemplate<ScorecardContent> = {
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
      // Try default scorecard for the plan
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
      // First scorecard for the plan
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

    return { scorecard, questions, role }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <ScorecardBlankPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.content.scorecard.name)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-scorecard-blank-${slug}-${date}.pdf`
  },
}
