// TIM-1585: Lane A curated static illustration assets.
//
// Lane A is the deterministic SVG line-art path from TIM-1580: rendered offline by
// scripts/render-svg-illustration.mjs, guaranteed on-palette (TIM-1537 brand tokens
// via TIM-1579 §2.2 color variants), $0/image, no external key, no runtime
// generation. The rendered files are committed under public/images/illustrations/
// and served statically.
//
// These assets are the Lane A counterpart to manifest.generated.json (which the
// OpenAI/gpt-image "Lane B" pipeline writes). getIllustration() prefers a generated
// Lane B asset when one exists and falls back to the Lane A asset here — so Lane A
// ships today and a future reviewed Lane B render can supersede it per recipe.
//
// We point at the committed 2x PNG raster (not the SVG) so next/image serves it
// without `dangerouslyAllowSVG`. The SVG remains the source of truth on disk.

import type { GeneratedAsset } from "./manifest.ts";

/** Marker so callers / debugging can tell a Lane A asset from a Lane B render. */
export const LANE_A_MODEL = "deterministic-svg (TIM-1580 Lane A)";

/** recipe id -> committed Lane A static asset. Sizes are the PNG's intrinsic 2x
 *  pixel dimensions so next/image gets the right aspect ratio. costUsd is 0. */
export const LANE_A_ASSETS: Record<string, GeneratedAsset> = {
  "recipe-flat-white": {
    path: "/images/illustrations/recipe-card/flat-white.png",
    model: LANE_A_MODEL,
    size: "1200x1600",
    quality: "vector",
    generatedAt: "2026-06-01T00:00:00.000Z",
    costUsd: 0,
  },
  "recipe-espresso": {
    path: "/images/illustrations/recipe-card/espresso.png",
    model: LANE_A_MODEL,
    size: "1280x1280",
    quality: "vector",
    generatedAt: "2026-06-01T00:00:00.000Z",
    costUsd: 0,
  },
  "empty-state-no-data": {
    path: "/images/illustrations/empty-state/empty-no-data.png",
    model: LANE_A_MODEL,
    size: "960x960",
    quality: "vector",
    generatedAt: "2026-06-01T00:00:00.000Z",
    costUsd: 0,
  },
};

export function getLaneAAsset(recipeId: string): GeneratedAsset | null {
  return LANE_A_ASSETS[recipeId] ?? null;
}
