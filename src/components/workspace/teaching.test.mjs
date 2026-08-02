// TIM-4112 (UX Phase 4): the teaching lines say why a thing matters to a coffee
// shop. They never explain what a control does.
//
// That is the whole distinction the phase rests on, and it is the one that
// erodes first — the easiest sentence to write is "enter your average ticket
// here", and it teaches nobody anything. So it fails the build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teachingLine, teachingKeys, allTeachingLines } from "./teaching.ts";

const read = (rel) =>
  readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("no line explains what a control does", () => {
  // The failure mode this phase exists to avoid. If a line needs these words
  // it is documentation, and documentation belongs somewhere the owner goes
  // looking for it rather than in the one line they will actually read.
  const UI_WORDS =
    /\b(click|tap|button|field|tab|dropdown|checkbox|toggle|form|menu|screen|page|section below|above|press)\b/i;
  for (const { where, line } of allTeachingLines()) {
    assert.doesNotMatch(line, UI_WORDS, `${where} describes the interface: "${line}"`);
  }
});

test("no line is an instruction dressed as a lesson", () => {
  // "Enter your fixed costs" is a task the screen already implies. The line has
  // to carry something the owner did not already know.
  for (const { where, line } of allTeachingLines()) {
    assert.doesNotMatch(
      line,
      /^(Enter|Add|Fill|Type|Choose|Select|Set|Complete|Start by)\b/i,
      `${where} opens with an instruction: "${line}"`
    );
  }
});

test("every line is one the owner will actually finish reading", () => {
  for (const { where, line } of allTeachingLines()) {
    assert.ok(line.length >= 60, `${where} is too thin to teach anything`);
    assert.ok(
      line.length <= 260,
      `${where} is ${line.length} chars — past the point anyone reads it`
    );
  }
});

test("trade terms are never used bare", () => {
  // The reader does not know COGS or a P&L. Session-zero brief: "Not stupid,
  // learning." A line may teach a term, but never lean on one.
  const JARGON = /\b(COGS|P&L|EBITDA|gross margin|net margin|CAC|LTV|SKU)\b/i;
  for (const { where, line } of allTeachingLines()) {
    assert.doesNotMatch(line, JARGON, `${where} uses a trade term bare: "${line}"`);
  }
});

test("the numbers a beginner cannot guess come with a real range", () => {
  // The beginner walkthrough's finding: the product asks for numbers the owner
  // has no way to produce. Where a line stands in front of one of those, it
  // has to hand over a starting point.
  const traffic = teachingLine("financials", "v2-section-daily-traffic");
  const ticket = teachingLine("financials", "v2-section-revenue");
  assert.match(traffic, /\d+\s*[–-]\s*\d+/, "daily customers needs a real range");
  assert.match(ticket, /\$\d+\s*and\s*\$\d+/, "average spend needs a real range");
});

test("a screen with no current step still has something to say", () => {
  // List-shaped workspaces never have a "next step", and a finished one has run
  // out. Neither should leave the space blank.
  for (const key of teachingKeys()) {
    const line = teachingLine(key);
    assert.ok(line && line.length > 0, `${key} has nothing to say when idle`);
  }
});

test("an unknown workspace returns nothing rather than a guess", () => {
  assert.equal(teachingLine("not_a_workspace"), undefined);
  assert.equal(teachingLine("marketing", "not_a_step"), teachingLine("marketing"));
});

test("every workspace on the header standard has a line", () => {
  // The ratchet lists the migrated screens. A screen can be consistent and
  // still teach nothing, so this ties the two together: if it is on the
  // standard, it says why it matters.
  const src = read("src/components/workspace/workspace-migration.test.mjs");
  const files = [...src.matchAll(/file: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(files.length >= 11, "expected the full migrated list");

  // Map each migrated file to the workspace key it passes to Scout.
  const missing = [];
  for (const file of files) {
    const screen = read(file);
    const m = screen.match(/workspaceKey="([a-z_]+)"/);
    if (!m) continue; // a screen may legitimately have no Scout key in scope
    if (!teachingKeys().includes(m[1])) missing.push(`${m[1]} (${file})`);
  }
  assert.deepEqual(missing, [], `these screens are on the standard but teach nothing`);
});
