// TIM-4118: reading back the role the server just created.
//
// Trent, 2026-08-04: "under hiring, when adding a role, I can type in the role
// name but when I hit enter, it doesn't result in creating the new role."
//
// ── What was actually happening ──────────────────────────────────────────────
//
// The role WAS created. The server returned 201 and the row. The screen threw
// it away.
//
// POST /api/workspaces/hiring/roles ends with:
//
//     return Response.json(data, { status: 201 })
//
// — the row at the TOP LEVEL, unwrapped. Both the v2 and v3 hiring screens read
// it as `{ data?: OrgRole }` and took `body.data`, which is `undefined`. So:
//
//   • `created` came back null
//   • the "did it work" branch was skipped
//   • the new role was never added to the list
//   • the input stayed open with the typed text still in it
//   • the save indicator said Saved, because the request genuinely succeeded
//
// To the owner that is "Enter does nothing". Then it gets worse: the input is
// still focused and still holds the text, so clicking away fires the blur
// handler, which submits AGAIN — and now there are two identical roles waiting
// to appear on the next refresh.
//
// The v1 screen reads it correctly (`(await res.json()) as OrgRole`). The bug
// was introduced when v2 was written from scratch and inherited by v3. Nothing
// caught it because no test ever compared what the route returns with what the
// screen expects — the two lived in different files and agreed with nobody.
//
// ── Why a module for six lines ───────────────────────────────────────────────
//
// So the two can be checked against each other. `created-role.test.mjs` reads
// the API route's own source and asserts the shape this parser accepts is the
// shape that route actually returns. That is the invariant that was missing,
// and it is worth more than the parser.
//
// Pure and dependency-free so node:test can load it directly.

/** The minimum shape a caller needs back: something with an id. */
export interface CreatedRole {
  id: string;
  [key: string]: unknown;
}

function isRoleLike(value: unknown): value is CreatedRole {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.length > 0
  );
}

/**
 * Pull the created role out of a POST response body.
 *
 * Accepts BOTH the unwrapped row (what the hiring roles route returns) and a
 * `{ data: row }` envelope (what several other routes in this codebase return).
 * Being tolerant here is deliberate: the alternative is that whichever
 * convention a route picks silently decides whether a screen works, which is
 * precisely how this bug survived two rewrites.
 *
 * Returns null only when there is genuinely no identifiable row — which is a
 * real failure the caller must surface, not swallow.
 */
export function parseCreatedRole(body: unknown): CreatedRole | null {
  if (isRoleLike(body)) return body;
  if (typeof body === "object" && body !== null) {
    const inner = (body as { data?: unknown }).data;
    if (isRoleLike(inner)) return inner;
  }
  return null;
}
