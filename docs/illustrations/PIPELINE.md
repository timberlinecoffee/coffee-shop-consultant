# Groundwork Illustration Pipeline (TIM-1578)

How on-brand illustrations get generated, optimized, committed, and rendered in
Groundwork. Owner: CTO. Style source of truth: TIM-1537 (Groundwork UX/UI Style
Guide). Prompt library source: TIM-1577 (illustration style guide — in progress).

---

## 1. Pathway recommendation

**Use the OpenAI Images API. Model: `gpt-image-1.5` (NOT `gpt-image-1`).**

- The ticket asked to evaluate `gpt-image-1`. It works, but it is **deprecating
  2026-10-23**. `gpt-image-1.5` is the current flagship-class image model, renders
  higher quality, and is **cheaper per image** (image output billed at $32 / 1M
  tokens vs. $40 for `gpt-image-1`). Picking the non-deprecated, cheaper, better
  model is the materially-better choice, so it is the default here.
- `gpt-image-1-mini` ($8 / 1M output tokens) is a cheaper fallback for high-volume,
  lower-fidelity assets (e.g. small lesson icons). `gpt-image-2` exists as the top
  tier but is not needed for flat brand illustration.

### API access — important billing note

A **ChatGPT Plus / Pro subscription does NOT grant API access.** Image generation
via the API requires a **separate OpenAI platform API key** (`platform.openai.com`)
with its **own usage-based billing**, independent of any ChatGPT membership. The
board's ChatGPT membership cannot be used here.

### Per-image cost (gpt-image-1.5, output @ $32 / 1M tokens)

| Use | Size | Quality | ~Cost / image |
|---|---|---|---|
| Recipe card, empty state, lesson | 1024×1024 | low | ~$0.009 |
| Recipe card, empty state | 1024×1024 | medium | ~$0.034 |
| Detailed square | 1024×1024 | high | ~$0.133 |
| **Hero** (landscape) | 1536×1024 | high | ~$0.200 |

A full first curated batch (hero + a handful of recipe cards + empty states) is
**well under $5 one-time**. Cost is estimable offline — run any generation with
`--dry-run` to see the projected spend before calling the API.

### Resolution / quality tiers (recommended defaults)

- **Hero**: `1536x1024`, `high`.
- **Recipe cards / empty states**: `1024x1024`, `medium`.
- **Lesson icons / dense sets**: `1024x1024`, `low` (or `gpt-image-1-mini`).

---

## 2. Integration model decision

**Curated static assets (generate once, commit, serve statically). NOT runtime
per-shop generation.**

Rationale, especially for the hero "your coffee shop":

- **Cost**: runtime generation is ~$0.13–0.20 per hero, per shop, every time —
  unbounded spend that scales with traffic, vs. a one-time batch cost.
- **Latency**: image generation takes ~10–30s. A hero that blocks first paint by
  that long is unacceptable.
- **Quality control**: a static asset is reviewed before it ships. A runtime asset
  ships whatever the model returns — off-brand or unsafe output reaches the user
  with no human in the loop.

"Feels like your shop" is achieved without true per-shop generation by curating a
small set of hero variants keyed to a choice the user already makes (shop
archetype / style in onboarding) and selecting among them at render time. This
matches the existing curated-catalog pattern already in the codebase
(`src/lib/photography.ts`).

> **Phase 2 (optional, not now):** opt-in runtime personalization behind a feature
> flag, with content moderation and Supabase-cached results so each prompt renders
> at most once. Only worth it if curated variants prove insufficient.

---

## 3. The pipeline

```
recipe (src/lib/illustrations/recipes.ts)
  → resolvePrompt() = subject + brand STYLE_SUFFIX (TIM-1537 tokens)
  → scripts/generate-illustration.mjs → OpenAI Images API (gpt-image-1.5)
  → sharp → webp → public/images/illustrations/<slot>/<id>.webp
  → manifest.generated.json (recipe id → asset path + metadata)
  → <Illustration recipeId="..." /> renders it, with graceful fallback
```

### Files

- `src/lib/illustrations/recipes.ts` — typed recipe registry, brand `STYLE_SUFFIX`,
  `resolvePrompt()`, `estimateCostUsd()`, recommended model.
- `scripts/generate-illustration.mjs` — the admin/CLI generator.
- `src/lib/illustrations/manifest.generated.json` — recipe id → rendered asset
  (written by the generator; do not hand-edit).
- `src/lib/illustrations/manifest.ts` — `getIllustration(id)` resolver for the UI.
- `src/components/illustrations/Illustration.tsx` — the UI plug-in component.

### Running it

The script imports TypeScript, so run it with type stripping (Node ≥ 22):

```bash
# Preview prompt + cost, no API key needed, nothing written:
node --experimental-strip-types scripts/generate-illustration.mjs --all --dry-run

# Generate one recipe (needs OPENAI_API_KEY):
OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/generate-illustration.mjs --recipe hero-your-coffee-shop

# Generate every recipe:
OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/generate-illustration.mjs --all

# Ad-hoc prompt:
node --experimental-strip-types scripts/generate-illustration.mjs \
  --prompt "A bag of whole beans being weighed on a scale" \
  --id recipe-dose --slot recipe-card --size 1024x1024 --quality medium
```

After generating, commit the new `public/images/illustrations/**` files and the
updated `manifest.generated.json` together.

### UI plug-in points

`<Illustration>` renders the rendered asset for a recipe, or its `fallback` (default
nothing) when the asset has not been generated yet — so a slot is never broken by a
missing image.

```tsx
import { Illustration } from "@/components/illustrations/Illustration";

// Hero slot:
<Illustration recipeId="hero-your-coffee-shop" priority className="w-full rounded-xl" />

// Recipe card slot:
<Illustration recipeId="recipe-flat-white" className="w-full rounded-lg" />

// Empty state slot:
<Illustration recipeId="empty-state-getting-started" className="mx-auto w-48" />
```

Mount targets (wire once assets exist): hero on the dashboard / workspace landing,
recipe-card in the menu-pricing recipe cards, empty-state in workspace empty states
(see `src/lib/photography.ts` `empty-state-*` placements for current usage).

---

## 4. Secrets / env wiring

- Env var: **`OPENAI_API_KEY`** (platform key, NOT a ChatGPT login).
- Local: export it in the shell, or add it to `.env.local` (already git-ignored via
  `.env*`). Never commit it.
- Production (Vercel): add `OPENAI_API_KEY` as an encrypted Environment Variable.
  Only needed if/when Phase 2 runtime generation is built — the curated pipeline
  runs offline at build/author time, so production does not need the key today.
- The generator reads `process.env.OPENAI_API_KEY` and never logs it.

---

## 5. Status

- [x] Pathway evaluated + recommended (`gpt-image-1.5`, curated static).
- [x] Pipeline built: recipes, generator, manifest, `<Illustration>` component.
- [x] Plumbing proven via `--dry-run` (prompt assembly + cost, no key).
- [ ] First batch rendered (hero + flat white) — **needs `OPENAI_API_KEY`** (CEO to
      provision key + approve billing) and the canonical prompt recipes from
      TIM-1577.
