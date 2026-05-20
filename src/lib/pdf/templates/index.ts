// TIM-715: Register all PDF templates at API-route load time.
// Kept separate from registry.ts so the registry stays test-friendly under
// Node's --experimental-strip-types runner, which cannot load .tsx files.

import { registerTemplate } from "../registry"
import type { PdfTemplate } from "../registry"
import { financialsTemplate } from "./financials"
import { buildoutPlanTemplate } from "./buildout-plan"
import { locationLeaseTemplate } from "./location-lease"

registerTemplate("financials_full_report", financialsTemplate)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
registerTemplate("buildout_plan", buildoutPlanTemplate as unknown as PdfTemplate)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
registerTemplate("location_lease_summary", locationLeaseTemplate as unknown as PdfTemplate)
// registerTemplate("menu_card_with_cost_analysis", menuCardTemplate) // TIM-708
