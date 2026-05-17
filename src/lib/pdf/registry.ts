import type { ReactElement } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { WorkspaceKey } from "@/types/supabase"
import type { BrandTokens } from "./brand"

export type PdfRenderContext<TContent = unknown, TExtra = unknown> = {
  content: TContent
  brand: BrandTokens
  user: { id: string; email: string | null }
  plan: { id: string; shop_name: string | null }
  extra?: TExtra
}

export type PdfTemplate<TContent = unknown, TExtra = unknown> = {
  workspace_key: WorkspaceKey
  // Templates can be sync (pure layout) or async (need to pre-render charts,
  // fetch images, etc). The route awaits either way.
  render: (
    ctx: PdfRenderContext<TContent, TExtra>
  ) => ReactElement | Promise<ReactElement>
  filename: (ctx: PdfRenderContext<TContent, TExtra>) => string
  also_load?: WorkspaceKey[]
  // Optional: fetch extra data (e.g. from DB tables) before render.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataLoader?: (supabase: SupabaseClient<any>, planId: string) => Promise<TExtra>
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
