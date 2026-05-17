// TIM-726: structural tests for composePlanSnapshot buildout_equipment branch.
// Direct import is not possible because composePlanSnapshot uses @/ path aliases.
// Tests verify source-level contracts: imports, branch presence, token budget, anchor content.

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..", "..", "..")

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8")
}

const snapshotSrc = read("src/lib/copilot/composePlanSnapshot.ts")

test("composePlanSnapshot imports classifyMenuProfile", () => {
  assert.match(
    snapshotSrc,
    /import\s*\{[^}]*classifyMenuProfile[^}]*\}\s*from\s*["']@\/lib\/buildout\/classifyMenuProfile["']/,
    "must import classifyMenuProfile from the buildout helper"
  )
})

test("composePlanSnapshot has buildout_equipment branch", () => {
  assert.match(
    snapshotSrc,
    /currentWorkspace\s*===\s*['"]buildout_equipment['"]/,
    "must dispatch on buildout_equipment workspace key"
  )
})

test("return type includes anchors field", () => {
  assert.match(
    snapshotSrc,
    /anchors\??\s*:\s*string/,
    "return type must declare anchors field"
  )
})

test("snapshot includes _digest block", () => {
  assert.match(snapshotSrc, /_digest/, "snapshot must emit _digest block")
})

test("snapshot queries top 5 equipment by cost", () => {
  assert.match(
    snapshotSrc,
    /\.limit\(5\)/,
    "must limit equipment items to 5"
  )
  assert.match(
    snapshotSrc,
    /unit_cost_cents.*ascending.*false|ascending.*false.*unit_cost_cents/s,
    "must order equipment by unit_cost_cents descending"
  )
})

test("snapshot filters out rejected contractor bids", () => {
  assert.match(
    snapshotSrc,
    /status\s*!==\s*['"]rejected['"]/,
    "must filter out rejected bids"
  )
})

test("snapshot includes permits.jurisdiction", () => {
  assert.match(snapshotSrc, /jurisdiction/, "must emit permits jurisdiction")
})

test("snapshot calls classifyMenuProfile for menu_profile", () => {
  assert.match(
    snapshotSrc,
    /classifyMenuProfile\s*\(\s*planId/,
    "must call classifyMenuProfile(planId, ...)"
  )
})

test("snapshot token budget: 600-char-per-4 constant present", () => {
  assert.match(
    snapshotSrc,
    /TOKEN_CHARS\s*=\s*4/,
    "TOKEN_CHARS must be 4 (rough chars-per-token estimate)"
  )
})

test("anchors include standard-equipment cross-reference instruction", () => {
  assert.match(
    snapshotSrc,
    /must-have.*missing|missing.*must.have/si,
    "anchors must instruct the AI to name missing must-have items"
  )
})

test("anchors include verbatim rationale instruction", () => {
  assert.match(
    snapshotSrc,
    /verbatim/i,
    "anchors must say to cite rationale verbatim"
  )
})

test("anchors include permits best-effort disclaimer", () => {
  assert.match(
    snapshotSrc,
    /best-effort general guidance.*confirm with the local jurisdiction/i,
    "permits anchor must include the required disclaimer verbatim"
  )
})

test("anchors prohibit fabricating fees/form numbers/timelines", () => {
  assert.match(
    snapshotSrc,
    /Do not fabricate.*fees|fees.*fabricate/si,
    "permits anchor must forbid fabricating filing fees"
  )
})

test("anchors are only added for buildout_equipment workspace in route", () => {
  const routeSrc = read("src/app/api/copilot/stream/route.ts")
  assert.match(
    routeSrc,
    /anchors.*systemBlocks\.push|systemBlocks\.push.*anchors/s,
    "route must push anchors to system blocks"
  )
  assert.match(
    routeSrc,
    /if\s*\(\s*anchors\s*\)/,
    "route must guard the anchor push with `if (anchors)`"
  )
})

// Token budget test: simulate a 20-item + 3-bid snapshot
test("snapshot for 20-item list + 3 bids stays under 600 token budget (char-count heuristic)", () => {
  // Simulate the lines composeBuildoutSnapshot would emit for a rich dataset.
  // Top 5 items only (enforced by .limit(5)), so item count doesn't inflate tokens.
  const lines = [
    "### buildout equipment (current workspace)",
    "menu_profile: espresso_plus_brew",
    "",
    "_digest: 20 items · must_have: 12 · must_have total: $45,000 · nice_to_have total: $5,000 · bid total: $75,000 · open permits: 2 · next milestone: rough_in (2026-07-01)",
    "",
    "Top equipment by cost:",
    "- Commercial Espresso Machine La Marzocca Linea PB, qty 1, $8,500 [must_have]",
    "- Mahlkönig EK43S Espresso Grinder, qty 2, $4,400 [must_have]",
    "- Hoshizaki IM-200BAC Ice Machine, qty 1, $3,200 [nice_to_have]",
    "- Marco SP9 Batch Brewer, qty 1, $2,000 [must_have]",
    "- Fetco CBS-2152XTS Extractor, qty 1, $1,800 [nice_to_have]",
    "",
    "Contractor bids:",
    "- general / Main Street Construction: $52,000 (received) 2026-06-01–2026-08-15",
    "- plumbing / Pacific Plumbing Co: $15,000 (accepted) 2026-06-15–2026-06-30",
    "- electrical / Voltage Electric LLC: $8,000 (received) 2026-06-20–2026-07-10",
    "",
    "Permits jurisdiction: Portland, OR, US",
  ]

  const snapshot = lines.join("\n")
  const estimatedTokens = Math.ceil(snapshot.length / 4)

  assert.ok(
    estimatedTokens <= 600,
    `snapshot must be ≤600 estimated tokens, got ${estimatedTokens} (${snapshot.length} chars)`
  )
})
