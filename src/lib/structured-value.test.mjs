// Board directive 2026-07-26 (onboarding brief §1C / §3 rule 7). Pins the
// rendering model for `isStructured: true` AI suggestions. The regression these
// guard against: Object.values() on a string returns its CHARACTERS, so a list
// of prep steps rendered as one letter per table cell.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CELL,
  buildEditModel,
  buildStructuredDiff,
  buildStructuredList,
  deriveKeys,
  formatCellValue,
  humanizeKey,
  serializeEditModel,
  toItems,
} from "./structured-value.ts";

// ── The original bug ────────────────────────────────────────────────────────

test("a list of strings renders one row per string, NOT one letter per cell", () => {
  // menu-workspace.tsx passes JSON.stringify(currentSteps) with isStructured.
  const steps = JSON.stringify(["Grind Beans", "Tamp Evenly", "Pull 25s Shot"]);
  const { columns, rows } = buildStructuredList(steps);

  assert.deepEqual(columns, []); // single unnamed column, no headings to invent
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.cells), [
    ["Grind Beans"],
    ["Tamp Evenly"],
    ["Pull 25s Shot"],
  ]);
  // The specific old failure: cells were ["G","r","i","n"].
  assert.notEqual(rows[0].cells[0], "G");
  assert.equal(rows[0].cells.length, 1);
});

test("no cell ever contains JSON syntax", () => {
  const raw = JSON.stringify([
    { name: "Oat Milk", supplier: { name: "Earth Dairy", tier: "A" }, tags: ["vegan", "local"] },
  ]);
  const { rows } = buildStructuredList(raw);
  for (const cell of rows.flatMap((r) => r.cells)) {
    for (const forbidden of ["{", "}", "[", "]", '"']) {
      assert.ok(!cell.includes(forbidden), `cell ${JSON.stringify(cell)} contains ${forbidden}`);
    }
  }
});

test("nested objects and arrays read as text, never [object Object]", () => {
  assert.equal(
    formatCellValue({ name: "Earth Dairy", lead_time_days: 3 }),
    "Name: Earth Dairy, Lead Time Days: 3",
  );
  assert.equal(formatCellValue(["vegan", "local"]), "vegan, local");
  assert.ok(!formatCellValue({ a: { b: 1 } }).includes("[object Object]"));
});

test("columns past the fourth are NOT dropped (old slice(0,4))", () => {
  const raw = JSON.stringify([{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }]);
  const { columns, rows } = buildStructuredList(raw);
  assert.equal(columns.length, 6);
  assert.deepEqual(rows[0].cells, ["1", "2", "3", "4", "5", "6"]);
});

// ── Shapes ──────────────────────────────────────────────────────────────────

test("array of objects yields humanized headings in first-seen order", () => {
  const raw = JSON.stringify([
    { item_name: "Cups", unitCost: 0.12 },
    { item_name: "Lids", unitCost: 0.08, notes: "12oz only" },
  ]);
  const { columns, rows } = buildStructuredList(raw);
  assert.deepEqual(columns, ["Item Name", "Unit Cost", "Notes"]);
  assert.deepEqual(rows[0].cells, ["Cups", "0.12", EMPTY_CELL]);
  assert.deepEqual(rows[1].cells, ["Lids", "0.08", "12oz only"]);
});

test("a bare object is one row, not a crash", () => {
  const { columns, rows } = buildStructuredList(JSON.stringify({ name: "Solo" }));
  assert.deepEqual(columns, ["Name"]);
  assert.deepEqual(rows[0].cells, ["Solo"]);
});

test("non-JSON input falls back to one row per non-empty line", () => {
  const { columns, rows } = buildStructuredList("first line\n\n  second line  \n");
  assert.deepEqual(columns, []);
  assert.deepEqual(rows.map((r) => r.cells[0]), ["first line", "second line"]);
});

test("empty and null-ish values render as the placeholder, not blank or 'null'", () => {
  assert.equal(formatCellValue(null), EMPTY_CELL);
  assert.equal(formatCellValue(undefined), EMPTY_CELL);
  assert.equal(formatCellValue(""), EMPTY_CELL);
  assert.equal(formatCellValue("   "), EMPTY_CELL);
  assert.equal(formatCellValue(NaN), EMPTY_CELL);
  assert.equal(formatCellValue([]), EMPTY_CELL);
  assert.equal(formatCellValue({}), EMPTY_CELL);
});

test("booleans read as Yes / No", () => {
  assert.equal(formatCellValue(true), "Yes");
  assert.equal(formatCellValue(false), "No");
});

test("zero is preserved, not swallowed as falsy", () => {
  assert.equal(formatCellValue(0), "0");
});

test("toItems on an empty array gives no rows; buildStructuredList stays safe", () => {
  assert.deepEqual(toItems("[]"), []);
  assert.deepEqual(buildStructuredList("[]").rows, []);
  assert.deepEqual(buildStructuredList("null").rows, []);
});

test("deriveKeys returns [] for a scalar list so it renders unnamed", () => {
  assert.deepEqual(deriveKeys(["a", "b"]), []);
  assert.deepEqual(deriveKeys([1, 2]), []);
});

// ── Diff ────────────────────────────────────────────────────────────────────

