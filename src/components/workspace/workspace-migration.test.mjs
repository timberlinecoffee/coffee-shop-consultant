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
import { readFileSync, readdirSync } from "node:fs";

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
    name: "Concept",
    file: "src/app/(app)/workspace/concept/concept-editor.tsx",
    progress: "steps",
  },
  {
    // The other list-shaped page in the Equipment & Supplies suite.
    name: "Supplies",
    file: "src/app/(app)/workspace/buildout-equipment/supplies/supplies-workspace.tsx",
    progress: "count",
  },
  {
    // Three sub-pages behind one header (overview / milestones / playbook).
    name: "Launch Plan",
    file: "src/app/(app)/workspace/opening-month-plan/opening-month-plan-workspace.tsx",
    progress: "count",
  },
  {
    name: "Hiring & Onboarding",
    file: "src/app/(app)/workspace/hiring/hiring-workspace-v3.tsx",
    progress: "count",
  },
  {
    // The generated document — the one screen where "sections" is the right
    // word, and the one place the `sections` progress kind may be used.
    name: "Business Plan",
    file: "src/app/(app)/workspace/business-plan/business-plan-workspace.tsx",
    progress: "sections",
  },
  {
    name: "Menu & Pricing",
    file: "src/app/(app)/workspace/menu-pricing/menu-workspace.tsx",
    progress: "count",
    // Prints something DIFFERENT from the page you are looking at, so Phase 1's
    // rule lets it keep its own descriptive name.
    ownPrintName: "Print recipe cards",
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
    } else if (ws.progress === "sections") {
      assert.ok(
        /kind: "sections"/.test(src),
        `${ws.name} is the generated document, so it reviews sections`
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
      if (wording === ws.ownPrintName) continue;
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

test("Concept has Ask Scout back, without losing its per-card AI", () => {
  // Trent's call 2026-08-02. TIM-2897 removed the top-level Scout on the
  // reasoning that the per-card "Write with AI" buttons are Concept's AI
  // surface. That reasoning still holds for the CARDS — so both must be
  // present. Concept was the one workspace out of eleven with no Scout at all.
  const src = read("src/app/(app)/workspace/concept/concept-editor.tsx");
  assert.match(src, /<AskScoutButton/, "Concept must offer Scout like every other screen");
  assert.match(src, /onWriteWithAi=/, "the per-card AI buttons must survive it");
});

test("Supplies reports the write, not the keystroke", () => {
  // Trent's call 2026-08-02 added a save indicator to the one page without
  // one. The rows here save themselves, and `onItemsChange` fires
  // optimistically the moment the owner types — hanging "Saved" off that would
  // be the exact class of lie the save-honesty work removed. The events must
  // come from around the request.
  const table = read("src/components/equipment/SuppliesDesktopTable.tsx");
  assert.match(table, /onSaveActivity\?\.\("saving"\)/);
  assert.match(table, /onSaveActivity\?\.\("saved"\)/);
  assert.match(table, /onSaveActivity\?\.\("failed"\)/);

  const page = read(
    "src/app/(app)/workspace/buildout-equipment/supplies/supplies-workspace.tsx"
  );
  assert.match(page, /case "failed":/, "a failed write must reach the indicator");
  assert.doesNotMatch(
    page,
    /onItemsChange=\{[^}]*confirmSaved/,
    "the indicator must not be driven by the optimistic change callback"
  );
});

test("Supplies' Save button means now, not in 700ms", () => {
  const table = read("src/components/equipment/SuppliesDesktopTable.tsx");
  assert.match(table, /flushRef\.current = \(\) => \{/);
  const page = read(
    "src/app/(app)/workspace/buildout-equipment/supplies/supplies-workspace.tsx"
  );
  assert.match(page, /onSave=\{\(\) => flushRef\.current\?\.\(\)\}/);
});

test("Launch Plan offers Scout on every sub-page, not just one", () => {
  // Scout used to be gated on the Milestones tab, so the same header offered
  // help on one sub-page and not the next — drift inside a single workspace,
  // which is the same complaint at smaller scale.
  const src = read(
    "src/app/(app)/workspace/opening-month-plan/opening-month-plan-workspace.tsx"
  );
  const scout = src.slice(src.indexOf("scout={"), src.indexOf("save={"));
  assert.match(scout, /<AskScoutButton/);
  assert.doesNotMatch(
    scout,
    /showMilestones &&/,
    "the Scout slot must not be gated on which sub-page is open"
  );
});

test("Hiring emphasises adding a role, not the AI suggestion", () => {
  // Two equal-weight buttons meant the screen expressed no opinion about which
  // to reach for. Deciding what you need comes before asking a machine to
  // guess it.
  const src = read("src/app/(app)/workspace/hiring/hiring-workspace-v3.tsx");
  const primary = src.slice(src.indexOf("primaryAction={"), src.indexOf("overflow={"));
  assert.match(primary, /Add role/);
  assert.doesNotMatch(primary, /Sparkles/, "the AI action is not the emphasised one");
  assert.match(src, /label="Suggest roles with AI"/, "moved, not removed");
});


test("only the Business Plan uses the sections progress kind", () => {
  // T1-D reserved "sections" for parts of a generated document. Exactly one
  // workspace IS that document. If a second screen starts calling its parts
  // sections, the ambiguity T1-D removed is back.
  const users = MIGRATED.filter((ws) => /kind: "sections"/.test(code(ws.file)));
  assert.deepEqual(users.map((w) => w.name), ["Business Plan"]);
});

test("Business Plan's count and its emphasised button read the same test", () => {
  // Both come from one derived list, so the number at the top and the section
  // the button opens cannot disagree.
  const src = read("src/app/(app)/workspace/business-plan/business-plan-workspace.tsx");
  assert.match(src, /const reviewedSteps = sections\.map/);
  assert.match(src, /reviewedCount = reviewedSteps\.filter\(\(s\) => s\.done\)\.length/);
  assert.match(src, /nextUnreviewed = nextStep\(reviewedSteps\)/);
});

test("Expand all is a menu row, not a bare link in the action cluster", () => {
  // It was the only control on any workspace that looked like body text.
  const src = read("src/app/(app)/workspace/business-plan/business-plan-workspace.tsx");
  assert.match(src, /label=\{allExpanded \? "Collapse all sections" : "Expand all sections"\}/);
  assert.doesNotMatch(src, /underline underline-offset-2 cursor-pointer/);
});

test("Menu & Pricing no longer emphasises the AI action", () => {
  // The last of the three screens Trent named when he ruled D-010.
  const src = read("src/app/(app)/workspace/menu-pricing/menu-workspace.tsx");
  assert.doesNotMatch(
    src,
    /primaryAction=/,
    "items are added inside a category, so there is no honest header-level add"
  );
  assert.match(src, /label="Suggest menu items with AI"/, "moved, not removed");
});

test("none of the three AI buttons Trent named is emphasised any more", () => {
  // The whole point of D-010, checked in one place so it cannot rot screen by
  // screen. Each label must survive somewhere — moved, never removed — and none
  // may sit in an emphasised slot. Financials is the documented exception
  // (D-015): its wizard holds the slot only while the forecast is blank.
  const screens = [
    ["src/app/(app)/workspace/menu-pricing/menu-workspace.tsx", "Suggest menu items with AI"],
    ["src/app/(app)/workspace/buildout-equipment/buildout-workspace.tsx", "Write with AI"],
    ["src/app/(app)/workspace/financials/financials-v2.tsx", "Guided setup"],
  ];
  for (const [file, label] of screens) {
    const src = read(file);
    assert.ok(src.includes(label), `${label} must still exist somewhere`);
    if (label === "Guided setup") continue;
    const primaryAt = src.indexOf("primaryAction=");
    if (primaryAt === -1) continue;
    const slot = src.slice(primaryAt, src.indexOf("overflow=", primaryAt));
    assert.ok(!slot.includes(label), `${label} must not sit in the emphasised slot`);
  }
});

test("the Menu workspace stayed writable", () => {
  // TIM-4110. This file grew to 192KB, which is past the point where the agent
  // tooling can write it back in one operation — a 100-line change needed 4,800
  // correct lines retyped. The tabs were split out along the screen's own
  // seams. If it creeps back over the line, the next change to it becomes a
  // transport problem again, so the ceiling is pinned here.
  const bytes = Buffer.byteLength(
    read("src/app/(app)/workspace/menu-pricing/menu-workspace.tsx"),
    "utf8"
  );
  assert.ok(
    bytes < 160_000,
    `menu-workspace.tsx is ${bytes} bytes; split another tab out before it passes 160KB`
  );
});

// ── The escape hatch is closed, even though the prop still exists ───────────

test("no NEW screen may use the deprecated free-form action cluster", () => {
  // TIM-4111. All eleven owner-facing workspaces are off `actions`. The prop
  // cannot just be deleted, because five callers remain — and none of them is
  // one of the eleven:
  //
  //   • two pre-flag surfaces nobody loads (both flags default to the new one)
  //   • three admin/help pages, a different audience with a different job
  //
  // Pinning the list gives the same guarantee deleting the prop would, without
  // breaking screens that legitimately still use it. If this test fails, either
  // a new caller appeared — fix that — or one of these was finally migrated, in
  // which case delete its line here and enjoy it.
  const ALLOWED = [
    "src/app/(app)/workspace/financials/financials-workspace.tsx",
    "src/app/(app)/workspace/hiring/hiring-workspace.tsx",
    "src/app/admin/members/[id]/page.tsx",
    "src/app/admin/members/page.tsx",
    "src/app/admin/support/page.tsx",
    "src/app/help/_components/HelpPageHeader.tsx",
  ];

  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) walk(next, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".tsx")) {
        const src = readFileSync(next, "utf8");
        if (src.includes("WorkspaceHeader") && /\bactions=\{/.test(src)) {
          found.push(`${prefix}${entry.name}`);
        }
      }
    }
  };
  walk(new URL("../../app/", import.meta.url), "src/app/");

  assert.deepEqual(
    found.sort(),
    [...ALLOWED].sort(),
    "the free-form cluster is closed to new callers"
  );
});
