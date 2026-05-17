// TIM-715: Register all PDF templates at API-route load time.
// Kept separate from registry.ts so the registry stays test-friendly under
// Node's --experimental-strip-types runner, which cannot load .tsx files.

import { registerTemplate } from "../registry"
import type { PdfTemplate } from "../registry"
import { financialsTemplate } from "./financials"
import { launchPlanTemplate } from "./launch-plan"

registerTemplate("financials_full_report", financialsTemplate as PdfTemplate)
registerTemplate("launch_plan_full_report", launchPlanTemplate as PdfTemplate)
// registerTemplate("menu_card_with_cost_analysis", menuCardTemplate) // TIM-708
