// TIM-2470: pin tests for the dashboard root page.
//
// The route is a Server Component. The shared <WorkspaceHeader> is a
// client component, and passing a lucide forwardRef icon as a prop across
// the RSC/client boundary fails to serialize (RSC error row →
// "Something went wrong" via dashboard/error.tsx). This pin enforces:
//
//   1. The dashboard route does NOT import WorkspaceHeader.
//   2. loadPlanOverview is wrapped in a try/catch so a single bad
//      DB row cannot tip the entire dashboard into the error boundary.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "page.tsx"), "utf8");

test("TIM-2470 — dashboard page does not import the client WorkspaceHeader", () => {
  // Lucide icons (forwardRef components) cannot be passed as props from a
  // Server Component to a "use client" component. The dashboard hand-rolls
  // the canonical header chrome instead. Reintroducing the import is the
  // exact regression this guards against.
  assert.equal(
    /from\s+["']@\/components\/workspace\/WorkspaceHeader["']/.test(source),
    false,
    "dashboard/page.tsx must not import WorkspaceHeader — see TIM-2470",
  );
  assert.equal(
    /<WorkspaceHeader\b/.test(source),
    false,
    "dashboard/page.tsx must not render <WorkspaceHeader …> — see TIM-2470",
  );
});

test("TIM-2470 — loadPlanOverview is wrapped in try/catch", () => {
  // Defense in depth: the dashboard is the existing-user root. A single
  // bad row in workspace_status or plan_quality_audit_cache must never
  // crash the route.
  const idx = source.indexOf("loadPlanOverview(supabase");
  assert.ok(idx >= 0, "expected a call to loadPlanOverview");
  const window = source.slice(Math.max(0, idx - 200), idx + 200);
  assert.ok(
    /try\s*\{/.test(window),
    "loadPlanOverview call must be inside a try block",
  );
  assert.ok(
    /emptyOverview\(\)/.test(source),
    "expected emptyOverview() fallback to exist",
  );
});

test("TIM-2470 — canonical header chrome is hand-rolled with the lucide ClipboardList icon", () => {
  // We still render the canonical TIM-1894 / TIM-1937 chrome (icon + h1 +
  // description + right-aligned action cluster), just inline so the icon
  // never has to cross an RSC/client serialization boundary.
  assert.ok(
    /<ClipboardList\b/.test(source),
    "expected an inline <ClipboardList /> render in the page header",
  );
  assert.ok(
    /Plan Overview/.test(source),
    "expected h1 copy 'Plan Overview' on the dashboard header",
  );
  assert.ok(
    /<RefreshConflictsButton\s*\/>/.test(source),
    "expected <RefreshConflictsButton /> in the action cluster",
  );
});
