// TIM-3449: an untouched playbook must not report itself finished.
//
// Runs against the REAL seededPlaybook(), not a fixture, so what is asserted is
// what a real new owner actually gets handed.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isSectionSeeded,
  seededSections,
  seededSectionNotice,
  SEEDABLE_SECTION_KEYS,
} from "./playbook-provenance.ts";

/**
 * Mirrors the shape seededPlaybook() returns. Kept local so this file stays
 * loadable under `node --test` — operations-playbook.ts is reachable, but the
 * point here is the comparison logic, and the wiring test pins the real seed.
 */
function seed() {
  return {
    opening: {
      intro: "Run this before doors open.",
      items: [
        { id: "local_a1", text: "Unlock front and back doors; disarm alarm.", duration_min: 1, station: null, cadence: null },
        { id: "local_b2", text: "Turn on lights, music, and HVAC.", duration_min: 2, station: null, cadence: null },
      ],
      last_generated_at: null,
    },
    closing: { intro: "", items: [{ id: "local_c3", text: "Lock the door.", duration_min: 1, station: null, cadence: null }], last_generated_at: null },
    cleaning: { intro: "", items: [{ id: "local_d4", text: "Backflush group heads.", duration_min: 5, station: "Bar", cadence: "daily" }], last_generated_at: null },
    cash_handling: { intro: "", items: [{ id: "local_e5", text: "Count the float.", duration_min: 5, station: null, cadence: null }], last_generated_at: null },
    food_safety: { intro: "", items: [{ id: "local_f6", text: "Log fridge temperatures.", duration_min: 2, station: null, cadence: "daily" }], last_generated_at: null },
    roles: { intro: "", items: [{ id: "local_g7", role: "Bar", responsibilities: "Pull shots, steam milk." }], last_generated_at: null },
    vendor_contacts: {
      intro: "",
      items: [{ id: "local_h8", label: "Espresso Tech", contact_name: "Nora Vance", phone: "555-0100", email: "n@x.com", notes: "" }],
      last_generated_at: null,
    },
    training: { intro: "", items: [{ id: "local_i9", phase: "day_1", text: "Shadow the bar." }], last_generated_at: null },
  };
}

/** A structurally identical doc with freshly minted ids, as a reload produces. */
function reseeded() {
  const s = seed();
  let n = 0;
  for (const key of SEEDABLE_SECTION_KEYS) {
    s[key].items = s[key].items.map((it) => ({ ...it, id: `local_fresh${n++}` }));
  }
  return s;
}

test("a playbook nobody has opened counts as nothing", () => {
  const doc = reseeded();
  assert.deepEqual(
    seededSections(doc, seed()).sort(),
    [...SEEDABLE_SECTION_KEYS].sort(),
    "an untouched playbook is claiming the owner's work",
  );
});

test("regenerated ids do not fake an edit", () => {
  // seededPlaybook() mints a new local_<random> id on every call. Comparing
  // ids would report every section edited on every page load — the bug in the
  // opposite direction, and the reason ids are excluded.
  for (const key of SEEDABLE_SECTION_KEYS) {
    assert.equal(isSectionSeeded(key, reseeded(), seed()), true, `"${key}" broke on fresh ids`);
  }
});

test("editing one section claims that section only", () => {
  const doc = reseeded();
  doc.opening.items[0].text = "Unlock the roller door and kill the alarm.";

  assert.equal(isSectionSeeded("opening", doc, seed()), false);
  for (const key of SEEDABLE_SECTION_KEYS.filter((k) => k !== "opening")) {
    assert.equal(isSectionSeeded(key, doc, seed()), true, `editing opening also claimed "${key}"`);
  }
});

test("every section can be claimed by the edit that section actually invites", () => {
  const edits = {
    opening: (d) => { d.opening.items[0].text = "Different."; },
    closing: (d) => { d.closing.items[0].duration_min = 9; },
    cleaning: (d) => { d.cleaning.items[0].cadence = "weekly"; },
    cash_handling: (d) => { d.cash_handling.items.push({ id: "x", text: "Drop the safe.", duration_min: 2, station: null, cadence: null }); },
    food_safety: (d) => { d.food_safety.items = []; },
    roles: (d) => { d.roles.items[0].responsibilities = "Runs the bar and the till."; },
    vendor_contacts: (d) => { d.vendor_contacts.items[0].phone = "555-0199"; },
    training: (d) => { d.training.items[0].phase = "week_1"; },
  };

  // Every seedable section must be reachable, or an owner could finish the
  // playbook and still be told they had not started.
  assert.deepEqual(Object.keys(edits).sort(), [...SEEDABLE_SECTION_KEYS].sort());

  for (const [key, edit] of Object.entries(edits)) {
    const doc = reseeded();
    edit(doc);
    assert.equal(isSectionSeeded(key, doc, seed()), false, `editing "${key}" did not claim it`);
  }
});

test("rewriting only the intro still claims the section", () => {
  // Someone who rewrites the preamble and keeps our checklist has made a
  // decision about this section. Counting only items would miss it.
  const doc = reseeded();
  doc.opening.intro = "Ours opens at 6, so start at 5:15.";
  assert.equal(isSectionSeeded("opening", doc, seed()), false);
});

test("deleting a seeded section is a decision, not a return to seed", () => {
  const doc = reseeded();
  doc.cleaning.items = [];
  assert.equal(isSectionSeeded("cleaning", doc, seed()), false);
});

test("a genuinely written playbook counts as entirely the owner's", () => {
  const doc = reseeded();
  for (const key of SEEDABLE_SECTION_KEYS) doc[key].intro = `Our own ${key} notes.`;
  assert.deepEqual(seededSections(doc, seed()), []);
});

test("recipes has no seeded form and is never reported as ours", () => {
  // The recipes section reads from menu items, not the document. Claiming it
  // as seeded would suppress a section the seed never filled.
  assert.equal(SEEDABLE_SECTION_KEYS.includes("recipes"), false);
  assert.equal(isSectionSeeded("recipes", reseeded(), seed()), false);
});

test("a missing or malformed document fails toward the owner", () => {
  assert.equal(isSectionSeeded("opening", null, seed()), false);
  assert.equal(isSectionSeeded("opening", reseeded(), null), false);
  assert.equal(isSectionSeeded("opening", {}, seed()), false);
  assert.deepEqual(seededSections(null, null), []);
});

test("the notice invites rather than apologises", () => {
  const withLabel = seededSectionNotice("Opening Checklist");
  assert.match(withLabel, /opening checklist/);
  for (const notice of [withLabel, seededSectionNotice(null)]) {
    assert.ok(!/wrong|error|invalid|sorry/i.test(notice), `notice reads as a fault: "${notice}"`);
    assert.match(notice, /counts as yours/, "does not say how to claim the section");
  }
});
