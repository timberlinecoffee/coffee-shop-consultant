// TIM-2950: pinning test — Add Ingredient affordance must be ALWAYS visible
// in the recipe editor (combobox when there are catalog ingredients to pick;
// disabled placeholder pointing to the Ingredients tab when there are none
// available). And rows seeded from category defaults must render with the
// "Default Item" badge (TIM-3226 renamed from "From Category").
//
// We test by reading the source file (no jsdom/React runtime here) and
// asserting the structural shape — same pattern as TIM-2877 ResponsiveChart.
import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"

const SRC = readFileSync(
  new URL("./menu-workspace.tsx", import.meta.url),
  "utf8",
)

test("Add Ingredient combobox renders when catalog has available ingredients", () => {
  assert.match(
    SRC,
    /canEdit && availableIngredients\.length > 0 && \(\s*<IngredientCombobox/,
  )
})

test("Add Ingredient disabled placeholder renders when no available ingredients (catalog empty OR fully used)", () => {
  assert.match(
    SRC,
    /canEdit && availableIngredients\.length === 0 && \(/,
  )
  assert.match(SRC, /Add ingredients in the Ingredients tab first/)
  assert.match(
    SRC,
    /All catalog ingredients are in this recipe — add more in the Ingredients tab/,
  )
})

test("Add Ingredient affordance has no other gating that would hide it when defaults are present", () => {
  // Reject any guard that conditions Add visibility on the absence of
  // category defaults — Add must show regardless of whether defaults seeded
  // recipe lines.
  assert.doesNotMatch(SRC, /categoryDefault[^.]*\.length\s*===\s*0/)
  assert.doesNotMatch(SRC, /!categoryDefault[^.]*\.length/)
})

test("RecipeLineRow accepts isFromCategoryDefault and renders Default Item badge", () => {
  assert.match(SRC, /isFromCategoryDefault\?: boolean/)
  assert.match(SRC, /Default Item/)
  assert.match(
    SRC,
    /isFromCategoryDefault=\{categoryDefaultIngredientIds\.has\(line\.ingredient_id\)\}/,
  )
})

test("Category default ingredient id set is derived from this item's category", () => {
  assert.match(
    SRC,
    /categoryDefaults\s*\.filter\(\(d\) => d\.category_id === item\.category_id\)/,
  )
})

test("ItemEditorPanel receives categoryDefaults from the workspace", () => {
  assert.match(SRC, /categoryDefaults=\{categoryDefaults\}/)
})
