## Shipped — Skip removed; per-field action unified as Improve with AI

**Commits on `main`:**
- [`f5b77bd`](https://github.com/timberlinecoffee/coffee-shop-consultant/commit/f5b77bd) — TIM-2859: Concept page — remove Skip toggle; unify per-field action as Improve with AI
- [`70fae8b`](https://github.com/timberlinecoffee/coffee-shop-consultant/commit/70fae8b) — verify(TIM-2859): live prod proves zero Skip buttons + six Improve with AI

**Deploy:** prod `coffee-shop-consultant-n8llzsimq` READY ~1m on https://groundwork.cafe (vercel inspect confirms `Cloning ... Commit: f5b77bd`).

**Scope.** Concept workspace page only.
- Per-card `In doc / Skip` toggle deleted from the editor.
- Per-field action is now `Improve with AI` on every concept card except `target_customer` (the PersonaSection multi-record editor has its own authoring flow; out of single-field scope). That's 6 cards: Shop identity, Vision, Differentiation, Brand voice, Location, Offering — same component, same label string, same hover/focus-revealed teal-tint outlined chip placement.
- Empty fields are implicitly skipped — content presence is the single inclusion signal at every read site (concept brief inline, concept print, business-plan ConceptSection, business-plan AppendixSection, progress counter, completion gate). No schema change — the `included` boolean on `ConceptDocumentV2` is preserved on the wire and ignored at read time.

**Style-guide section consulted:** TIM-1537 → Cards / per-field action affordance. **Existing component used as visual reference:** the previously-shown `Improve with AI` button on the multiline concept cards (vision / differentiation / brand_voice) — same teal-tint outlined chip, hover/focus-revealed, top-right of card. Now extended to `shop_identity` so every non-Persona card uses it identically.

**Verification.** Live Playwright smoke `scripts/tim2859-concept-skip-removal-verify.mjs` against `groundwork.cafe` with the `trent@simpler.coffee` fixture (service-role magiclink → `@supabase/ssr` cookie session, same pattern as TIM-2858):

```
[4/5] loading /workspace/concept...
  status 200  url=https://groundwork.cafe/workspace/concept
  Skip/In doc buttons on page: 0
  ✓ Assertion 1 PASS — zero Skip/In doc buttons.
  Improve with AI buttons on page: 6
  ✓ Assertion 2 PASS — six Improve with AI buttons (one per non-Persona card).
```

**Screenshots:**
- [`scripts/shots/tim2859-concept-default.png`](https://github.com/timberlinecoffee/coffee-shop-consultant/blob/main/scripts/shots/tim2859-concept-default.png) — full page (all cards + competitors), zero Skip buttons anywhere
- [`scripts/shots/tim2859-concept-hover.png`](https://github.com/timberlinecoffee/coffee-shop-consultant/blob/main/scripts/shots/tim2859-concept-hover.png) — Shop identity card with `Improve with AI` revealed on hover

**Standing Engineering Rules.** Rule 5 (no raw stack traces / sanitized errors) is the only one even adjacent to this change — UI-only edit on a route that already does server-side validation + plan-tier checks. No new endpoints, no new tables, no new paid-API calls.

Board `request_confirmation` card to follow (UI consistency is board-verified per canon).
