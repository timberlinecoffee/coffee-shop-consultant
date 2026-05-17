// Regression test for TIM-560: Dashboard quick-link cards route fix.
// Pre-fix (TIM-544), the dashboard rendered 4 links — /plan/equipment,
// /plan/financials, /plan/costs, /plan/milestones — none of which had a
// matching App Router page. TIM-701 migrated all links to /workspace/* routes.
// This test parses the dashboard source for quick-link hrefs and asserts each
// one resolves to a real page.tsx. Anyone adding a new tool to the dashboard
// must ship the matching route in the same change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

function parseToolHrefs() {
  const src = read("src/app/dashboard/page.tsx");
  // Match object-property hrefs inside the quick-link array: href: "/workspace/<slug>"
  // JSX attribute hrefs (href="...") are intentionally excluded — they belong to
  // navigation links outside the tool cards.
  return [...src.matchAll(/href:\s*"(\/workspace\/[a-z][a-z0-9-]*)"/g)].map(
    (m) => m[1]
  );
}

function routeFileFor(href) {
  // /workspace/buildout-equipment -> src/app/workspace/buildout-equipment/page.tsx
  const slug = href.replace(/^\/workspace\//, "");
  return resolve(repoRoot, "src/app/workspace", slug, "page.tsx");
}

test("dashboard exposes the expected quick-link tools", () => {
  const hrefs = parseToolHrefs();
  assert.deepEqual(
    hrefs.sort(),
    [
      "/workspace/buildout-equipment",
      "/workspace/financials",
      "/workspace/financials",
      "/workspace/launch-plan",
    ],
    "dashboard quick-link hrefs drifted — update this test and ship matching routes"
  );
});

test("every dashboard quick-link has a matching App Router page", () => {
  const hrefs = parseToolHrefs();
  assert.ok(hrefs.length > 0, "no quick-link hrefs parsed from dashboard");
  for (const href of hrefs) {
    const file = routeFileFor(href);
    assert.ok(
      existsSync(file),
      `${href} has no page.tsx at ${file} — would 404 in production`
    );
  }
});

test("quick-link pages render a stub or real implementation", () => {
  const hrefs = [...new Set(parseToolHrefs())];
  for (const href of hrefs) {
    const src = readFileSync(routeFileFor(href), "utf8");
    assert.ok(
      /export default/.test(src),
      `${href}/page.tsx must export a default page component`
    );
    assert.match(
      src,
      /from\s+["']@\//,
      `${href}/page.tsx looks empty — confirm it actually renders`
    );
  }
});
