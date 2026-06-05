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

test("area-analysis imports RESEARCH_AI_MODEL (not PLATFORM_AI_MODEL)", () => {
  assert.ok(
    /import\s+\{[^}]*RESEARCH_AI_MODEL[^}]*\}\s+from\s+"@\/lib\/ai\/models"/.test(
      AREA_SRC,
    ),
    "expected RESEARCH_AI_MODEL import",
  );
  assert.ok(
    !/^[^/]*PLATFORM_AI_MODEL/m.test(stripLineComments(AREA_SRC)),
    "PLATFORM_AI_MODEL must not appear in area-analysis after the flip",
  );
});

test("area-analysis passes RESEARCH_AI_MODEL to anthropic.messages.create", () => {
  assert.ok(
    /anthropic\.messages\.create\(\s*\{[\s\S]*?model:\s*RESEARCH_AI_MODEL/m.test(
      AREA_SRC,
    ),
    "expected anthropic.messages.create({ model: RESEARCH_AI_MODEL, ... })",
  );
});

test("area-analysis records a turn metric with RESEARCH_AI_MODEL", () => {
  assert.ok(
    /recordTurnMetric\(/.test(AREA_SRC),
    "expected recordTurnMetric call",
  );
  assert.ok(
    /model:\s*RESEARCH_AI_MODEL/.test(AREA_SRC),
    "expected recordTurnMetric input { model: RESEARCH_AI_MODEL }",
  );
});
