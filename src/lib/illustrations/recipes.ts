// TIM-1578: Illustration generation recipes for Groundwork.
//
// A "recipe" is a reusable, parameterized prompt for one illustration slot. The
// generation pipeline (scripts/generate-illustration.mjs) reads a recipe, renders
// it through OpenAI's image API, optimizes the output, and writes a static asset.
//
// Integration model: CURATED STATIC ASSETS. Illustrations are generated once by
// this internal tool, optimized, committed under public/images/illustrations/,
// and served as static files. They are NOT generated at runtime per shop. See
// docs/illustrations/PIPELINE.md for the full pathway + integration rationale.
//
// Style alignment: every prompt is suffixed with STYLE_SUFFIX, derived from the
// canonical Groundwork UX/UI Style Guide (TIM-1537). The per-recipe SUBJECT text
// below is provisional and will be replaced by the canonical prompt recipes from
// the UX illustration style guide (TIM-1577) once published.

export type IllustrationSlot = "hero" | "recipe-card" | "empty-state" | "lesson";

/** Supported output resolutions for the OpenAI image API. */
export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

/** OpenAI image-quality tiers. */
export type ImageQuality = "low" | "medium" | "high";

export interface IllustrationRecipe {
  /** Stable kebab-case id — also the output filename stem. */
  id: string;
  slot: IllustrationSlot;
  /** Human label for the admin tool / manifest. */
  title: string;
  size: ImageSize;
  quality: ImageQuality;
  /** The subject of the illustration. Style is applied separately via STYLE_SUFFIX. */
  subject: string;
  /** Voice-mandate-compliant alt text for the rendered <img>. */
  alt: string;
  /** True once the canonical TIM-1577 recipe text has been wired in. */
  recipeConfirmed: boolean;
}

/** Current recommended model. gpt-image-1 is deprecating 2026-10-23; 1.5 is the
 *  current flagship-class model, costs less per image, and renders higher quality. */
export const OPENAI_IMAGE_MODEL = "gpt-image-1.5";

/**
 * Shared brand-style instruction appended to every recipe prompt. Encodes the
 * Groundwork palette and "warm precision" tone from TIM-1537. Keep colors as
 * explicit hex so the model anchors to the brand rather than guessing.
 */
export const STYLE_SUFFIX = [
  "Flat vector illustration, clean and purposeful, warm and precise.",
  "Limited palette anchored on deep teal (#155e63) and soft sage (#76b39d),",
  "on a warm off-white background (#faf9f7). Subtle, no harsh shadows,",
  "no decorative gradients, no text or lettering in the image,",
  "no photorealism, no 3D render. Generous negative space so UI text can sit",
  "beside it. Editorial, owner-to-owner, friendly but not cartoonish.",
].join(" ");

/**
 * OpenAI image-output token counts per (size, quality). These drive the cost
 * estimate without a network call. Source: OpenAI image pricing (2026).
 */
const OUTPUT_TOKENS: Record<ImageSize, Record<ImageQuality, number>> = {
  "1024x1024": { low: 272, medium: 1056, high: 4160 },
  "1536x1024": { low: 408, medium: 1584, high: 6240 },
  "1024x1536": { low: 408, medium: 1584, high: 6240 },
};

/** gpt-image-1.5 image-output price in USD per 1M tokens. */
const OUTPUT_USD_PER_MTOK = 32;

/** Estimated USD cost to render one recipe at its configured size/quality. */
export function estimateCostUsd(recipe: Pick<IllustrationRecipe, "size" | "quality">): number {
  const tokens = OUTPUT_TOKENS[recipe.size][recipe.quality];
  return (tokens * OUTPUT_USD_PER_MTOK) / 1_000_000;
}

/** The full prompt sent to the image API: subject + shared brand style. */
export function resolvePrompt(recipe: Pick<IllustrationRecipe, "subject">): string {
  return `${recipe.subject.trim()} ${STYLE_SUFFIX}`.replace(/\s+/g, " ").trim();
}

/**
 * Seed recipes. The hero and flat-white entries use prompts authored from the
 * TIM-1537 style guide as a working proof; they are marked recipeConfirmed:false
 * until reconciled with the canonical TIM-1577 prompt library.
 */
export const RECIPES: IllustrationRecipe[] = [
  {
    id: "hero-your-coffee-shop",
    slot: "hero",
    title: "Hero — Your Coffee Shop",
    size: "1536x1024",
    quality: "high",
    subject:
      "An inviting independent specialty coffee shop interior at morning light: a small counter with an espresso machine, a few stools, a pour-over station, a window letting warm light cross the floor, one plant. Calm, owner-built, lived-in.",
    alt: "Illustration of a warm, light-filled independent coffee shop interior in the morning",
    recipeConfirmed: false,
  },
  {
    id: "recipe-flat-white",
    slot: "recipe-card",
    title: "Recipe Card — Flat White",
    size: "1024x1024",
    quality: "medium",
    subject:
      "A flat white coffee in a small ceramic cup on a saucer, viewed slightly from above, with simple latte-art and a faint wisp of steam, a tamped portafilter resting beside it.",
    alt: "Illustration of a flat white in a ceramic cup beside a portafilter",
    recipeConfirmed: false,
  },
  {
    id: "empty-state-getting-started",
    slot: "empty-state",
    title: "Empty State — Getting Started",
    size: "1024x1024",
    quality: "medium",
    subject:
      "A tidy empty workbench with an open notebook, a pencil, and a single coffee cup, suggesting a fresh start and room to plan.",
    alt: "Illustration of an open notebook and coffee cup on a clean workbench",
    recipeConfirmed: false,
  },
];

export function getRecipe(id: string): IllustrationRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
