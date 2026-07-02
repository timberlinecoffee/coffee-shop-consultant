// TIM-2361: route-level wire-through pin. The benchmark-price and
// area-analysis routes must pass RESEARCH_AI_MODEL (Sonnet 4.6), not
// PLATFORM_AI_MODEL (Haiku), to the Anthropic SDK and to recordTurnMetric.
// A regression here mis-prices every charged credit downstream, so this is a
// source-level assertion to keep the routing change deliberate.
//
// TIM-3468: area-analysis was rewired through runScoutTurn under lane
// `location_area_analysis`. That lane lives in REQUIRES_RESEARCH_MODEL_LANES,
// so the router returns RESEARCH_AI_MODEL automatically — the route no longer
// names the model constant. The Sonnet pin moved from "this file uses
// RESEARCH_AI_MODEL" to "this file uses the lane that pins to Sonnet".
//
// TIM-3496: benchmark-price now uses the same pattern. It calls
// computeLocalCafeRange, which routes through runScoutTurn under lane
// `menu_benchmark_price`. That lane is also in REQUIRES_RESEARCH_MODEL_LANES.
// The Sonnet pin moves to a lane-registry assertion on local-cafe-range.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function readRoute(rel) {
  return readFileSync(resolve(here, rel), "utf8");
}

const BENCHMARK_SRC = readRoute("./route.ts");
const LOCAL_RANGE_SRC = readRoute(
  "../../../../../lib/menu-pricing/local-cafe-range.ts",
);
const AREA_SRC = readRoute(
  "../../location-lease/candidates/[id]/area-analysis/route.ts",
);

// ── benchmark-price: lane-pin via REQUIRES_RESEARCH_MODEL_LANES ──────────────

test("benchmark-price engine routes through runScoutTurn", () => {
  assert.ok(
    /import\s+\{[^}]*runScoutTurn[^}]*\}\s+from\s+"@\/lib\/ai\/scout-adapter"/.test(
      LOCAL_RANGE_SRC,
    ),
    "expected runScoutTurn import from @/lib/ai/scout-adapter in local-cafe-range.ts",
  );
  assert.ok(
    /runScoutTurn\(\s*\{[\s\S]*?lane:\s*"menu_benchmark_price"/m.test(
      LOCAL_RANGE_SRC,
    ),
    'expected runScoutTurn({ lane: "menu_benchmark_price", ... }) in local-cafe-range.ts',
  );
});

test("benchmark-price engine no longer calls anthropic.messages.create directly", () => {
  // Pre-TIM-3496 the engine instantiated `new Anthropic()` and called
  // `anthropic.messages.create(...)` itself. The Scout wire-through removes
  // both — the SDK only enters the picture through the adapter.
  assert.ok(
    !/new\s+Anthropic\s*\(/.test(LOCAL_RANGE_SRC),
    "local-cafe-range.ts must not construct the Anthropic SDK directly after TIM-3496",
  );
  assert.ok(
    !/anthropic\.messages\.create\s*\(/.test(LOCAL_RANGE_SRC),
    "local-cafe-range.ts must not call anthropic.messages.create after TIM-3496",
  );
});

test("benchmark-price lane is pinned to the research model", () => {
  // Authority of the Sonnet pin moves to the lane registry — verifying it
  // here keeps the wire-through pin paired with the model decision.
  const laneSrc = readRoute("../../../../../lib/ai/scout-lane.ts");
  assert.ok(
    /REQUIRES_RESEARCH_MODEL_LANES[\s\S]*?"menu_benchmark_price"/m.test(
      laneSrc,
    ),
    "menu_benchmark_price must remain in REQUIRES_RESEARCH_MODEL_LANES (the router pin to Sonnet 4.6)",
  );
});

test("benchmark-price lane is blocked from cross-provider failover", () => {
  // web_search hosted tool is Anthropic-only — DeepSeek would 400 on it.
  // Adapter blocks the cross-provider failover for this lane explicitly.
  const adapterSrc = readRoute("../../../../../lib/ai/scout-adapter.ts");
  assert.ok(
    /BLOCK_CROSS_PROVIDER_FAILOVER_LANES[\s\S]*?"menu_benchmark_price"/m.test(
      adapterSrc,
    ),
    "menu_benchmark_price must remain in BLOCK_CROSS_PROVIDER_FAILOVER_LANES",
  );
});

test("benchmark-price records a turn metric with the lane tag via envelope", () => {
  assert.ok(
    /recordTurnMetric\(/.test(BENCHMARK_SRC),
    "expected recordTurnMetric call",
  );
  assert.ok(
    /toTurnMetricArgs\(\s*local\.envelope\s*,\s*"menu_benchmark_price"\s*\)/.test(
      BENCHMARK_SRC,
    ),
    'expected toTurnMetricArgs(local.envelope, "menu_benchmark_price")',
  );
});

// ── area-analysis: parallel TIM-3468 assertions ─────────────────────────────

test("area-analysis routes through runScoutTurn", () => {
  assert.ok(
    /import\s+\{[^}]*runScoutTurn[^}]*\}\s+from\s+"@\/lib\/ai\/scout-adapter"/.test(
      AREA_SRC,
    ),
    "expected runScoutTurn import from @/lib/ai/scout-adapter",
  );
  assert.ok(
    /runScoutTurn\(\s*\{[\s\S]*?lane:\s*"location_area_analysis"/m.test(
      AREA_SRC,
    ),
    'expected runScoutTurn({ lane: "location_area_analysis", ... })',
  );
});

test("area-analysis lane is pinned to the research model", () => {
  // Authority of the Sonnet pin moves to the lane registry — verifying it
  // here keeps the wire-through pin paired with the model decision.
  const laneSrc = readRoute("../../../../../lib/ai/scout-lane.ts");
  assert.ok(
    /REQUIRES_RESEARCH_MODEL_LANES[\s\S]*?"location_area_analysis"/m.test(
      laneSrc,
    ),
    "location_area_analysis must remain in REQUIRES_RESEARCH_MODEL_LANES (the router pin to Sonnet 4.6)",
  );
});

test("area-analysis records a turn metric with the lane tag", () => {
  assert.ok(
    /recordTurnMetric\(/.test(AREA_SRC),
    "expected recordTurnMetric call",
  );
  assert.ok(
    /lane:\s*"location_area_analysis"/.test(AREA_SRC),
    'expected recordTurnMetric input { lane: "location_area_analysis" }',
  );
});
