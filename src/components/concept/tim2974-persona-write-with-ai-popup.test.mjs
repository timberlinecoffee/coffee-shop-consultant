// TIM-2974: pinning test — per-field "Write with AI" buttons in PersonaEditor
// must route into the structured AIAssistCallout popup (apply-to-plan) instead
// of dispatching `copilot:open-with-prompt` (which opens the chat companion).
//
// Board flagged on TIM-2973 that "Write with AI" was inconsistent: sometimes it
// opened the popup, sometimes the chat. The popup is the apply-to-plan path;
// chat stays reachable from the workspace shell button.
//
// Pattern: source-string assertions (same as TIM-2950 / TIM-2877) — no jsdom,
// no React runtime, just structural shape on the .tsx files.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const EDITOR_SRC = readFileSync(
  new URL("./PersonaEditor.tsx", import.meta.url),
  "utf8",
);
const SECTION_SRC = readFileSync(
  new URL("./PersonaSection.tsx", import.meta.url),
  "utf8",
);
const WORKSPACE_SRC = readFileSync(
  new URL(
    "../../app/(app)/workspace/concept/concept-editor.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("PersonaEditor no longer dispatches a copilot event (executable code, comments allowed)", () => {
  // The whole point: chat-companion routing must be gone from the persona
  // editor. AskScoutButton still uses this event for its own surface — that's
  // out of scope for TIM-2974.
  // Strip line/block comments so an explanatory mention of the old event in a
  // TIM-2974 doc-comment doesn't trip this assertion.
  const codeOnly = EDITOR_SRC
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /window\.dispatchEvent/);
  assert.doesNotMatch(codeOnly, /new CustomEvent\(/);
  assert.doesNotMatch(codeOnly, /"copilot:open-with-prompt"/);
});

test("PersonaEditor exposes onWriteWithAi prop typed for the three persona AI fields", () => {
  assert.match(
    EDITOR_SRC,
    /export type PersonaAIField =\s*"whyTheyVisit"\s*\|\s*"painPoints"\s*\|\s*"typicalOrder"/,
  );
  assert.match(EDITOR_SRC, /onWriteWithAi\?\:\s*OpenPersonaWriteWithAi/);
  // The handler shape must pass currentValue + an onApply callback so the
  // accepted suggestion can land back in the local draft.
  assert.match(EDITOR_SRC, /currentValue:\s*string/);
  assert.match(EDITOR_SRC, /onApply:\s*\(newValue:\s*string\)\s*=>\s*void/);
});

test("PersonaEditor triggerAI calls onWriteWithAi with field/label/currentValue/onApply", () => {
  // Shape we care about: the three callsites delegate to onWriteWithAi and the
  // onApply closure writes through setField(field, newValue).
  assert.match(EDITOR_SRC, /onWriteWithAi\(\{/);
  assert.match(EDITOR_SRC, /onApply:\s*\(newValue\)\s*=>\s*setField\(field,\s*newValue\)/);
});

test("PersonaEditor still wires triggerAI from all three per-field buttons", () => {
  // Don't regress the entry-point coverage: whyTheyVisit, painPoints,
  // typicalOrder must each fire triggerAI.
  assert.match(EDITOR_SRC, /triggerAI\("whyTheyVisit"\)/);
  assert.match(EDITOR_SRC, /triggerAI\("painPoints"\)/);
  assert.match(EDITOR_SRC, /triggerAI\("typicalOrder"\)/);
});

test("PersonaSection plumbs onWriteWithAi to every PersonaEditor mount", () => {
  // Three mounts in PersonaSection — empty-state new, expanded-existing,
  // expanded-new-draft. All must forward the prop.
  const mounts = SECTION_SRC.match(/<PersonaEditor\b/g) ?? [];
  assert.equal(mounts.length, 3, "expected 3 PersonaEditor mounts");
  const forwards = SECTION_SRC.match(/onWriteWithAi=\{onWriteWithAi\}/g) ?? [];
  assert.equal(
    forwards.length,
    3,
    "expected onWriteWithAi to be forwarded at every PersonaEditor mount",
  );
});

test("ConceptWorkspace passes onWriteWithAi to PersonaSection and routes to AIAssistCallout", () => {
  // PersonaSection mount must include onWriteWithAi.
  assert.match(WORKSPACE_SRC, /<PersonaSection[^>]*onWriteWithAi=/s);
  // Field-key mapping persists the three persona AI fields with explicit names
  // so /api/copilot/improve gets meaningful prompt context.
  assert.match(WORKSPACE_SRC, /persona_why_they_visit/);
  assert.match(WORKSPACE_SRC, /persona_pain_points/);
  assert.match(WORKSPACE_SRC, /persona_typical_order/);
});

test("ConceptWorkspace aiAssistField state carries its own onApply callback", () => {
  // The state shape must support a custom onApply (persona drafts vs concept
  // doc components). The AIAssistCallout mount must call through to it.
  assert.match(WORKSPACE_SRC, /onApply:\s*\(newValue:\s*string\)\s*=>\s*void/);
  assert.match(
    WORKSPACE_SRC,
    /if \(aiAssistField\) aiAssistField\.onApply\(newValue\)/,
  );
  // The concept-component card site must build its onApply closure around
  // updateContent so we don't regress that path either.
  assert.match(
    WORKSPACE_SRC,
    /onApply:\s*\(newValue\)\s*=>\s*updateContent\(meta\.id,\s*newValue\)/,
  );
});
