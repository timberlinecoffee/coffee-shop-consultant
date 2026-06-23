// TIM-2877: pin the ChartDrawer landscape-hint markers.
// AC #3 from TIM-2877 ("TIM-2842 QA spec updated to assert hint presence")
// is enforced here as a structural regression guard against the source
// of ResponsiveChart.tsx — node-test friendly, no jsdom dependency.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "ResponsiveChart.tsx"), "utf8");

test("RotateCw icon is imported from lucide-react", () => {
  assert.match(src, /import\s*\{[^}]*\bRotateCw\b[^}]*\}\s*from\s*"lucide-react"/);
});

test("ChartDrawer header renders the rotate-hint button", () => {
  assert.match(src, /data-testid="chart-drawer-rotate-hint"/);
});

test("rotate-hint button exposes the spec aria-label", () => {
  assert.match(src, /aria-label="Rotate to landscape"/);
});

test("rotate-hint button meets the 44px tap target", () => {
  const headerSlice = src.slice(src.indexOf('aria-label="Rotate to landscape"'));
  assert.match(headerSlice, /min-h-\[44px\]/);
  assert.match(headerSlice, /min-w-\[44px\]/);
});

test("rotate-hint button has a hover tooltip pointing at landscape", () => {
  assert.match(src, /title="Rotate your device for a wider view"/);
});

test("inline status hint exists when the orientation lock cannot run", () => {
  assert.match(src, /role="status"/);
  assert.match(src, /Rotate your device to landscape/);
});
