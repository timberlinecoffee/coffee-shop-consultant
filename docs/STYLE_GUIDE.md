# Groundwork Style Guide

## Title Case Rule (Binding — TIM-905, extended in TIM-1002)

Headers and bullet-point labels that are **not full sentences** use Title Case.
Full-sentence content uses Sentence case.

**Scope extended in TIM-1002** to also cover AI-generated and seed-data content,
not just static UI strings:

- Static labels, headers, buttons, tab names, nav items, field labels.
- **AI-generated content** that lands in label-shaped slots: equipment names,
  ingredient names, role names, JD titles, drink names, milestone names,
  scorecard criterion names, persona names, suggestion bullet headers.
- **Seed-data content** in any `standard_*_reference` table, any JSON fixture,
  any AI prompt that produces label-shaped output. Authored values are stored
  in Title Case at rest — no "fix-on-read" reliance.

Sentence-form copy stays in sentence case (descriptions, body paragraphs,
microcopy that reads as a sentence).

### How to enforce

Every agent that writes seed data, designs an AI prompt, or builds a UI label
is responsible for verifying Title Case before merge. The helper lives at
[`src/lib/text.ts`](../src/lib/text.ts) — `toTitleCase()` and
`titleCaseFields()`. Apply at the boundary that is hardest to bypass:

1. **Seed-data authoring** — TypeScript constants and SQL inserts must be Title
   Case at rest.
2. **AI-prompt design** — add "Return values in Title Case (every word
   capitalized except articles/short prepositions/conjunctions)" plus a
   few-shot example to the prompt, AND pipe the parsed output through
   `toTitleCase()` for label-shaped fields.
3. **Display formatter** — last resort. Use only when neither (1) nor (2) is
   possible (e.g. third-party data import).

If you add a new AI endpoint that generates label-shaped content, you MUST
either pipe its output through `toTitleCase()` at the boundary or pin a
test that asserts Title Case on the response.

### Reference Table

| Surface type | Case | Example |
|---|---|---|
| Page title (h1) | Title Case | "Your Coffee Shop Concept" |
| Section header / label (h2, h3) | Title Case | "Target Customer Personas" |
| Card title / label | Title Case | "Lease Details" |
| Bullet / list item — noun phrase or label | Title Case | "• Morning Commuters" |
| Button label | Title Case | "Save and Continue" |
| Navigation item | Title Case | "Operations Plan" |
| Form field label | Title Case | "New Password" |
| Hyphenated label | Title Case (both parts) | "White-Glove Onboarding" |
| Bullet / list item — full sentence | Sentence case | "• We open at 5:45 a.m. on weekdays." |
| Paragraph body copy | Sentence case | "Visit three local shops..." |
| Instructional prompt (question, guidance) | Sentence case | "What problem does your shop solve?" |
| Inline tooltip / help text | Sentence case | "Use this field to..." |
| Button that is a full instructional phrase | Sentence case acceptable | "I'm ready to answer now" |

### Title Case Definition

Capitalize all major words. Lowercase:
- Articles: a, an, the
- Prepositions ≤ 3 letters: to, at, in, of, on, for, by
- Coordinating conjunctions ≤ 3 letters: and, but, or, nor, yet, so

...unless the word is first or last in the label. AP style.

### Examples

| Wrong | Correct |
|---|---|
| "Account settings" | "Account Settings" |
| "Sign out" | "Sign Out" |
| "Back to dashboard" | "Back to Dashboard" |
| "Quick links" | "Quick Links" |
| "Frequently asked questions" | "Frequently Asked Questions" |
| "Email support" | "Email Support" |
| "White-glove onboarding" | "White-Glove Onboarding" |

## Voice Mandate

- No em dashes in UI copy
- No AI vocabulary: leverage, unlock, embark, elevate, delve
- No three-word taglines
- Lead with benefits, not features
- Write the way a former shop owner would talk to a future shop owner

See also: [TIM-538] for the full no-AI-jargon rule set.

## Emoji Policy

No emojis in UI strings, buttons, labels, or copy. See TIM-196, TIM-306, TIM-809.
