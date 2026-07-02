// TIM-3463: Router unit tests. Plan §9 acceptance item 2 —
//   "router unit tests cover all 27 lanes for both default-flag-off
//    (everything Anthropic in prod) and default-flag-on (chat lanes DeepSeek)
//    behavior."

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  routeScoutTurn,
  readDeepseekProdGate,
} from "./scout-router.ts"
import {
  SCOUT_LANES,
  FORCE_ANTHROPIC_LANES,
  REQUIRES_RESEARCH_MODEL_LANES,
} from "./scout-lane.ts"
import {
  DEEPSEEK_CHAT_MODEL,
  PLATFORM_AI_MODEL,
  RESEARCH_AI_MODEL,
} from "./models.ts"

test("registry has 27 lanes (plan §3 taxonomy)", () => {
  assert.equal(SCOUT_LANES.length, 27)
})

test("default-flag-OFF (prod today) → every lane routes to Anthropic", () => {
  for (const lane of SCOUT_LANES) {
    const d = routeScoutTurn({ lane, deepseekProdEnabled: false })
    assert.equal(
      d.provider,
      "anthropic",
      `lane ${lane} routed to ${d.provider} with gate closed`,
    )
    // Sonnet for research lanes, Haiku for everything else.
    if (REQUIRES_RESEARCH_MODEL_LANES.has(lane)) {
      assert.equal(d.modelId, RESEARCH_AI_MODEL, `lane ${lane} model`)
    } else {
      assert.equal(d.modelId, PLATFORM_AI_MODEL, `lane ${lane} model`)
    }
  }
})

test("default-flag-ON (post-flip), non-EU caller → chat lanes go DeepSeek; pinned lanes stay Anthropic", () => {
  for (const lane of SCOUT_LANES) {
    // country='US' so the EU geo-gate (TIM-3460) does not block DeepSeek.
    const d = routeScoutTurn({ lane, deepseekProdEnabled: true, country: "US" })
    if (REQUIRES_RESEARCH_MODEL_LANES.has(lane)) {
      assert.equal(d.provider, "anthropic", `Rule 2: ${lane}`)
      assert.equal(d.modelId, RESEARCH_AI_MODEL)
      assert.match(d.reason, /^research_tool:/)
    } else if (FORCE_ANTHROPIC_LANES.has(lane)) {
      assert.equal(d.provider, "anthropic", `Rule 1: ${lane}`)
      assert.equal(d.modelId, PLATFORM_AI_MODEL)
      assert.match(d.reason, /^lane_pin:/)
    } else {
      assert.equal(d.provider, "deepseek", `Rule 4 cheap: ${lane}`)
      assert.equal(d.modelId, DEEPSEEK_CHAT_MODEL)
      assert.equal(d.reason, "default_cheap")
    }
  }
})

test("Rule 3 long_context — DeepSeek-eligible but >30K input tokens falls back to Haiku", () => {
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    estimatedInputTokens: 32_000,
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.modelId, PLATFORM_AI_MODEL)
  assert.equal(d.reason, "long_context")
})

test("Rule 3 long_context — DeepSeek-eligible but >12 messages falls back to Haiku", () => {
  const d = routeScoutTurn({
    lane: "marketing_generate",
    deepseekProdEnabled: true,
    messageCount: 13,
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.reason, "long_context")
})

test("Rule 3 does NOT override Rule 1 — research lanes stay Sonnet regardless of length", () => {
  const d = routeScoutTurn({
    lane: "menu_benchmark_price",
    deepseekProdEnabled: true,
    estimatedInputTokens: 100_000,
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.modelId, RESEARCH_AI_MODEL)
  assert.match(d.reason, /^research_tool:/)
})

test("Rule 1 lane_pin does not override Rule 2 (research takes priority for those lanes only)", () => {
  // generate_business_plan_section is in FORCE_ANTHROPIC_LANES, not research.
  // It should keep the lane_pin reason on Haiku.
  const d = routeScoutTurn({
    lane: "generate_business_plan_section",
    deepseekProdEnabled: true,
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.modelId, PLATFORM_AI_MODEL)
  assert.match(d.reason, /^lane_pin:/)
})

test("forceProvider override — bypasses every rule (used by QA harness)", () => {
  const a = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: false,
    forceProvider: "deepseek",
  })
  assert.equal(a.provider, "deepseek")
  assert.equal(a.modelId, DEEPSEEK_CHAT_MODEL)
  assert.equal(a.reason, "force:deepseek")

  const b = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    forceProvider: "anthropic",
  })
  assert.equal(b.provider, "anthropic")
  assert.equal(b.modelId, PLATFORM_AI_MODEL)
  assert.equal(b.reason, "force:anthropic")
})

test("readDeepseekProdGate — only literal 'true' opens the gate", () => {
  assert.equal(readDeepseekProdGate({ SCOUT_DEEPSEEK_PROD_ENABLED: "true" }), true)
  assert.equal(
    readDeepseekProdGate({ SCOUT_DEEPSEEK_PROD_ENABLED: "false" }),
    false,
  )
  assert.equal(readDeepseekProdGate({ SCOUT_DEEPSEEK_PROD_ENABLED: "TRUE" }), false)
  assert.equal(readDeepseekProdGate({ SCOUT_DEEPSEEK_PROD_ENABLED: "1" }), false)
  assert.equal(readDeepseekProdGate({}), false)
})

