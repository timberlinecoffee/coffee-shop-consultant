# UI Quality Checklist

Required before any UI ship issue is marked done. QA Lead signs off after all boxes pass.

## Functional

- [ ] **Button/control is clickable** — Playwright `expect(locator).toBeEnabled()` passes; clicking the control produces the expected state change (not a no-op).
- [ ] **Mobile viewport renders without overflow** — tested at 375 px width; no horizontal scroll, no clipped content.

## Copy & Voice

- [ ] **Title Case on all labels** — every non-sentence label (button text, heading, column header, tab name, field label, status badge) passes through `toTitleCase()` in `src/lib/text.ts` before render. Seed and fixture values are Title Case at rest.
- [ ] **No emoji in body copy** — subject lines are exempt per [TIM-306](/TIM/issues/TIM-306); body paragraphs and UI labels are not.
- [ ] **Voice rules** — no instances of: *leverage*, *synergy*, *passionate*, *curated*, *quality* used as a filler adjective (e.g. "quality experience"). Run a grep before shipping:
  ```bash
  grep -rn --include="*.tsx" --include="*.ts" \
    -E "(leverage|synergy|passionate|curated|quality experience)" src/
  ```

## Performance & Accessibility

- [ ] **Lighthouse performance ≥ 90** — run against the preview URL; paste the score in the issue comment.
- [ ] **Lighthouse accessibility ≥ 90** — same run; paste score.

## AI-Generated Content

- [ ] **Normalize boundary honored** — any AI-generated content that flows through a server action, seed script, or Shopify/Klaviyo/Canva push path passes through `src/lib/normalize.ts` before persistence. See `AI-CONTENT-NORMALIZATION.md`.

## Sign-off

QA Lead leaves a comment on the issue: `QA APPROVED — checklist passed` before the Product Developer sets `status=done`.

## Related

- `DONE.md` — full definition of done
- `AI-CONTENT-NORMALIZATION.md` — normalize boundary rules
- `scripts/done-gate.sh` — automated enforcement
- `AGENTS.md` → title-case-rule section
