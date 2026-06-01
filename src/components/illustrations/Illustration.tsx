// TIM-1578: Groundwork illustration slot component.
//
// Plug-in point for on-brand illustrations. Drop <Illustration recipeId="..." />
// into a hero, recipe card, or empty state. It resolves the recipe to its rendered
// static asset via the manifest. If the asset has not been generated yet, it renders
// `fallback` (default: nothing) so a missing illustration never breaks a layout.
//
// Slots wired so far:
//   hero        -> <Illustration recipeId="hero-your-coffee-shop" priority />
//   recipe-card -> <Illustration recipeId="recipe-flat-white" />
//   empty-state -> <Illustration recipeId="empty-state-getting-started" />

import Image from "next/image";
import type { ReactNode } from "react";
import { getIllustration } from "@/lib/illustrations/manifest";

function dims(size: string): { width: number; height: number } {
  const [w, h] = size.split("x").map((n) => Number(n));
  return { width: w || 1024, height: h || 1024 };
}

export interface IllustrationProps {
  recipeId: string;
  /** Extra classes for the rendered image. */
  className?: string;
  /** Rendered when no asset has been generated for this recipe yet. */
  fallback?: ReactNode;
  /** Pass-through to next/image for above-the-fold hero use. */
  priority?: boolean;
  /** Override the recipe's alt text if the surrounding copy needs it. */
  alt?: string;
}

export function Illustration({ recipeId, className, fallback = null, priority, alt }: IllustrationProps) {
  const resolved = getIllustration(recipeId);
  if (!resolved || !resolved.asset) return <>{fallback}</>;

  const { recipe, asset } = resolved;
  const { width, height } = dims(asset.size);

  return (
    <Image
      src={asset.path}
      alt={alt ?? recipe.alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}

export default Illustration;
