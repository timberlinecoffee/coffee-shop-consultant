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
// Style alignment (TIM-1580): each recipe now carries `promptSlots`, the canonical
// text-to-image recipe published by the UX/UI Designer in TIM-1579 (illustration
// style guide §5, encoded in prompt-recipe.ts). resolvePrompt() builds the prompt
// from that master template + negative prompts. The legacy STYLE_SUFFIX path is
// retained only as a fallback for ad-hoc inline prompts with no slots.

import { buildPrompt, NEGATIVE_PROMPT, type PromptSlots } from "./prompt-recipe.ts";

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
  /** Canonical TIM-1579 §5 prompt slots. When present, resolvePrompt() uses these. */
  promptSlots?: PromptSlots;
  /** True once the canonical TIM-1579 recipe text has been wired in. */
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

/** The full prompt sent to the image API. Prefers the canonical TIM-1579 recipe
 *  (promptSlots) and appends the §5.5 negative prompts; falls back to the legacy
 *  subject + STYLE_SUFFIX for ad-hoc inline prompts that carry no slots. */
export function resolvePrompt(
  recipe: Pick<IllustrationRecipe, "subject"> & Partial<Pick<IllustrationRecipe, "promptSlots">>
): string {
  if (recipe.promptSlots) {
    return `${buildPrompt(recipe.promptSlots)}. Avoid: ${NEGATIVE_PROMPT}.`;
  }
  return `${recipe.subject.trim()} ${STYLE_SUFFIX}`.replace(/\s+/g, " ").trim();
}

/**
 * Seed recipes. Each entry's `promptSlots` is the canonical TIM-1579 §5 recipe
 * (subject from the §5.3 library, variant/orientation/detail/ratio per the §4
 * use-case catalog). `subject` is kept as a human-readable summary; the prompt
 * actually sent is built from promptSlots. recipeConfirmed:true now that TIM-1579
 * is published (done).
 */
export const RECIPES: IllustrationRecipe[] = [
  {
    id: "hero-your-coffee-shop",
    slot: "hero",
    title: "Hero — Your Coffee Shop",
    size: "1536x1024",
    quality: "high",
    subject: "Coffee shop interior across the counter — espresso machine, pour-over, pendant lamp, window with plants, chalkboard.",
    alt: "Line-art illustration of a coffee shop interior viewed from across the counter",
    promptSlots: {
      subject: "hero-interior",
      orientation: "landscape panoramic",
      strokeWeight: "1.5px",
      variant: "dark",
      detail: "medium narrative",
      aspectRatio: "3:2 landscape",
    },
    recipeConfirmed: true,
  },
  {
    id: "recipe-flat-white",
    slot: "recipe-card",
    title: "Recipe Card — Flat White",
    size: "1024x1536",
    quality: "medium",
    subject: "Flat white in a ceramic cup on a saucer with rosetta latte art, top-down slightly angled.",
    alt: "Line-art illustration of a flat white in a ceramic cup with latte art",
    promptSlots: {
      subject: "flat-white",
      orientation: "top-down overhead",
      strokeWeight: "1.25px",
      variant: "light",
      detail: "high detailed",
      aspectRatio: "3:4 portrait",
    },
    recipeConfirmed: true,
  },
  {
    id: "empty-state-no-data",
    slot: "empty-state",
    title: "Empty State — No Data",
    size: "1024x1024",
    quality: "low",
    subject: "A single sheet of paper with a folded corner, centered, minimal.",
    alt: "Line-art illustration of a sheet of paper with a folded corner",
    promptSlots: {
      subject: "empty-no-data",
      orientation: "centered",
      strokeWeight: "1px",
      variant: "muted",
      detail: "minimal iconographic",
      aspectRatio: "1:1 square",
    },
    recipeConfirmed: true,
  },
];

export function getRecipe(id: string): IllustrationRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
