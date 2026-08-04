// TIM-4118: guards for "Enter did nothing" when adding a hiring role.
//
// The bug: the role was created, the server returned it, and the screen threw
// it away because it looked for the row under a `data` key the route does not
// use. Nothing caught it because no test ever compared what the route RETURNS
// with what the screen EXPECTS — they lived in different files and agreed with
// nobody.
//
// So the most valuable test here is not the parser's. It is the one that reads
// the API route's own source.
//
// Run: node --experimental-strip-types --test src/lib/hiring/created-role.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCreatedRole } from "./created-role.ts";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("the unwrapped row is read — the shape that actually broke", () => {
  const row = { id: "role-1", role_title: "Barista", headcount: 1 };
  assert.deepEqual(parseCreatedRole(row), row);
});

test("a wrapped row is read too", () => {
  // Several other routes in this codebase DO wrap. Being tolerant means a
  // route's choice of convention stops silently deciding whether a screen
  // works — which is how this survived two rewrites.
  const row = { id: "role-1", role_title: "Barista" };
  assert.deepEqual(parseCreatedRole({ data: row }), row);
});

test("nothing identifiable returns null rather than a hollow object", () => {
  // Null is a real failure the caller must SURFACE. The old code turned this
  // same condition into silence, which is what made the bug invisible.
  for (const bad of [null, undefined, {}, [], "role-1", 42, { data: null }, { data: {} }, { id: "" }]) {
    assert.equal(parseCreatedRole(bad), null, `${JSON.stringify(bad)} produced a role`);
  }
});

test("an error envelope is not mistaken for a role", () => {
  assert.equal(parseCreatedRole({ error: "Failed to create role" }), null);
});

test("the parser accepts what the roles route actually returns", () => {
  // THE test. The bug was a disagreement between two files that never met.
  const route = read("app/api/workspaces/hiring/roles/route.ts");
  const post = route.match(/export async function POST[\s\S]*?\n}/);
  assert.ok(post, "the POST handler was renamed or removed");

  // Find what the success path hands back.
  const success = post[0].match(/return Response\.json\(([^,)]+),\s*\{\s*status:\s*201/);
  assert.ok(
    success,
    "the POST handler no longer returns 201 with a body — re-check what the screens read"
  );
  const returned = success[1].trim();

  // `data` here is the inserted row from `.select().single()`, returned
  // unwrapped. If someone later wraps it as `{ data }`, the parser must still
  // cope — which it does, and this asserts we have actually thought about it
  // rather than got lucky.
  const shape = returned === "data" ? { id: "role-1", role_title: "Barista" } : { data: { id: "role-1" } };
  assert.ok(
    parseCreatedRole(shape),
    `the route returns \`${returned}\` and the parser cannot read that shape`
  );
});

test("no hiring screen reaches for the row under a key the route does not send", () => {
  // The exact line that broke, in the exact words it was written in, on both
  // screens that had it. This is the regression guard.
  for (const file of [
    "app/(app)/workspace/hiring/hiring-workspace-v2.tsx",
    "app/(app)/workspace/hiring/hiring-workspace-v3.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /as \{\s*data\?:\s*OrgRole\s*\}/,
      `${file} still reads the created role out of a \`data\` envelope the route never sends`
    );
    assert.match(
      src,
      /parseCreatedRole/,
      `${file} does not use the shared reader, so it can drift again`
    );
  }
});

test("adding a role cannot fire twice for one keypress", () => {
  // The second half of the bug. The input carries BOTH an Enter handler and a
  // blur handler. Enter left the text in place, so clicking away submitted the
  // same title again and created a duplicate. Whichever screen wires both, it
  // must hold a guard so one intention makes one role.
  for (const file of [
    "app/(app)/workspace/hiring/hiring-workspace-v2.tsx",
    "app/(app)/workspace/hiring/hiring-workspace-v3.tsx",
  ]) {
    const src = read(file);
    if (!/onBlur=\{addRole\}/.test(src)) continue; // no blur path, no race
    assert.match(
      src,
      /addingRoleRef/,
      `${file} submits on both Enter and blur with nothing stopping the second one`
    );
  }
});
