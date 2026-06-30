// TIM-2361: route-level wire-through pin. The benchmark-price and
// area-analysis routes must pass RESEARCH_AI_MODEL (Sonnet 4.6), not
// PLATFORM_AI_MODEL (Haiku), to the Anthropic SDK and to recordTurnMetric.
// A regression here mis-prices every charged credit downstream, so this is a
// source-level assertion to keep the routing change deliberate.

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
const AREA_SRC = readRoute(
  "../../location-lease/candidates/[id]/area-analysis/route.ts",
);

test("benchmark-price imports RESEARCH_AI_MODEL (not PLATFORM_AI_MODEL)", () => {
  assert.ok(
    /import\s+\{[^}]*RESEARCH_AI_MODEL[^}]*\}\s+from\s+"@\/lib\/ai\/models"/.test(
      BENCHMARK_SRC,
    ),
    "expected RESEARCH_AI_MODEL import",
  );
  assert.ok(
    !/^[^/]*PLATFORM_AI_MODEL/m.test(stripLineComments(BENCHMARK_SRC)),
    "PLATFORM_AI_MODEL must not appear in benchmark-price after the flip",
  );
});

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

test("benchmark-price passes RESEARCH_AI_MODEL to anthropic.messages.create", () => {
  // The model arg should be the constant, not a string literal — keeps the
  // single-source-of-truth contract.
  assert.ok(
    /anthropic\.messages\.create\(\s*\{[\s\S]*?model:\s*RESEARCH_AI_MODEL/m.test(
      BENCHMARK_SRC,
    ),
    "expected anthropic.messages.create({ model: RESEARCH_AI_MODEL, ... })",
  );
});

test("benchmark-price records a turn metric with RESEARCH_AI_MODEL", () => {
  assert.ok(
    /recordTurnMetric\(/.test(BENCHMARK_SRC),
    "expected recordTurnMetric call",
  );
  assert.ok(
    /model:\s*RESEARCH_AI_MODEL/.test(BENCHMARK_SRC),
    "expected recordTurnMetric input { model: RESEARCH_AI_MODEL }",
  );
});

// TIM-3468 rewires area-analysis through runScoutTurn under the
// `location_area_analysis` lane. That lane lives in
// REQUIRES_RESEARCH_MODEL_LANES (src/lib/ai/scout-lane.ts), so the router
// returns RESEARCH_AI_MODEL automatically — the route itself no longer
// names the model constant. The Sonnet pin moves from "this file uses
// RESEARCH_AI_MODEL" to "this file uses the lane that pins to Sonnet".

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
    "expected runScoutTurn({ lane: \"location_area_analysis\", ... })",
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
    "expected recordTurnMetric input { lane: \"location_area_analysis\" }",
  );
});
