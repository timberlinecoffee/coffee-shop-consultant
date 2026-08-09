// TIM-3452: the prompt, the schema and the sentence must name the same six.
//
// This is the fifth instance this week of a contract with two sides and no
// test comparing them, so the comparison ships with the fix. The route's
// response schema is written by hand inside a prompt string; the labels come
// from this module; the filter comes from this module; the card's sentence
// comes from this module. If the schema ever gains or loses a workspace
// without this list following, the model is asked for a key nothing renders,
// or a graded workspace is silently dropped from the prompt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GRADED_WORKSPACES,
  GRADED_WORKSPACE_KEYS,
  GRADED_WORKSPACE_LABELS,
  isGradedWorkspace,
  keepGradedWorkspaces,
  gradedWorkspaceList,
  gradedWorkspacesBlurb,
  gradedWorkspacesThinkingLabel,
} from "./graded-workspaces.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..");
const ROUTE = join(SRC, "app", "api", "copilot", "launch-readiness", "route.ts");
const BUTTON = join(SRC, "components", "launch-plan", "LaunchReadinessButton.tsx");

test("the response schema permits exactly the workspaces we grade", () => {
  const src = readFileSync(ROUTE, "utf8");
  // The schema line inside the system prompt: "key": "concept" | "location_lease" | …
  const m = src.match(/"key":\s*((?:"[a-z_]+"\s*\|\s*)*"[a-z_]+")/);
  assert.ok(m, "could not find the perWorkspace key union in the system prompt");

  const schemaKeys = [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(
    schemaKeys.sort(),
    [...GRADED_WORKSPACE_KEYS].sort(),
    "the prompt's schema and the graded list disagree about which workspaces exist",
  );
});

test("the route filters the snapshot to the graded set", () => {
  const code = readFileSync(ROUTE, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  assert.match(
    code,
    /keepGradedWorkspaces\(allSnapshots\)/,
    "every workspace document is going into the prompt again — the model is told six and handed eleven",
  );
  assert.doesNotMatch(
    code,
    /const \{ snapshots \} = await composeAllWorkspacesSnapshot/,
    "the unfiltered snapshot is being used directly again",
  );
});

test("the route labels workspaces from the shared list", () => {
  const code = readFileSync(ROUTE, "utf8");
  assert.match(code, /GRADED_WORKSPACE_LABELS/, "the route hand-maintains its own label map again");
});

test("the card names the six instead of claiming there are only six", () => {
  const src = readFileSync(BUTTON, "utf8");
  assert.match(src, /gradedWorkspacesBlurb\(\)/, "the card no longer derives its sentence");
  // "all 6 workspaces" next to Home's "11 workspaces" is the contradiction.
  assert.doesNotMatch(src, /all 6 workspaces/, 'the card says "all 6 workspaces" again');
});

test("the sentence names every graded workspace", () => {
  const blurb = gradedWorkspacesBlurb();
  for (const w of GRADED_WORKSPACES) {
    assert.ok(blurb.includes(w.label), `"${w.label}" is graded but not named on screen`);
  }
  // The word that made six read as a contradiction of eleven.
  assert.ok(!/\ball\b/i.test(blurb), `blurb still claims "all": "${blurb}"`);
});

test("the list reads as English, not as an array", () => {
  const list = gradedWorkspaceList();
  assert.match(list, /^Concept, /);
  assert.match(list, / and Launch Plan$/);
  assert.equal((list.match(/ and /g) ?? []).length, 1, "more than one 'and' in the list");
});

test("filtering keeps the graded and drops the rest", () => {
  const input = [
    { key: "concept", text: "a" },
    { key: "marketing", text: "b" },
    { key: "operations_playbook", text: "c" },
    { key: "financials", text: "d" },
    { key: "business_plan", text: "e" },
  ];
  assert.deepEqual(keepGradedWorkspaces(input).map((s) => s.key), ["concept", "financials"]);
  assert.equal(isGradedWorkspace("concept"), true);
  assert.equal(isGradedWorkspace("marketing"), false);
  assert.deepEqual(keepGradedWorkspaces([]), []);
});

test("every graded key has a label and every label a key", () => {
  assert.equal(GRADED_WORKSPACES.length, 6);
  assert.equal(Object.keys(GRADED_WORKSPACE_LABELS).length, GRADED_WORKSPACES.length);
  for (const w of GRADED_WORKSPACES) {
    assert.equal(GRADED_WORKSPACE_LABELS[w.key], w.label);
    assert.ok(w.label.trim().length > 0, `${w.key} has no label`);
    // AGENTS.md TIM-1002: labels are Title Case.
    assert.match(w.label[0], /[A-Z]/, `"${w.label}" is not Title Case`);
  }
  assert.equal(new Set(GRADED_WORKSPACE_KEYS).size, GRADED_WORKSPACES.length, "duplicate key");
});

test("the thinking line counts the same six", () => {
  assert.match(gradedWorkspacesThinkingLabel(), new RegExp(`\\b${GRADED_WORKSPACES.length}\\b`));
});
