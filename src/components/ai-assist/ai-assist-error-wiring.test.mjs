// TIM-3445: the callout must not write its own error copy.
//
// aiErrorCopy() being correct is worth nothing if the component goes around
// it, which is precisely what happened: the module-shaped answer existed for
// the read-only banner (TIM-3442) while this file still hardcoded a heading
// and a button. So this scans the source and fails if the strings come back.
//
// Comment lines are stripped before scanning. The equivalent guard in
// break-even-row-shape.test.mjs tripped on the comment explaining its own
// existence; a guard that forbids naming the thing it forbids is a bad guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CALLOUT = join(HERE, "AIAssistCallout.tsx");

/** Source with `//` lines and `/* *\/` blocks removed, so prose can't trip it. */
function code() {
  return readFileSync(CALLOUT, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

test("the callout derives its error copy instead of hardcoding it", () => {
  const src = readFileSync(CALLOUT, "utf8");
  assert.match(
    src,
    /import\s*\{[^}]*aiErrorCopy[^}]*\}\s*from\s*"@\/lib\/ai-error-copy"/,
    "callout no longer imports aiErrorCopy — error copy has drifted back inline",
  );
});

test("no hardcoded failure heading survives in the callout", () => {
  // The exact string a user saw when their credits ran out.
  assert.doesNotMatch(
    code(),
    /Something went wrong/,
    'callout hardcodes "Something went wrong" again',
  );
});

test("no hardcoded retry button survives in the callout", () => {
  // "Try Again" was the only action offered on a state retrying cannot fix.
  // The label is fine when aiErrorCopy chooses it; it is not fine as a literal
  // in JSX, because a literal cannot know whether retrying is possible.
  assert.doesNotMatch(code(), /Try Again/, 'callout hardcodes a "Try Again" button again');
});

test("the callout offers the top-up path the drawer has always had", () => {
  const src = code();
  assert.match(src, /CreditPacksModal/, "no way to buy credits from the out-of-credits state");
});

test("the error frame reaches state with its code intact", () => {
  const src = code();
  // The original defect in one line: `kind: "error", message: <string>` threw
  // the code away at capture. If the failed phase carries anything other than
  // the frame, the derivation downstream has nothing to derive from.
  assert.doesNotMatch(
    src,
    /kind:\s*"error"/,
    'the flattened `kind: "error"` phase is back — the code is being discarded at capture',
  );
  assert.match(src, /kind:\s*"failed";\s*frame:\s*AiErrorFrame/);
});

// ── TIM-3451: the dialog honours the verb you pressed ────────────────────────

test("the emphasised action follows what is in the field", () => {
  const src = code();
  // Empty field writes; filled field improves. One emphasised button, chosen
  // by the field's state, rather than a chooser offering both every time.
  assert.match(
    src,
    /startStream\(hasDraft \? "improve" : "write"\)/,
    "the primary action no longer follows the field's state",
  );
  assert.match(src, /const hasDraft = draft\.trim\(\)\.length > 0/);
});

test("the emphasised button is never the disabled one", () => {
  const src = code();
  // The original bug: on an empty field the primary read "Improve this" and
  // was `disabled`, so the one control the screen drew your eye to could not
  // be pressed. A disabled primary in this dialog is always wrong.
  assert.doesNotMatch(
    src,
    /bg-\[var\(--teal\)\][^>]*\n?[^>]*disabled=\{!draft/,
    "the emphasised button is disabled on an empty field again",
  );
  assert.doesNotMatch(src, /disabled=\{!draft\.trim\(\)\}/, "the draft-empty disable is back");
});

test("the title names the action about to happen", () => {
  // It always read "Improve: <field>", including when the owner pressed
  // "Write with AI" and when there was nothing to improve.
  assert.match(code(), /\{hasDraft \? "Improve" : "Write"\}: \{fieldLabel\}/);
});

test("the second option stays reachable but quiet", () => {
  const src = code();
  // Dropping it entirely would strip a real choice from someone who wants to
  // start over; giving it equal weight is what caused the ambiguity.
  assert.match(src, /Start over and write something new/);
  assert.match(src, /\{hasDraft && \(/, "the start-over link is shown when there is nothing to replace");
});
