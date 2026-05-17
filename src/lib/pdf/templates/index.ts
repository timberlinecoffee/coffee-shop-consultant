// TIM-715: Register all PDF templates at API-route load time.
// Kept separate from registry.ts so the registry stays test-friendly under
// Node's --experimental-strip-types runner, which cannot load .tsx files.

import { registerTemplate } from "../registry"
import { financialsTemplate } from "./financials"

registerTemplate("financials_full_report", financialsTemplate)
// registerTemplate("menu_card_with_cost_analysis", menuCardTemplate) // TIM-708
