// TIM-4108 (UX Phase 3): a ratchet.
//
// Phase 2 made the header standard structural but left `actions` in place as a
// deprecated escape hatch, because all eleven workspaces were still using it.
// Phase 3 moves them across one at a time. Every workspace that has moved gets
// added to MIGRATED below and can never silently slide back.
//
// When the list holds all eleven, `actions` gets deleted from WorkspaceHeader
// and this file becomes a check that it stayed deleted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

// These files explain in comments what wording they replaced, so a raw scan
// would flag the explanation itself. Strip comments and scan what renders.
const code = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const MIGRATED = [
  {
    name: "Marketing",
    file: "src/app/(app)/workspace/marketing/marketing-workspace.tsx",
    progress: "steps",
  },
  {
    name: "Operations Playbook",
    file: "src/app/(app)/workspace/operations-playbook/operations-playbook-workspace.tsx",
    progress: "steps",
  },
  {
    // List-shaped, so a plain count and no bar (D-011).
    name: "Location & Lease",
    file: "src/app/(app)/workspace/location-lease/location-lease-client.tsx",
    progress: "count",
  },
  {
    // List-shaped like Location & Lease (D-011). No emphasised button: gear is
    // added per station, and each station carries its own add control.
    name: "Buildout & Equipment",
    file: "src/app/(app)/workspace/buildout-equipment/buildout-workspace.tsx",
    progress: "count",
  },
  {
    // Count rather than a bar (D-011) even though the categories give it a real
    // denominator — see supplier-progress.ts for why.
    name: "Suppliers",
    file: "src/app/(app)/workspace/suppliers/suppliers-workspace.tsx",
    progress: "count",
  },
  {
    // The live Financials surface. financials-workspace.tsx still holds a v1
    // header behind the ui_revamp_v2 flag, which defaults to v2 — that
    // fallback migrates with the flag's removal, not before.
    name: "Financials",
    file: "src/app/(app)/workspace/financials/financials-v2.tsx",
    progress: "steps",
  },
];

for (const ws of MIGRATED) {
  test(`${ws.name} uses the structural slots, not the free-form cluster`, () => {
    const src = code(ws.file);
    assert.ok(
      !/\bactions=\{/.test(src),
      "the deprecated escape hatch lets this screen choose its own order again"
    );
    for (const slot of ["scout=", "save=", "progress="]) {
      assert.ok(src.includes(slot), `${ws.name} must fill the ${slot} slot`);
    }
  });

  test(`${ws.name} states where the owner is up to, in the right shape`, () => {
    // Progress appeared on 4 of 11 screens before this batch. Every migrated
    // screen answers "how far along am I" or it is not migrated — and answers
    // it in the shape that suits it, per D-011.
    const src = code(ws.file);
    if (ws.progress === "steps") {
      assert.ok(
        /stepsProgress\(/.test(src),
        `${ws.name} must count steps from the same list its button walks`
      );
    } else {
      assert.ok(
        !/stepsProgress\(/.test(src),
        `${ws.name} is a list you add to, not a path you walk — no step count`
      );
      assert.ok(
        /Progress\(/.test(src),
        `${ws.name} must still state what the owner has`
      );
    }
  });

  test(`${ws.name} does not reintroduce its own print wording`, () => {
    // "Print view" was this screen's private name for the shared action.
    const src = code(ws.file);
    for (const wording of ["Print view", "Print all", "Print recipe cards"]) {
      assert.ok(
        !src.includes(wording),
        `${ws.name} must say "Print document" like every other screen, not "${wording}"`
      );
    }
  });
}

test("the emphasised button and the section anchor build the same DOM id", () => {
  // Two files construct this id independently. If they drift, the button
  // silently does nothing — the worst kind of break, because it looks fine.
  assert.match(
    read("src/components/workspace/WorkspaceNextStepButton.tsx"),
    /getElementById\(`step-\$\{id\}`\)/
  );
  assert.match(
    read("src/components/ui/AccordionSection.tsx"),
    /`step-\$\{stepId\}`/
  );
});

test("opening a section from outside it did not break the plain accordion", () => {
  // The controlled props are additive. A caller that passes neither must keep
  // its own internal open state, or every un-migrated screen regresses at once.
  const src = read("src/components/ui/AccordionSection.tsx");
  assert.match(src, /const controlled = openProp !== undefined/);
  assert.match(src, /controlled \? openProp : openState/);
});

// ── The one documented exception ───────────────────────────────────────

test("Financials only lets the wizard hold the emphasised slot while empty", () => {
  // Trent's call 2026-08-02: on a blank forecast the guided walkthrough IS the
  // next real thing to do, because "Continue with Daily Traffic & Schedule"
  // drops a first-time owner into a wall of numbers. The moment any section is
  // filled it steps aside. Pin both halves — an exception that quietly grew
  // into "the wizard is always the primary action" would undo D-010 on the
  // screen that needed it most.
  const src = read("src/app/(app)/workspace/financials/financials-v2.tsx");
  assert.match(
    src,
    /canEdit && nothingStarted \? \(/,
    "the wizard must be gated on nothing being started yet"
  );
  assert.match(
    src,
    /nothingStarted = steps\.every\(\(s\) => !s\.done\)/,
    "'nothing started' must mean no step is done, not some looser test"
  );
  assert.match(
    src,
    /WorkspaceNextStepButton/,
    "once underway it must fall through to the ordinary next-step button"
  );
});

test("Financials keeps the guided setup reachable after it stops being primary", () => {
  // Moved, never removed. A beginner tool that hides its walkthrough the
  // moment you type one number is worse than one that never had it.
  const src = read("src/app/(app)/workspace/financials/financials-v2.tsx");
  assert.match(src, /label="Guided setup"/);
});

test("Financials states its blocking notices in one band, not two amber stripes", () => {
  // The conflict pill used to sit in its own row under the header while the
  // break-even explanation hung off the progress bar. Both are the same kind
  // of thing — something between the owner and a forecast they can trust.
  const src = read("src/app/(app)/workspace/financials/financials-v2.tsx");
  assert.match(src, /alert=\{alertBand\}/);
  assert.match(src, /conflictCount > 0 \|\| blockedReason/);
  assert.doesNotMatch(
    src,
    /<ConflictNoticeBadge \/>/,
    "the standalone badge row is what the band replaced"
  );
});

test("Buildout & Equipment no longer emphasises the AI action", () => {
  // One of the three screens Trent named when he ruled D-010. "Write with AI"
  // was the filled button; it is now a menu row. Pin both halves — gone from
  // the emphasised slot, still present in the menu.
  const src = read(
    "src/app/(app)/workspace/buildout-equipment/buildout-workspace.tsx"
  );
  assert.doesNotMatch(
    src,
    /primaryAction=/,
    "this screen has no honest single next action, so the slot stays empty"
  );
  assert.match(src, /label="Write with AI"/, "moved, not removed");
});

test("Suppliers emphasises adding a vendor, not the AI suggestion", () => {
  // Both sat side by side in the old cluster with equal weight. D-010 says the
  // real action wins the emphasis and the AI one moves into the menu.
  const src = read("src/app/(app)/workspace/suppliers/suppliers-workspace.tsx");
  const primary = src.slice(src.indexOf("primaryAction={"), src.indexOf("overflow={"));
  assert.match(primary, /Add vendor/);
  assert.doesNotMatch(primary, /Sparkles|with AI/, "the AI action is not the emphasised one");
  assert.match(src, /Suggest vendors with AI/, "moved, not removed");
});
