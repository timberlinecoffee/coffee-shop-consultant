// TIM-2972: pinning test — "Write with AI" buttons in PersonaEditor MUST be
// hover/focus-revealed, not always-visible. Mirrors the canonical pattern in
// `src/app/(app)/workspace/concept/concept-editor.tsx` (TIM-2899).
//
// If a future refactor drops the opacity gating, the per-field button reverts
// to always-visible — the exact regression the board flagged in TIM-2969.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PERSONA_EDITOR = resolve(here, "./PersonaEditor.tsx");
const CONCEPT_EDITOR = resolve(
  here,
  "../../app/(app)/workspace/concept/concept-editor.tsx",
);

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

test("PersonaEditor: every 'Write with AI' button is hover/focus-revealed", () => {
  const src = stripComments(readFileSync(PERSONA_EDITOR, "utf8"));
  // Walk the source and isolate each <button>...</button> block whose
  // contents include `triggerAI(`. Regex with `>` exclusion would miss the
  // `=>` arrow inside onClick handlers, so use index scanning instead.
  const blocks = [];
  let cursor = 0;
  while (true) {
    const openIdx = src.indexOf("<button", cursor);
    if (openIdx === -1) break;
    const closeIdx = src.indexOf("</button>", openIdx);
    if (closeIdx === -1) break;
    const block = src.slice(openIdx, closeIdx + "</button>".length);
    if (block.includes("triggerAI(")) blocks.push(block);
    cursor = closeIdx + "</button>".length;
  }
  assert.equal(
    blocks.length,
    3,
    `expected 3 triggerAI buttons (whyTheyVisit/painPoints/typicalOrder), found ${blocks.length}`,
  );
  for (const btn of blocks) {
    assert.match(btn, /opacity-0/, "button must start hidden (opacity-0)");
    assert.match(
      btn,
      /group-hover:opacity-100/,
      "button must reveal on pointer hover of the field group",
    );
    assert.match(
      btn,
      /group-focus-within:opacity-100/,
      "button must reveal when the field group has keyboard/tap focus",
    );
    assert.match(
      btn,
      /focus-visible:opacity-100/,
      "button must reveal when itself receives keyboard focus (tab from textarea)",
    );
  }
});

test("PersonaEditor: each field container that hosts a Write with AI button has the group class", () => {
  const src = stripComments(readFileSync(PERSONA_EDITOR, "utf8"));
  const occurrences = src.match(/className="group"/g) ?? [];
  assert.ok(
    occurrences.length >= 3,
    `expected >=3 field containers with className="group" (whyTheyVisit/painPoints/typicalOrder), found ${occurrences.length}`,
  );
});

test("concept-editor card-level Write with AI button stays hover/focus-revealed (canonical pattern)", () => {
  const src = readFileSync(CONCEPT_EDITOR, "utf8");
  assert.match(
    src,
    /opacity-0 group-hover:opacity-100 group-focus-within:opacity-100/,
    "concept-editor card chrome must keep the canonical opacity gating",
  );
});
