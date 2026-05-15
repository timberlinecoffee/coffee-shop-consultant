// Regression test for TIM-544: Dashboard "Your tools" quick-links 404.
// Pre-fix, the dashboard rendered 4 links — /plan/equipment, /plan/financials,
// /plan/costs, /plan/milestones — none of which had a matching App Router
// page. Every dashboard visit exposed a 404 trap. This test parses the
// dashboard source for tool hrefs and asserts each one resolves to a real
// page.tsx (either a stub ComingSoon page or a real implementation). Anyone
// adding a new tool to the dashboard must ship the route in the same change.

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
  // Match the inline tool array entries: href: "/plan/<slug>"
  const matches = [...src.matchAll(/href:\s*"(\/plan\/[a-z][a-z0-9-]*)"/g)].map(
    (m) => m[1]
  );
  // Filter to only the static tool routes (exclude the dynamic /plan/${m.num}
  // template literal which would not have quoted slug form anyway).
  return matches.filter((href) => !/\/\d+$/.test(href));
}

function routeFileFor(href) {
  // /plan/equipment -> src/app/plan/equipment/page.tsx
  const slug = href.replace(/^\/plan\//, "");
  return resolve(repoRoot, "src/app/plan", slug, "page.tsx");
}

test("dashboard exposes the expected quick-link tools", () => {
  const hrefs = parseToolHrefs();
  assert.deepEqual(
    hrefs.sort(),
    [
      "/plan/costs",
      "/plan/equipment",
      "/plan/financials",
      "/plan/milestones",
    ],
    "dashboard 'Your tools' hrefs drifted — update this test and ship matching routes"
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

test("quick-link pages render the ComingSoon stub or a real implementation", () => {
  const hrefs = parseToolHrefs();
  for (const href of hrefs) {
    const src = readFileSync(routeFileFor(href), "utf8");
    const hasComingSoon = /ComingSoon/.test(src);
    const hasDefaultExport = /export default/.test(src);
    assert.ok(
      hasDefaultExport,
      `${href}/page.tsx must export a default page component`
    );
    // Stubs use ComingSoon; once a real tool replaces it, the test still
    // passes because hasDefaultExport is the load-bearing check. ComingSoon
    // assertion is informational only — drop it once the stubs are gone.
    if (!hasComingSoon) {
      // Real implementation — just confirm it imports from a known location.
      assert.match(
        src,
        /from\s+["']@\//,
        `${href}/page.tsx looks empty — confirm it actually renders`
      );
    }
  }
});
