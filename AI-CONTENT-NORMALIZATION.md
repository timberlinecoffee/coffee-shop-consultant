# AI Content Normalization

`src/lib/normalize.ts` is the single normalization boundary for all AI-generated and external content entering the system. This document defines where to call it, why the boundary exists, and how to extend it.

## The TIM-1002 Lesson: Boundary Over Display Layer

TIM-1002 established that fixing AI content at the display layer (e.g., a React component calling `toTitleCase()` on render) is insufficient. Problems:

1. **Database drift** — raw values are stored dirty; exports, reports, and downstream integrations see uncleaned data.
2. **Race conditions** — the fix-on-read layer can be bypassed by any path that doesn't go through the component (API consumers, seed scripts, scheduled jobs).
3. **Inconsistency** — two display paths can apply different fixes, producing different output for the same stored value.

**Rule:** normalize at the entry point — before the value is persisted or pushed to an external service — not at read time.

## Where to Call `normalize.ts`

Call the relevant normalizer **before** writing to the database or pushing to an external service:

| Entry point | What to normalize | Function |
|---|---|---|
| Server actions (`src/app/**/actions.ts`) | AI-generated labels, names, titles | `normalizeLabel()` / `titleCaseFields()` |
| Seed scripts (`supabase/seed.sql`, `scripts/*.js`) | All string fields that appear in the UI | `normalizeLabel()` |
| Klaviyo push paths | Email subject lines (voice rules); segment names | `normalizeEmailSubject()` |
| Shopify push paths | Product titles, variant names, metafield values | `normalizeLabel()` |
| Canva push paths | Template name fields, text layer content | `normalizeLabel()` |
| AI prompt response parsers | Any field declared as a label in the prompt contract | `titleCaseFields()` on parsed JSON |

## How to Add a New Normalizer

1. Add the function to `src/lib/normalize.ts`. Keep it pure (no side effects, no I/O).
2. Add unit tests in `src/lib/normalize.test.mjs`. Cover the happy path, the edge case that prompted the new rule, and at least one fixture from the allowlist.
3. Wire the call at the relevant entry point (see table above).
4. If the rule has legitimate exceptions, add them to the allowlist (see below).
5. PR description must name the TIM issue that motivated the rule.

## Allowlist for Legitimate Exceptions

Some values must not be normalized (e.g., lowercase brand names, product codes, legal entity names). The allowlist lives at:

```
src/lib/normalize-allowlist.json
```

Format:

```json
{
  "labelExemptions": ["illy", "nespresso", "g&b"],
  "voiceExemptions": []
}
```

`normalizeLabel()` skips normalization for any value that exactly matches an entry in `labelExemptions` (case-insensitive comparison). Add entries via PR with a comment citing the business reason.

## Related

- `src/lib/normalize.ts` — implementation
- `src/lib/text.ts` — `toTitleCase()` helper used internally
- `AGENTS.md` → title-case-rule section
- `UI-QUALITY-CHECKLIST.md` — AI-generated content checklist item
- `DONE.md` — normalize boundary is part of the UI ship definition of done
