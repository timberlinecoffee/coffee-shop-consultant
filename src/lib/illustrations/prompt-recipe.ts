// TIM-1580: Canonical illustration prompt recipe.
//
// This module is a faithful, code-encoded copy of the text-to-image prompt recipe
// defined by the UX/UI Designer in TIM-1579 ("Groundwork Illustration Style Guide",
// document key `illustration-guide`, Section 5). The generation pipeline consumes
// THIS module so output stays on-style. If TIM-1579 Section 5 changes, update this
// file to match — TIM-1579 is the source of truth, this is its executable mirror.
//
// Master template (TIM-1579 §5.1):
//   Minimal continuous-line illustration, {SUBJECT}, {ORIENTATION} composition,
//   line-art only, uniform {STROKE_WEIGHT} stroke, {STROKE_COLOR} lines on
//   {BACKGROUND_COLOR} background, clean precise lines with organic curves, no fill,
//   no shading, no gradient, no texture, no watermark, no color other than the
//   stroke and background, architectural line drawing aesthetic, specialty coffee
//   industry, white space dominant, {DETAIL_LEVEL} level of detail,
//   {ASPECT_RATIO} format

export type Orientation =
  | "centered"
  | "landscape panoramic"
  | "portrait close-up"
  | "top-down overhead";

export type StrokeWeight = "1.5px" | "1.25px" | "1px" | "0.75px";

/** Brand-token color pairs (TIM-1579 §2.2). Stroke + background are always paired. */
export type ColorVariant = "dark" | "light" | "muted" | "tonal-dark";

export type DetailLevel = "minimal iconographic" | "medium narrative" | "high detailed";

export type AspectRatio =
  | "3:2 landscape"
  | "1:1 square"
  | "3:4 portrait"
  | "10:1 horizontal strip";

interface ColorPair {
  /** Prompt-facing stroke phrase, e.g. "off-white (#faf9f7)". */
  strokePrompt: string;
  /** Prompt-facing background phrase. */
  backgroundPrompt: string;
  /** Raw hex for SVG rendering / governance checks. */
  strokeHex: string;
  backgroundHex: string;
}

/** TIM-1579 §2.2 — illustrations use ONLY these Groundwork brand tokens. */
export const COLOR_VARIANTS: Record<ColorVariant, ColorPair> = {
  dark: {
    strokePrompt: "off-white (#faf9f7)",
    backgroundPrompt: "dark teal (#155e63)",
    strokeHex: "#faf9f7",
    backgroundHex: "#155e63",
  },
  light: {
    strokePrompt: "dark teal (#155e63)",
    backgroundPrompt: "off-white (#faf9f7)",
    strokeHex: "#155e63",
    backgroundHex: "#faf9f7",
  },
  muted: {
    strokePrompt: "sage green (#76b39d)",
    backgroundPrompt: "off-white (#faf9f7)",
    strokeHex: "#76b39d",
    backgroundHex: "#faf9f7",
  },
  "tonal-dark": {
    strokePrompt: "dark teal (#0e4448)",
    backgroundPrompt: "off-white (#faf9f7)",
    strokeHex: "#0e4448",
    backgroundHex: "#faf9f7",
  },
};

/** TIM-1579 §5.3 — pre-validated subject strings. Keyed by stable slug. */
export const SUBJECT_LIBRARY: Record<string, string> = {
  "hero-interior":
    "a coffee shop interior viewed from across the counter, showing an espresso machine, pour-over setup, pendant lamp, window with plants, and a chalkboard menu outline in the background",
  "flat-white":
    "a flat white in a ceramic cup on a saucer, with latte art rosettta pattern visible, top-down perspective slightly angled",
  "espresso-shot":
    "a demitasse espresso cup on a saucer with thick crema circle, side-on perspective",
  "cold-brew":
    "a tall glass of cold brew with ice cubes suggested by three diagonal parallel lines, side-on perspective",
  cappuccino:
    "a wide bowl cappuccino cup with foam dome suggested by an arc, side-on perspective",
  croissant:
    "a croissant from above, showing layered crescent shape with parallel lamination lines",
  "empty-no-data":
    "a single sheet of paper with a fold at the corner, centered, minimal",
  "empty-module-done":
    "a small coffee bag with a checkmark arc, centered, minimal",
  "section-divider":
    "a horizontal row of three small coffee-related marks: a coffee ring, a coffee plant sprig, an espresso drip, evenly spaced on a single horizontal baseline",
  // TIM-1697 — coffee-shop model types (onboarding selection). One per archetype.
  "model-full-cafe":
    "a place setting with a dinner plate flanked by a fork and a knife, centered, signalling a sit-down cafe that serves food",
  "model-espresso-bar":
    "a counter espresso machine with a cup-warmer rail, pressure gauge, group head, and a cup beneath the spout, centered",
  "model-roastery-cafe":
    "a drum coffee roaster with a bean hopper on top, a round drum-face door, control knobs, and two coffee beans, centered",
  "model-drive-thru":
    "a small kiosk with a striped awning over a service window, a to-go cup on the sill, and a drive-lane arrow beneath",
  "model-mobile-cart":
    "a wheeled mobile coffee cart under a scalloped canopy with a serving window, side-on",
};

/** TIM-1579 §5.5 — appended to every generation. */
export const NEGATIVE_PROMPT = [
  "no color fills",
  "no watercolor",
  "no cartoon",
  "no emoji",
  "no clipart",
  "no 3D rendering",
  "no photorealism",
  "no shadows",
  "no hatching",
  "no cross-hatching",
  "no people faces",
  "no text",
  "no typography inside illustration",
  "no multiple stroke weights",
  "no gradients",
  "no blur",
  "no glow effects",
  "no drop shadows",
].join(", ");

export interface PromptSlots {
  /** Either a key into SUBJECT_LIBRARY or a literal subject string. */
  subject: string;
  orientation: Orientation;
  strokeWeight: StrokeWeight;
  variant: ColorVariant;
  detail: DetailLevel;
  aspectRatio: AspectRatio;
}

/** Resolve a subject slug to its library string, or pass through a literal. */
export function resolveSubject(subject: string): string {
  return SUBJECT_LIBRARY[subject] ?? subject;
}

/** Build the positive prompt from the TIM-1579 §5.1 master template. */
export function buildPrompt(slots: PromptSlots): string {
  const c = COLOR_VARIANTS[slots.variant];
  return [
    "Minimal continuous-line illustration",
    resolveSubject(slots.subject),
    `${slots.orientation} composition`,
    "line-art only",
    `uniform ${slots.strokeWeight} stroke`,
    `${c.strokePrompt} lines on ${c.backgroundPrompt} background`,
    "clean precise lines with organic curves",
    "no fill",
    "no shading",
    "no gradient",
    "no texture",
    "no watermark",
    "no color other than the stroke and background",
    "architectural line drawing aesthetic",
    "specialty coffee industry",
    "white space dominant",
    `${slots.detail} level of detail`,
    `${slots.aspectRatio} format`,
  ].join(", ");
}

/** Positive + negative prompt, ready for the image API. */
export function buildFullPrompt(slots: PromptSlots): { prompt: string; negativePrompt: string } {
  return { prompt: buildPrompt(slots), negativePrompt: NEGATIVE_PROMPT };
}