test("force-anthropic lane set covers doc-gen + vision + import (plan §3)", () => {
  for (const pinned of [
    "generate_business_plan_section",
    "business_plan_audit",
    "write_executive_summary",
    "ops_playbook_generate",
    "opening_month_generate",
    "document_import_extract",
    "buildout_import",
  ]) {
    assert.ok(
      FORCE_ANTHROPIC_LANES.has(pinned),
      `expected ${pinned} in FORCE_ANTHROPIC_LANES`,
    )
  }
})

test("research-required lane set is exactly menu_benchmark_price + location_area_analysis", () => {
  assert.equal(REQUIRES_RESEARCH_MODEL_LANES.size, 2)
  assert.ok(REQUIRES_RESEARCH_MODEL_LANES.has("menu_benchmark_price"))
  assert.ok(REQUIRES_RESEARCH_MODEL_LANES.has("location_area_analysis"))
})

// ── TIM-3460 — EU geo-gate (wires src/lib/regions/eea.ts into the router) ────

test("EU gate: country=DE + gate=true → Anthropic Haiku + eu_gate_blocked + fallback_used=true", () => {
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    country: "DE",
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.modelId, PLATFORM_AI_MODEL)
  assert.equal(d.reason, "eu_gate_blocked")
  assert.equal(d.errorClass, "eu_gate_blocked")
  assert.equal(d.fallbackUsed, true)
})

test("EU gate: country=US + gate=true → DeepSeek (gate does NOT apply outside the EEA+UK+CH list)", () => {
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    country: "US",
  })
  assert.equal(d.provider, "deepseek")
  assert.equal(d.modelId, DEEPSEEK_CHAT_MODEL)
  assert.equal(d.reason, "default_cheap")
  assert.equal(d.errorClass, undefined)
  assert.equal(d.fallbackUsed, undefined)
})

test("EU gate: unknown country (null/undefined) + gate=true → conservatively blocked → unknown_region_blocked", () => {
  for (const country of [null, undefined, ""]) {
    const d = routeScoutTurn({
      lane: "chat_general",
      deepseekProdEnabled: true,
      country,
    })
    assert.equal(d.provider, "anthropic", `country=${JSON.stringify(country)}`)
    assert.equal(d.reason, "unknown_region_blocked")
    assert.equal(d.errorClass, "unknown_region_blocked")
    assert.equal(d.fallbackUsed, true)
  }
})

test("EU gate: every EEA+UK+CH country code maps to eu_gate_blocked when DeepSeek would otherwise win", () => {
  const eea = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    "IS", "LI", "NO",
    "GB", "CH",
  ]
  for (const country of eea) {
    const d = routeScoutTurn({
      lane: "chat_general",
      deepseekProdEnabled: true,
      country,
    })
    assert.equal(d.provider, "anthropic", `country=${country}`)
    assert.equal(d.reason, "eu_gate_blocked", `country=${country}`)
  }
})

test("EU gate: country is case-insensitive (lowercase 'de' still blocks)", () => {
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    country: "de",
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.reason, "eu_gate_blocked")
})

test("EU gate: gate=false (prod flag off) short-circuits BEFORE the geo-gate — single fallback reason 'gate_closed'", () => {
  // When the flag is off, no DeepSeek call would happen anyway. The router must
  // not mislabel that as a geo-gate event, even if the country is in the EEA.
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: false,
    country: "DE",
  })
  assert.equal(d.provider, "anthropic")
  assert.equal(d.reason, "gate_closed")
  assert.equal(d.errorClass, undefined)
  assert.equal(d.fallbackUsed, undefined)
})

test("EU gate: Rule 1 lane_pin lanes never trigger the gate (already pinned to Anthropic)", () => {
  // generate_business_plan_section is in FORCE_ANTHROPIC_LANES — would never
  // have routed to DeepSeek, so the geo-gate should be irrelevant.
  const d = routeScoutTurn({
    lane: "generate_business_plan_section",
    deepseekProdEnabled: true,
    country: "DE",
  })
  assert.equal(d.provider, "anthropic")
  assert.match(d.reason, /^lane_pin:/)
  assert.equal(d.errorClass, undefined)
  assert.equal(d.fallbackUsed, undefined)
})

test("EU gate: forceProvider='deepseek' bypasses the gate (QA harness override only)", () => {
  // Tests + the QA harness use forceProvider to side-step routing. The gate
  // applies only to the production routing rules; explicit overrides preserve
  // their pre-TIM-3460 behavior.
  const d = routeScoutTurn({
    lane: "chat_general",
    deepseekProdEnabled: true,
    country: "DE",
    forceProvider: "deepseek",
  })
  assert.equal(d.provider, "deepseek")
  assert.equal(d.reason, "force:deepseek")
})
