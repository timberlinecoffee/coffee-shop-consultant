import type { ReactElement } from "react"
import type { WorkspaceKey } from "@/types/supabase"
import type { BrandTokens } from "./brand"

export type PdfRenderContext<TContent = unknown> = {
  content: TContent
  brand: BrandTokens
  user: { id: string; email: string | null }
  plan: { id: string; shop_name: string | null }
}

export type PdfTemplate<TContent = unknown> = {
  workspace_key: WorkspaceKey
  render: (ctx: PdfRenderContext<TContent>) => ReactElement
  filename: (ctx: PdfRenderContext<TContent>) => string
  also_load?: WorkspaceKey[]
}

// Registry maps templateId → PdfTemplate.
// To add a new template: write templates/<name>.tsx + add one line here.
export const PDF_TEMPLATES: Record<string, PdfTemplate> = {
  // financials_full_report: added by TIM-715
  // menu_card_with_cost_analysis: added by TIM-708
}

export type TemplateId = keyof typeof PDF_TEMPLATES

export function getTemplate(id: string): PdfTemplate | null {
  return PDF_TEMPLATES[id] ?? null
}
