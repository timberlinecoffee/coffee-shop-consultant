// TIM-715: Register all PDF templates at API-route load time.
// Kept separate from registry.ts so the registry stays test-friendly under
// Node's --experimental-strip-types runner, which cannot load .tsx files.

import { registerTemplate } from "../registry"
import type { PdfTemplate } from "../registry"
import { financialsTemplate } from "./financials"
import { launchPlanTemplate } from "./launch-plan"
import { menuCardTemplate } from "./menu-card"
import { businessPlanTemplate } from "./business-plan"
import { jobDescriptionTemplate } from "./job-description"
import { scorecardBlankTemplate } from "./interview-scorecard"
import { competencyBlankTemplate, competencyCompletedTemplate } from "./competency-form"

registerTemplate("financials_full_report", financialsTemplate as PdfTemplate)
registerTemplate("launch_plan_full_report", launchPlanTemplate as PdfTemplate)
registerTemplate("menu_card_with_cost_analysis", menuCardTemplate as PdfTemplate) // TIM-708
registerTemplate("business_plan_full", businessPlanTemplate as PdfTemplate) // TIM-1037
registerTemplate("hiring_job_description", jobDescriptionTemplate as PdfTemplate)
registerTemplate("hiring_scorecard_blank", scorecardBlankTemplate as PdfTemplate)
registerTemplate("hiring_competency_blank", competencyBlankTemplate as PdfTemplate)
registerTemplate("hiring_competency_completed", competencyCompletedTemplate as PdfTemplate)
