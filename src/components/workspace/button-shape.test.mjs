// TIM-4109: buttons are fully rounded, and the radius lives in two files.
//
// Trent picked the shape from three options rendered side by side at real size
// rather than from words — the lesson recorded in D-009, where "blue" meant two
// different things to the two of us for an entire exchange.
//
// These guards exist because a shape decision is exactly the kind of thing that
// erodes one component at a time. Somebody adds a button with its own radius,
// nobody notices for a month, and then the eleven screens look slightly
// different again — which is the complaint that started this whole batch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

const BASE = "src/components/ui/button.tsx";
const CHROME = "src/components/workspace/WorkspaceActionButton.tsx";
const MENU = "src/components/workspace/WorkspaceActionMenu.tsx";

test("the shared button is fully rounded", () => {
  const src = read(BASE);
  assert.match(src, /rounded-full border font-medium/);
  assert.doesNotMatch(
    src,
    /rounded-(xl|lg|md|sm|none)\b/,
    "no size or variant may quietly opt out of the shape"
  );
});

test("the workspace header button is fully rounded", () => {
  assert.match(read(CHROME), /rounded-full px-3 py-1\.5/);
});

test("the ⋯ trigger matches the buttons beside it", () => {
  // It sits inside the same cluster. A square ⋯ next to four pills reads as
  // sloppiness rather than as a choice.
  const src = read(MENU);
  const trigger = src.slice(src.indexOf("aria-haspopup"), src.indexOf("{open &&"));
  assert.match(trigger, /rounded-full/);
});

test("the popover is NOT a pill", () => {
  // A panel is not a button. Rounding a 220px-wide menu to capsule ends would
  // bow its edges — the shape rule is about controls, not containers.
  const src = read(MENU);
  const popover = src.slice(src.indexOf('role="menu"'));
  assert.match(popover, /rounded-xl/);
});

test("no workspace screen overrides the button radius on its own", () => {
  // The return on Phase 3 is that there is ONE place to change this. A
  // per-screen override hands that back.
  const base = new URL("../../app/(app)/workspace/", import.meta.url);
  const offenders = [];
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) walk(next, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".tsx")) {
        const src = readFileSync(next, "utf8");
        // Only flag a radius applied to one of the shared button components.
        const re =
          /<(WorkspaceActionButton|Button)\b[^>]*className="[^"]*\brounded-(?!full)[a-z0-9]+/gs;
        if (re.test(src)) offenders.push(`${prefix}${entry.name}`);
      }
    }
  };
  walk(base);
  assert.deepEqual(
    offenders,
    [],
    `these screens set their own button radius: ${offenders.join(", ")}`
  );
});