test("diff marks added, removed and unchanged, proposed order first", () => {
  const original = JSON.stringify([{ name: "Cups" }, { name: "Lids" }]);
  const proposed = JSON.stringify([{ name: "Cups" }, { name: "Napkins" }]);
  const { rows } = buildStructuredDiff(original, proposed);

  assert.deepEqual(
    rows.map((r) => [r.cells[0], r.kind]),
    [
      ["Cups", "unchanged"],
      ["Napkins", "added"],
      ["Lids", "removed"], // appended, so a deletion is never silently hidden
    ],
  );
});

test("diff derives columns across BOTH sides so a new field still gets a heading", () => {
  const original = JSON.stringify([{ name: "Cups" }]);
  const proposed = JSON.stringify([{ name: "Cups", supplier: "Earth" }]);
  const { columns, rows } = buildStructuredDiff(original, proposed);
  assert.deepEqual(columns, ["Name", "Supplier"]);
  // Same column count on every row keeps the two sides visually aligned.
  for (const row of rows) assert.equal(row.cells.length, 2);
});

test("diff of identical values marks everything unchanged", () => {
  const raw = JSON.stringify([{ name: "Cups" }]);
  const { rows } = buildStructuredDiff(raw, raw);
  assert.deepEqual(rows.map((r) => r.kind), ["unchanged"]);
});

test("diff from empty to populated marks every row added", () => {
  const { rows } = buildStructuredDiff("[]", JSON.stringify([{ name: "Cups" }]));
  assert.deepEqual(rows.map((r) => r.kind), ["added"]);
});

// ── Edit model (brief §1C: form editors, never raw text fields) ─────────────

test("scalar list edits as one text box per row", () => {
  const model = buildEditModel(JSON.stringify(["Grind Beans", "Tamp Evenly"]));
  assert.equal(model.scalar, true);
  assert.deepEqual(model.rows, [["Grind Beans"], ["Tamp Evenly"]]);
  assert.equal(serializeEditModel(model, [["Grind Beans"], ["Tamp Evenly"], ["Pull Shot"]]),
    JSON.stringify(["Grind Beans", "Tamp Evenly", "Pull Shot"]));
});

test("object list edits as one labelled field per key", () => {
  const model = buildEditModel(JSON.stringify([{ name: "Cups", unit_cost: 0.12 }]));
  assert.equal(model.scalar, false);
  assert.deepEqual(model.keys, ["name", "unit_cost"]);
  assert.deepEqual(model.labels, ["Name", "Unit Cost"]);
  assert.deepEqual(model.types, ["string", "number"]);
  assert.deepEqual(model.rows, [["Cups", "0.12"]]);
});

test("numbers survive the round trip as numbers, not strings", () => {
  const model = buildEditModel(JSON.stringify([{ name: "Cups", unit_cost: 0.12 }]));
  const out = JSON.parse(serializeEditModel(model, [["Cups", "0.15"]]));
  assert.equal(out[0].unit_cost, 0.15);
  assert.equal(typeof out[0].unit_cost, "number");
});

test("a non-numeric entry in a number field is preserved, not zeroed", () => {
  const model = buildEditModel(JSON.stringify([{ cost: 1 }]));
  assert.equal(JSON.parse(serializeEditModel(model, [["TBD"]]))[0].cost, "TBD");
});

test("booleans round trip through Yes / No", () => {
  const model = buildEditModel(JSON.stringify([{ name: "Cups", in_stock: true }]));
  assert.deepEqual(model.rows, [["Cups", "Yes"]]);
  assert.equal(JSON.parse(serializeEditModel(model, [["Cups", "No"]]))[0].in_stock, false);
});

test("fully blank rows are dropped so an unused add-row never pollutes the save", () => {
  const model = buildEditModel(JSON.stringify([{ name: "Cups" }]));
  assert.deepEqual(JSON.parse(serializeEditModel(model, [["Cups"], [""], ["  "]])), [{ name: "Cups" }]);
  assert.deepEqual(JSON.parse(serializeEditModel(buildEditModel("[]"), [[""]])), []);
});

test("serializeEditModel always emits parseable JSON (menu-workspace does a bare JSON.parse)", () => {
  const model = buildEditModel(JSON.stringify(["a"]));
  for (const rows of [[['{"broken": ']], [["]]]"]], [['quote " inside']], [[""]]]) {
    assert.doesNotThrow(() => JSON.parse(serializeEditModel(model, rows)));
  }
});

test("empty cells are omitted rather than written as null", () => {
  const model = buildEditModel(JSON.stringify([{ name: "Cups", notes: "12oz" }]));
  const out = JSON.parse(serializeEditModel(model, [["Cups", ""]]));
  assert.deepEqual(out, [{ name: "Cups" }]);
});

// ── Headings ────────────────────────────────────────────────────────────────

test("humanizeKey handles snake_case, kebab-case and camelCase", () => {
  assert.equal(humanizeKey("item_name"), "Item Name");
  assert.equal(humanizeKey("unit-cost"), "Unit Cost");
  assert.equal(humanizeKey("unitCostCents"), "Unit Cost Cents");
  assert.equal(humanizeKey("name"), "Name");
});
