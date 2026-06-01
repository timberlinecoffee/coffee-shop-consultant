// TIM-1578: Resolver between illustration recipes and their rendered static assets.
//
// The generation pipeline writes manifest.generated.json after rendering an asset.
// UI code calls getIllustration(recipeId) to get the public path (or null if the
// asset has not been generated yet, so the caller can fall back gracefully).

import generated from "./manifest.generated.json";
import { getRecipe, type IllustrationRecipe } from "./recipes";

export interface GeneratedAsset {
  /** Public path, e.g. /images/illustrations/hero/hero-your-coffee-shop.webp */
  path: string;
  model: string;
  size: string;
  quality: string;
  /** ISO timestamp string written by the generator. */
  generatedAt: string;
  costUsd: number;
}

const ASSETS: Record<string, GeneratedAsset> = (generated as { assets?: Record<string, GeneratedAsset> }).assets ?? {};

export interface ResolvedIllustration {
  recipe: IllustrationRecipe;
  asset: GeneratedAsset | null;
}

/**
 * Resolve a recipe id to its recipe + rendered asset (if any). Returns null only
 * when the recipe id is unknown; a known-but-ungenerated recipe returns asset:null
 * so the UI slot can render a fallback instead of a broken image.
 */
export function getIllustration(recipeId: string): ResolvedIllustration | null {
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;
  return { recipe, asset: ASSETS[recipeId] ?? null };
}

export function getAsset(recipeId: string): GeneratedAsset | null {
  return ASSETS[recipeId] ?? null;
}
