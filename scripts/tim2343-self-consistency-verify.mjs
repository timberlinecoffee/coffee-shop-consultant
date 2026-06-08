// TIM-2343: demo fixture that exercises every code path of the per-section
// self-consistency check. Lives next to tim2341/tim2342 verify scripts so the
// pattern is consistent.
//
// What this exercises (acceptance #4):
//   1. Parser: clean response (no contradictions) → []
//   2. Parser: well-formed multi-pair response → typed contradictions[]
//   3. Parser: malformed JSON → [] (defensive)
//   4. Parser: missing/empty claim_a or claim_b → dropped
//   5. Parser: unknown kind values → normalized to "other"
//   6. Parser: ```json fenced response → still parses
//   7. Regen directive: empty contradictions → "" (no regen)
//   8. Regen directive: populated → full revision-request prompt
//   9. Adversarial fixture: the owner-draws narrative from TIM-2315 investor
//      critique fed through the parser w/ a simulated LLM detection response
//      yields the contradiction shape the AI review modal will render.
//
// Acceptance #1 (live: regen Beaver & Beef, confirm the owner-draws
// contradiction does not appear in the final draft) is verified by re-running
// /api/business-plan/generate against the fixture from a logged-in browser
// session. The output of that live run is captured in the issue close comment.
//
// Usage:
//   node scripts/tim2343-self-consistency-verify.mjs
//   # or, with the Anthropic SDK installed, a live model call for an
//   # adversarial fixture (skipped if ANTHROPIC_API_KEY is absent):
//   ANTHROPIC_API_KEY=sk-... node scripts/tim2343-self-consistency-verify.mjs

import {
  parseSelfConsistencyResponse,
  buildConsistencyFixDirective,
  buildSelfConsistencyUserMessage,
  SELF_CONSISTENCY_SYSTEM_PROMPT,
} from "../src/lib/business-plan/self-consistency.ts";

let pass = 0;
let fail = 0;
const log = (label, ok, detail = "") => {
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${label}${detail ? "  " + detail : ""}`);
  if (ok) pass += 1; else fail += 1;
};

// ── Path 1: clean response ───────────────────────────────────────────────────
{
  const out = parseSelfConsistencyResponse(JSON.stringify({ contradictions: [] }), "x");
  log("Path 1 — clean response yields []", Array.isArray(out) && out.length === 0);
}

// ── Path 2: well-formed multi-pair response ─────────────────────────────────
{
  const raw = JSON.stringify({
    contradictions: [
      { kind: "numerical", claim_a: "Owner draws $3,000 per month from month five", claim_b: "Year 1 assumes no owner draw", explanation: "Two values for the same line item." },
      { kind: "categorical", claim_a: "We will not offer delivery.", claim_b: "Delivery drives Y2 growth.", explanation: "Contradictory delivery decision." },
      { kind: "temporal", claim_a: "Opening month 6.", claim_b: "Ramp begins month 4.", explanation: "Ramp before opening." },
    ],
  });
  const out = parseSelfConsistencyResponse(raw, "financial-plan-statements");
  log(
    "Path 2 — well-formed multi-pair → typed",
    out.length === 3
      && out[0].kind === "numerical"
      && out[1].kind === "categorical"
      && out[2].kind === "temporal"
      && out[0].section_key === "financial-plan-statements"
      && out[0].id === "financial-plan-statements:0"
      && out[1].id === "financial-plan-statements:1"
      && out[2].id === "financial-plan-statements:2",
  );
}

// ── Path 3: malformed JSON ──────────────────────────────────────────────────
{
  const out = parseSelfConsistencyResponse("not json", "x");
  log("Path 3 — malformed JSON → []", Array.isArray(out) && out.length === 0);
}

// ── Path 4: empty claim sides ───────────────────────────────────────────────
{
  const raw = JSON.stringify({
    contradictions: [
      { kind: "numerical", claim_a: "real", claim_b: "", explanation: "..." },
      { kind: "numerical", claim_a: "", claim_b: "real", explanation: "..." },
      { kind: "numerical", claim_a: "dupe", claim_b: "dupe", explanation: "..." },
    ],
  });
  const out = parseSelfConsistencyResponse(raw, "x");
  log("Path 4 — empty / identical-pair noise dropped", out.length === 0);
}

// ── Path 5: unknown kind normalization ──────────────────────────────────────
{
  const raw = JSON.stringify({
    contradictions: [{ kind: "philosophical", claim_a: "a", claim_b: "b", explanation: "e" }],
  });
  const out = parseSelfConsistencyResponse(raw, "x");
  log("Path 5 — unknown kind → 'other'", out.length === 1 && out[0].kind === "other");
}

// ── Path 6: code-fenced response ────────────────────────────────────────────
{
  const raw = "```json\n" + JSON.stringify({
    contradictions: [{ kind: "numerical", claim_a: "a", claim_b: "b", explanation: "e" }],
  }) + "\n```";
  const out = parseSelfConsistencyResponse(raw, "x");
  log("Path 6 — ```json fence stripped before parse", out.length === 1);
}

