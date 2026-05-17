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
  // Templates can be sync (pure layout) or async (need to pre-render charts,
  // fetch images, etc). The route awaits either way.
  render: (
    ctx: PdfRenderContext<TContent>
  ) => ReactElement | Promise<ReactElement>
  filename: (ctx: PdfRenderContext<TContent>) => string
  also_load?: WorkspaceKey[]
  // Optional: when present the route calls this instead of querying
  // workspace_documents. Use for workspaces backed by row-based tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataLoader?: (planId: string, userId: string, supabase: any) => Promise<TContent>
}

// Registry maps templateId → PdfTemplate.
// To add a new template: write templates/<name>.tsx + add one line here.
// Templates register themselves into this map by calling `registerTemplate`
// from `src/lib/pdf/templates/index.ts`. Keep this file free of `.tsx` imports
// so it stays loadable by the Node test runner (strip-types).
export const PDF_TEMPLATES: Record<string, PdfTemplate> = {}

export type TemplateId = string

export function registerTemplate(id: string, tmpl: PdfTemplate): void {
  PDF_TEMPLATES[id] = tmpl
}

export function getTemplate(id: string): PdfTemplate | null {
  return PDF_TEMPLATES[id] ?? null
}
