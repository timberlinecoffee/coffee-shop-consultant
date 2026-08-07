// TIM-3446: the offer has to actually be reachable.
//
// 23 signups, 0 conversions, and nobody declined — the product never asked.
// The failure was not that the ask was bad; it was that the ask did not exist
// on the path a new owner walks. So the thing worth pinning is the path.
//
// Source scan rather than a render test: the flow component needs Supabase, a
// router and a browser, none of which `node --test` has. What can be checked
// without them is the wiring, which is where this broke.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOW = join(HERE, "onboarding-flow.tsx");
const OFFER = join(HERE, "trial-offer-step.tsx");

const flow = () => readFileSync(FLOW, "utf8");

test("the trial offer is the last step of onboarding", () => {
  const src = flow();
  const steps = src.slice(src.indexOf("const STEPS: Step[] = ["));
  const end = steps.indexOf("\n];");
  const body = steps.slice(0, end);

  assert.ok(body.includes('type: "trial-offer"'), "onboarding has no trial offer step");

  const offerAt = body.lastIndexOf('type: "trial-offer"');
  const reviewAt = body.lastIndexOf('type: "review"');
  assert.ok(reviewAt !== -1, "review step vanished");
  assert.ok(
    offerAt > reviewAt,
    "the offer must come after the review — it opens by saying the concept is saved",
  );
});

test("the concept is saved before the offer is shown", () => {
  const src = flow();
  // handleNext must finish (save) at the last answering step rather than
  // walking to the offer. If this comparison goes back to `totalSteps - 1`,
  // the review screen advances without saving and the offer opens on a lie.
  assert.match(
    src,
    /if\s*\(\s*step\s*<\s*lastAnsweringIndex\s*\)/,
    "handleNext no longer stops at the last answering step",
  );
  assert.doesNotMatch(
    src,
    /if\s*\(\s*step\s*<\s*totalSteps\s*-\s*1\s*\)/,
    "handleNext is back to counting the offer as an answering step",
  );
});

test("finishing lands on the offer, not straight in a locked product", () => {
  const src = flow();
  // The single line that caused the conversion hole: eleven steps of work,
  // then a push into eleven read-only screens with no offer anywhere.
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(
    code,
    /router\.push\("\/workspace\/concept"\)/,
    "onboarding again navigates straight into the workspace without offering the trial",
  );
});

test("paying users are not offered a trial they cannot take", () => {
  // Project mode = an existing subscriber adding a project.
  assert.match(
    flow(),
    /s\.id\s*!==\s*"trial_offer"/,
    "project mode no longer filters the trial offer out",
  );
});

test("declining is a visible, unpunished choice", () => {
  const src = readFileSync(OFFER, "utf8");
  assert.match(src, /look around first/i, "no escape hatch from the offer");
  assert.match(src, /skipHref/, "the escape hatch goes nowhere");
  // A paywall that hides the way out is the thing the audit called a wall.
  assert.doesNotMatch(src, /hidden|sr-only/, "the escape hatch is being visually hidden");
});

test("the offer states what the trial actually gives", () => {
  const src = readFileSync(OFFER, "utf8");
  assert.match(src, /75 AI credits/, "does not say how many credits the trial includes");
  assert.match(src, /7-day free trial|seven free days/i, "does not state the trial length");
});
