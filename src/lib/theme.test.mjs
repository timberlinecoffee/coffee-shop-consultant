// TIM-3569: contract tests for the theme mode registry.

import { test } from "node:test";
import assert from "node:assert/strict";

const { THEME_MODES, THEME_PREF_KEY, THEME_STORAGE_KEY, isThemeMode } =
  await import("./theme.ts");

test("THEME_MODES lists Light / Dark / Auto in that order", () => {
  assert.deepEqual(
    THEME_MODES.map((m) => m.id),
    ["light", "dark", "auto"]
  );
});

test("THEME_MODES every entry has a non-empty label + description", () => {
  for (const mode of THEME_MODES) {
    assert.ok(mode.label.length > 0, `label empty for ${mode.id}`);
    assert.ok(mode.description.length > 0, `description empty for ${mode.id}`);
  }
});

test("isThemeMode accepts the three canonical strings", () => {
  assert.equal(isThemeMode("light"), true);
  assert.equal(isThemeMode("dark"), true);
  assert.equal(isThemeMode("auto"), true);
});

test("isThemeMode rejects invalid input", () => {
  assert.equal(isThemeMode("system"), false);
  assert.equal(isThemeMode(""), false);
  assert.equal(isThemeMode(null), false);
  assert.equal(isThemeMode(undefined), false);
  assert.equal(isThemeMode({ mode: "dark" }), false);
});

test("storage + pref keys are stable", () => {
  // Both keys are read by the pre-hydration script and PUT to /api/ui-prefs;
  // renaming either without migrating breaks preserved user preferences.
  assert.equal(THEME_STORAGE_KEY, "gw-theme");
  assert.equal(THEME_PREF_KEY, "platform.theme");
});