// ── Path 7: empty contradictions → no directive ─────────────────────────────
{
  const out = buildConsistencyFixDirective([]);
  log("Path 7 — empty contradictions yields empty directive", out === "");
}

// ── Path 8: populated regen directive shape ─────────────────────────────────
{
  const out = buildConsistencyFixDirective([
    { id: "x:0", section_key: "x", kind: "numerical", claim_a: "owner draws $3,000/mo", claim_b: "no owner draw in Y1", explanation: "two values." },
  ]);
  const required = [
    "REVISION REQUEST",
    "Keep the voice, structure, paragraph count",
    "[numerical]",
    "owner draws $3,000/mo",
    "no owner draw in Y1",
    "Ground Truth Numbers block",
    "Return the full revised section",
  ];
  const allPresent = required.every((r) => out.includes(r));
  log("Path 8 — directive includes all required clauses", allPresent);
}

// ── Path 9: adversarial fixture (the TIM-2315 owner-draws prose) ────────────
// This is the section text the AI emitted on Trent's Beaver & Beef plan that
// the investor flagged. The detector + parser must shape this into a real
// contradiction object the AI review modal will then render.
const ADVERSARIAL_SECTION = `Beaver & Beef projects a Year 1 net loss of $59,825 driven by a six-month ramp. Owner draws are $3,000 per month from month five. Year 1 assumes no owner draw to preserve runway through the opening period. Year 2 turns to positive cash flow.`;

// Simulated LLM detection of the adversarial fixture — what a competent
// proofreader call should return:
const SIMULATED_LLM_OUTPUT = JSON.stringify({
  contradictions: [
    {
      kind: "numerical",
      claim_a: "Owner draws are $3,000 per month from month five",
      claim_b: "Year 1 assumes no owner draw",
      explanation: "The plan cannot both pay $3,000/mo in owner draws starting month five AND assume zero Year 1 owner draw.",
    },
  ],
});
{
  const parsed = parseSelfConsistencyResponse(SIMULATED_LLM_OUTPUT, "financial-plan-statements");
  const ok =
    parsed.length === 1 &&
    parsed[0].kind === "numerical" &&
    parsed[0].claim_a.includes("$3,000 per month") &&
    parsed[0].claim_b.includes("no owner draw") &&
    parsed[0].section_key === "financial-plan-statements";
  log("Path 9 — adversarial TIM-2315 owner-draws fixture caught", ok, `(parsed=${JSON.stringify(parsed[0] ?? {})})`);
}

// ── Path 10: user message embeds full section verbatim ──────────────────────
{
  const msg = buildSelfConsistencyUserMessage("Financial Plan: Statements", ADVERSARIAL_SECTION);
  const ok =
    msg.includes("Section: Financial Plan: Statements") &&
    msg.includes("Owner draws are $3,000 per month from month five") &&
    msg.includes("no owner draw") &&
    msg.includes("Return the JSON described in your instructions");
  log("Path 10 — user message threads section text verbatim", ok);
}

// ── Path 11: system prompt sanity ───────────────────────────────────────────
{
  const ok =
    SELF_CONSISTENCY_SYSTEM_PROMPT.includes("NUMERICAL") &&
    SELF_CONSISTENCY_SYSTEM_PROMPT.includes("CATEGORICAL") &&
    SELF_CONSISTENCY_SYSTEM_PROMPT.includes("TEMPORAL") &&
    SELF_CONSISTENCY_SYSTEM_PROMPT.includes(`"contradictions"`) &&
    SELF_CONSISTENCY_SYSTEM_PROMPT.includes("Y1 revenue ≠ Y2 revenue is not a contradiction");
  log("Path 11 — system prompt covers all three categories + negatives", ok);
}

// ── Path 12 (OPTIONAL): live model call against adversarial fixture ─────────
// Skipped when ANTHROPIC_API_KEY is absent so CI doesn't depend on the model.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (ANTHROPIC_KEY) {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SELF_CONSISTENCY_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: buildSelfConsistencyUserMessage("Financial Plan: Statements", ADVERSARIAL_SECTION),
      }],
    });
    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") raw += block.text;
    }
    const parsed = parseSelfConsistencyResponse(raw, "financial-plan-statements");
    // Haiku may legitimately tag this as "numerical" (the dollar figures)
    // OR "categorical" (whether draws happen at all in Y1). Either is correct
    // — what matters is that the owner-draws pair was caught.
    const caught = parsed.some(
      (c) => (c.claim_a + " " + c.claim_b).toLowerCase().includes("owner draw"),
    );
    log("Path 12 — LIVE Haiku call catches owner-draws contradiction", caught, `(model returned ${parsed.length} contradiction(s); kinds=${parsed.map((c) => c.kind).join(",")})`);
  } catch (err) {
    log("Path 12 — LIVE Haiku call", false, `(error: ${err?.message ?? err})`);
  }
} else {
  console.log("- Path 12 — LIVE Haiku call SKIPPED (set ANTHROPIC_API_KEY to enable)");
}

console.log("");
console.log(`Summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
