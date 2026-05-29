import React from "react"
import { Document, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { LetterPageShell } from "../components/LetterPageShell"
import type { PdfTemplate } from "../registry"
import type { StaffCompetency, StaffFile, CompetencyEvaluation, OrgRole } from "@/lib/hiring"

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
  formTitle: {
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
  // Header fields
  fieldRow: {
    flexDirection: "row",
    gap: 12,
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
  // Table header
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND.colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 0,
  },
  tableHeaderText: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 8,
    color: BRAND.colors.paper,
  },
  colSkill: { width: 90 },
  colRubric: { flex: 1 },
  colWeight: { width: 32, textAlign: "center" },
  colRating: { width: 80, textAlign: "center" },
  // Row
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: "var(--warm-near-white)",
  },
  cellText: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    lineHeight: 1.3,
  },
  cellMuted: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    lineHeight: 1.3,
  },
  circleRow: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
  },
  circle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
  },
  circleFilled: {
    backgroundColor: BRAND.colors.primary,
    borderColor: BRAND.colors.primary,
  },
  // Notes row
  notesRow: {
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  notesLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 3,
  },
  notesLine: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
  },
  // Footer
  formFooter: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    flexDirection: "row",
    gap: 24,
  },
  signatureLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.ink,
    paddingBottom: 2,
  },
  signatureLabel: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    marginBottom: 12,
  },
  // Summary box
  summaryBox: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    borderRadius: 4,
    padding: 10,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 10,
    color: BRAND.colors.primary,
  },
  summaryValue: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 14,
    fontWeight: 700,
    color: BRAND.colors.ink,
  },
  summaryBlank: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.ink,
    width: 80,
    height: 20,
  },
  emptyNote: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 8,
  },
})

// ── content types ─────────────────────────────────────────────────────────────

type BlankContent = {
  competencies: StaffCompetency[]
  formName: string | null
}

type CompletedContent = {
  staffFile: StaffFile
  competencies: StaffCompetency[]
  evaluations: CompetencyEvaluation[]
  role: OrgRole | null
}

// ── shared sub-components ─────────────────────────────────────────────────────

function RatingDots({ total, filled }: { total: number; filled: number }) {
  return (
    <View style={styles.circleRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.circle, i < filled ? styles.circleFilled : {}]}
        />
      ))}
    </View>
  )
}

// ── blank competency PDF ──────────────────────────────────────────────────────

function CompetencyBlankPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: BlankContent
  shopName: string | null
  generatedDate: string
}) {
  const { competencies, formName } = content
  const title = formName ? `${formName} — Competency Form` : "Competency Evaluation Form"

  return (
    <Document creator="Groundwork" producer="Groundwork">
      <LetterPageShell
        shopName={shopName}
        workspaceName="Competency Form"
        generatedDate={generatedDate}
      >
        <Text style={styles.formTitle}>{title}</Text>
        <Text style={styles.meta}>Blank form — print and complete during evaluation</Text>
        <View style={styles.rule} />

        {/* Staff header */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Staff Name</Text>
          </View>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Role</Text>
          </View>
          <View style={styles.fieldBox}>
            <Text style={styles.fieldLabel}>Evaluation Date</Text>
          </View>
        </View>

        {/* Table */}
        {competencies.length === 0 ? (
          <Text style={styles.emptyNote}>
            No competencies defined. Add skills in the Competency Framework in Groundwork.
          </Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colSkill]}>Skill</Text>
              <Text style={[styles.tableHeaderText, styles.colRubric]}>Rubric</Text>
              <Text style={[styles.tableHeaderText, styles.colWeight]}>Wt</Text>
              <Text style={[styles.tableHeaderText, styles.colRating]}>Rating (1–5)</Text>
            </View>

            {competencies.map((comp, idx) => (
              <React.Fragment key={comp.id}>
                <View style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <View style={styles.colSkill}>
                    <Text style={styles.cellText}>{comp.skill || "—"}</Text>
                  </View>
                  <View style={styles.colRubric}>
                    <Text style={styles.cellMuted}>{comp.rubric || "—"}</Text>
                  </View>
                  <View style={styles.colWeight}>
                    <Text style={[styles.cellText, { textAlign: "center" }]}>{comp.weight}</Text>
                  </View>
                  <View style={styles.colRating}>
                    <RatingDots total={5} filled={0} />
                  </View>
                </View>
                <View style={[styles.notesRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <View style={styles.notesLine} />
                </View>
              </React.Fragment>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={styles.formFooter}>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Evaluator Signature:</Text>
          </View>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Date Signed:</Text>
          </View>
        </View>
      </LetterPageShell>
    </Document>
  )
}

// ── completed competency PDF ──────────────────────────────────────────────────

function CompetencyCompletedPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: CompletedContent
  shopName: string | null
  generatedDate: string
}) {
  const { staffFile, competencies, evaluations, role } = content

  // Compute weighted average
  let weightedSum = 0
  let totalWeight = 0
  for (const comp of competencies) {
    const ev = evaluations.find((e) => e.competency_id === comp.id)
    if (ev && ev.score > 0) {
      weightedSum += ev.score * comp.weight
      totalWeight += comp.weight * 5
    }
  }
  const weightedAvg = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : null

  return (
    <Document creator="Groundwork" producer="Groundwork">
      <LetterPageShell
        shopName={shopName}
        workspaceName="Competency Evaluation"
        generatedDate={generatedDate}
      >
        <Text style={styles.formTitle}>
          Competency Evaluation — {staffFile.name || "Staff Member"}
        </Text>
        <Text style={styles.meta}>
          {role ? `Role: ${role.role_title}` : "No role assigned"}
          {staffFile.hire_date ? ` · Hired: ${staffFile.hire_date}` : ""}
          {" · Evaluated: "}
          {generatedDate}
        </Text>
        <View style={styles.rule} />

        {/* Table */}
        {competencies.length === 0 ? (
          <Text style={styles.emptyNote}>
            No competencies defined in the framework.
          </Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colSkill]}>Skill</Text>
              <Text style={[styles.tableHeaderText, styles.colRubric]}>Rubric</Text>
              <Text style={[styles.tableHeaderText, styles.colWeight]}>Wt</Text>
              <Text style={[styles.tableHeaderText, styles.colRating]}>Score (1–5)</Text>
            </View>

            {competencies.map((comp, idx) => {
              const ev = evaluations.find((e) => e.competency_id === comp.id)
              const score = ev?.score ?? 0
              return (
                <React.Fragment key={comp.id}>
                  <View style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                    <View style={styles.colSkill}>
                      <Text style={styles.cellText}>{comp.skill || "—"}</Text>
                    </View>
                    <View style={styles.colRubric}>
                      <Text style={styles.cellMuted}>{comp.rubric || "—"}</Text>
                    </View>
                    <View style={styles.colWeight}>
                      <Text style={[styles.cellText, { textAlign: "center" }]}>{comp.weight}</Text>
                    </View>
                    <View style={styles.colRating}>
                      <RatingDots total={5} filled={score} />
                    </View>
                  </View>
                  {ev?.notes && (
                    <View style={[styles.notesRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                      <Text style={styles.notesLabel}>Notes: {ev.notes}</Text>
                    </View>
                  )}
                </React.Fragment>
              )
            })}
          </>
        )}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Weighted Average Score</Text>
          {weightedAvg !== null ? (
            <Text style={styles.summaryValue}>{weightedAvg.toFixed(0)}%</Text>
          ) : (
            <View style={styles.summaryBlank} />
          )}
        </View>
      </LetterPageShell>
    </Document>
  )
}

// ── template exports ──────────────────────────────────────────────────────────

export const competencyBlankTemplate: PdfTemplate<BlankContent> = {
  workspace_key: "hiring",

  dataLoader: async (planId, _userId, supabase, searchParams) => {
    const formTemplateId = searchParams.get("form_template_id")

    let query = supabase
      .from("staff_competencies")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true })

    if (formTemplateId) {
      query = query.eq("form_template_id", formTemplateId)
    }

    const { data } = await query
    const competencies: StaffCompetency[] = data ?? []

    let formName: string | null = null
    if (formTemplateId) {
      const { data: formData } = await supabase
        .from("competency_form_templates")
        .select("name")
        .eq("id", formTemplateId)
        .single()
      formName = formData?.name ?? null
    }

    return { competencies, formName }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <CompetencyBlankPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (_ctx) => {
    const date = fmtYyyymmdd(new Date())
    return `groundwork-competency-blank-${date}.pdf`
  },
}

export const competencyCompletedTemplate: PdfTemplate<CompletedContent> = {
  workspace_key: "hiring",

  dataLoader: async (planId, _userId, supabase, searchParams) => {
    const staffFileId = searchParams.get("staff_file_id")

    if (!staffFileId) {
      throw new Error("staff_file_id is required for hiring_competency_completed")
    }

    const { data: staffData } = await supabase
      .from("staff_files")
      .select("*")
      .eq("id", staffFileId)
      .eq("plan_id", planId)
      .single()

    if (!staffData) {
      throw new Error("Staff file not found")
    }

    const staffFile: StaffFile = staffData

    const { data: competenciesData } = await supabase
      .from("staff_competencies")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true })

    const competencies: StaffCompetency[] = competenciesData ?? []

    const { data: evaluationsData } = await supabase
      .from("competency_evaluations")
      .select("*")
      .eq("staff_file_id", staffFile.id)

    const evaluations: CompetencyEvaluation[] = evaluationsData ?? []

    let role: OrgRole | null = null
    if (staffFile.role_id) {
      const { data: roleData } = await supabase
        .from("hiring_plan_roles")
        .select("*")
        .eq("id", staffFile.role_id)
        .single()
      role = roleData ?? null
    }

    return { staffFile, competencies, evaluations, role }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <CompetencyCompletedPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.content.staffFile.name)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-competency-${slug}-${date}.pdf`
  },
}
