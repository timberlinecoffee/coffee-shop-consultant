// TIM-2509: pinning test that asserts every canonical credit-burn route is
// wired into the ai_turn_metrics helper. Each addition / removal to the
// inventory below is a deliberate policy decision — failing this test means
// either a route was added without telemetry, or a route was renamed and the
// inventory drifted.

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { strict as assert } from "node:assert"
import test from "node:test"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..")

// Inventory: every route file that calls Anthropic and burns AI credits.
// Adding a new route here without wiring the helper will fail the test.
const ROUTES = [
  // Pre-TIM-2509 (already wired by TIM-2361):
  "src/app/api/workspaces/menu-pricing/benchmark-price/route.ts",
  "src/app/api/workspaces/location-lease/candidates/[id]/area-analysis/route.ts",
  "src/app/api/document-import/extract/route.ts",
  // TIM-2509 additions:
  "src/app/api/copilot/stream/route.ts",
  "src/app/api/copilot/improve/route.ts",
  "src/app/api/copilot/launch-readiness/route.ts",
  "src/app/api/business-plan/generate/route.ts",
  "src/app/api/business-plan/regenerate-all/route.ts",
  "src/app/api/business-plan/improve/route.ts",
  "src/app/api/workspaces/concept/review/route.ts",
  "src/app/api/workspaces/location-lease/tradeoff/route.ts",
]

for (const route of ROUTES) {
  test(`TIM-2509 telemetry wired: ${route}`, async () => {
    const source = await readFile(resolve(ROOT, route), "utf8")
    assert.match(
      source,
      /from\s+["']@\/lib\/ai\/turn-metrics["']/,
      `${route} must import from @/lib/ai/turn-metrics`,
    )
    assert.match(
      source,
      /recordTurnMetric\s*\(/,
      `${route} must call recordTurnMetric(...) at least once`,
    )
  })
}
