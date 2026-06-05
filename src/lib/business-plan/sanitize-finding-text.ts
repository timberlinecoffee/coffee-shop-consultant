// TIM-2356: Shared sanitizer for validator output rendered to users.
//
// Board flagged that the regen-time "Internal contradictions flagged" panel was
// leaking raw template markup as visible text — `<num src="user_provided">five</num>`
// rendering literally. Same risk exists everywhere validator findings flow to a
// human surface (export gate, new Plan Quality Check report, future tools).
//
// Rule: every finding field shown to the user MUST go through stripFindingTags()
// at the render boundary. If you need attribution (e.g. "user_provided") for a
// downstream action, carry it as a structured field on the finding object — never
// inline in the copy.
//
// Relative imports / no @/ aliases so node:test can load this module directly.

// TIM-2358: source-marker stripping is canonical in source-markers.ts. This
// module composes that strip with stray-tag cleanup for validator findings
// that may emit other XML-ish attribution markers.
import { stripSourceMarkers } from "./source-markers.ts";

// Catch-all for any remaining XML/HTML-style attribution or template tags the
// validator might emit (e.g. <src ...>, <claim ...>, <ref ...>, self-closing
// <br/>). Removes the tag itself; preserves any text BETWEEN open/close tags
// because those tags are not paired in our content. Anchored to `<letter` so
// stray "<" or "<=" in arithmetic prose is left alone.
const STRAY_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s+[^>]*)?\/?>/g;

// Collapses runs of whitespace that the tag stripper might leave behind
// (e.g. "foo <src x="y"/> bar" -> "foo  bar" -> "foo bar"). Preserves intentional
// newlines so multi-line prose stays multi-line.
const COLLAPSE_SPACES_RE = /[ \t]{2,}/g;

export function stripFindingTags(text: string | null | undefined): string {
  if (text == null) return "";
  if (typeof text !== "string") return "";
  let out = stripSourceMarkers(text);
  out = out.replace(STRAY_TAG_RE, "");
  out = out.replace(COLLAPSE_SPACES_RE, " ");
  return out;
}

// Convenience: strip every string field of an object in place-equivalent style.
// Returns a NEW object (does not mutate). Use for sanitizing entire finding
// payloads before they're handed to a renderer.
export function sanitizeStrings<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = stripFindingTags(v);
    else out[k] = v;
  }
  return out as T;
}
