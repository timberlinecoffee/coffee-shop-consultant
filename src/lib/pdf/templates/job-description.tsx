"use client"

import React from "react"
import { Document, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { LetterPageShell } from "../components/LetterPageShell"
import type { PdfTemplate } from "../registry"
import type { OrgRole, JobDescriptionTemplate } from "@/lib/hiring"

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
  roleTitle: {
    fontFamily: BRAND.fonts.serif,
    fontSize: 22,
    fontWeight: 600,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  roleMeta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
    marginBottom: 16,
  },
  rule: {
    height: 1,
    backgroundColor: BRAND.colors.rule,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 10,
    color: BRAND.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionBody: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    lineHeight: 1.5,
    marginBottom: 14,
  },
  placeholder: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.muted,
    fontStyle: "italic",
    lineHeight: 1.5,
    marginBottom: 14,
  },
})

// ── content type ──────────────────────────────────────────────────────────────

type JdContent = {
  role: OrgRole
  jd: JobDescriptionTemplate | null
}

// ── PDF component ─────────────────────────────────────────────────────────────

function JobDescriptionPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: JdContent
  shopName: string | null
  generatedDate: string
}) {
  const { role, jd } = content
  return (
    <Document creator="Groundwork" producer="Groundwork">
      <LetterPageShell
        shopName={shopName}
        workspaceName="Job Description"
        generatedDate={generatedDate}
      >
        <Text style={styles.roleTitle}>{jd?.title || role.role_title || "Untitled Role"}</Text>
        <Text style={styles.roleMeta}>
          {shopName ?? "Your Coffee Shop"} · {role.headcount} headcount · Status: {role.status}
        </Text>
        <View style={styles.rule} />

        <Text style={styles.sectionTitle}>Summary</Text>
        {jd?.summary ? (
          <Text style={styles.sectionBody}>{jd.summary}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No summary written yet. Open the Job Description editor in Groundwork to add one.
          </Text>
        )}

        <Text style={styles.sectionTitle}>Responsibilities</Text>
        {jd?.responsibilities ? (
          <Text style={styles.sectionBody}>{jd.responsibilities}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No responsibilities listed yet. Add them in the Job Description editor.
          </Text>
        )}

        <Text style={styles.sectionTitle}>Requirements</Text>
        {jd?.requirements ? (
          <Text style={styles.sectionBody}>{jd.requirements}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No requirements listed yet. Add them in the Job Description editor.
          </Text>
        )}

        <Text style={styles.sectionTitle}>Compensation &amp; Benefits</Text>
        {jd?.comp ? (
          <Text style={styles.sectionBody}>{jd.comp}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No compensation details listed yet. Add them in the Job Description editor.
          </Text>
        )}
      </LetterPageShell>
    </Document>
  )
}

// ── template export ───────────────────────────────────────────────────────────

export const jobDescriptionTemplate: PdfTemplate<JdContent> = {
  workspace_key: "hiring",

  dataLoader: async (planId, _userId, supabase, searchParams) => {
    const roleId = searchParams.get("role_id")

    let role: OrgRole | null = null

    if (roleId) {
      const { data } = await supabase
        .from("org_roles")
        .select("*")
        .eq("id", roleId)
        .eq("plan_id", planId)
        .single()
      role = data ?? null
    }

    if (!role) {
      // Fall back to first active role for the plan
      const { data } = await supabase
        .from("org_roles")
        .select("*")
        .eq("plan_id", planId)
        .in("status", ["planned", "posted", "interviewing"])
        .order("role_title", { ascending: true })
        .limit(1)
        .single()
      role = data ?? null
    }

    if (!role) {
      // Last resort: any role
      const { data } = await supabase
        .from("org_roles")
        .select("*")
        .eq("plan_id", planId)
        .limit(1)
        .single()
      role = data ?? null
    }

    if (!role) {
      throw new Error("No roles found for this plan")
    }

    let jd: JobDescriptionTemplate | null = null
    if (role.jd_template_id) {
      const { data } = await supabase
        .from("job_description_templates")
        .select("*")
        .eq("id", role.jd_template_id)
        .single()
      jd = data ?? null
    }

    return { role, jd }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <JobDescriptionPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.content.role.role_title)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-jd-${slug}-${date}.pdf`
  },
}
