#!/usr/bin/env node
// TIM-1580: Deterministic SVG illustration renderer (no image model required).
//
// For the in-app, content-illustration path (recipe cards, empty states, dividers)
// the Groundwork style is monochrome single-stroke line-art on a brand-token
// background (TIM-1579 §2). That style is *deterministically renderable as SVG* —
// no OpenAI key, no per-image cost, guaranteed on-palette, infinitely scalable, and
// it satisfies the style guide's own "Do use SVG for app-interior illustrations"
// rule (TIM-1579 §6). This script is the proof-of-concept for that path and emits
// an attachable PNG sample so the recommendation can be evaluated visually today.
//
// The OpenAI gpt-image path (scripts/generate-illustration.mjs) remains the lever
// for the photographic-density hero marketing raster, and is gated on OPENAI_API_KEY.
//
// Usage:
//   node scripts/render-svg-illustration.mjs --subject flat-white --variant light
//   node scripts/render-svg-illustration.mjs --all     # render the sample set
//
// Outputs SVG + a 2x PNG under public/images/illustrations/<slot>/<id>.{svg,png}.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "images", "illustrations");

// TIM-1579 §2.2 brand-token color variants (stroke + background).
const VARIANTS = {
  dark: { stroke: "#faf9f7", bg: "#155e63" },
  light: { stroke: "#155e63", bg: "#faf9f7" },
  muted: { stroke: "#76b39d", bg: "#faf9f7" },
  "tonal-dark": { stroke: "#0e4448", bg: "#faf9f7" },
};

// Single uniform stroke weight per illustration (TIM-1579 §2.1), no fill (§2.3),
// organic curves with round caps/joins (§2.4). When `transparent` is set the
// background rect is omitted so the line-art sits on whatever surface it lands on
// (TIM-1675) — used for the model-type selection icons, which overlay buttons that
// switch between a white and a teal-tinted background.
function frame(w, h, bg, body, sw, transparent = false) {
  const bgRect = transparent
    ? ""
    : `\n  <rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bgRect}
  <g fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
${body}
  </g>
</svg>`;
}

// Flat white — ceramic cup + saucer, crema ring, rosetta latte art, top-down
// slightly angled. Portrait 3:4 (TIM-1579 §4.2). High detail, ~40%+ negative space.
function flatWhite(stroke) {
  const s = (d) => `    <path stroke="${stroke}" d="${d}"/>`;
  const e = (cx, cy, rx, ry) =>
    `    <ellipse stroke="${stroke}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  return [
    // saucer (shallow ellipse) + concentric inner ring
    e(300, 600, 232, 64),
    e(300, 596, 150, 40),
    // subtle implied shadow — a single curved line beneath the saucer (§4.2)
    s("M 120 648 Q 300 700 480 648"),
    // cup rim (open top, slightly angled) + crema ring inside
    e(300, 372, 150, 92),
    e(300, 372, 116, 70),
    // cup wall: left + right sweeps down to a rounded base
    s("M 152 378 C 150 470 196 540 300 548 C 404 540 450 470 448 378"),
    s("M 222 545 Q 300 568 378 545"),
    // handle on the right
    s("M 446 350 C 520 350 532 446 452 458"),
    s("M 452 372 C 500 376 506 432 452 440"),
    // rosetta latte art (central stem + symmetric leaf pairs) inside the crema
    s("M 300 318 L 300 420"),
    s("M 300 340 C 268 344 252 360 256 384 C 280 378 296 364 300 348"),
    s("M 300 340 C 332 344 348 360 344 384 C 320 378 304 364 300 348"),
    s("M 300 366 C 274 370 262 382 266 402 C 286 396 298 386 300 374"),
    s("M 300 366 C 326 370 338 382 334 402 C 314 396 302 386 300 374"),
    s("M 300 392 C 282 396 274 404 277 418 C 291 414 298 408 300 398"),
    s("M 300 392 C 318 396 326 404 323 418 C 309 414 302 408 300 398"),
  ].join("\n");
}

// Espresso — demitasse + thick crema circle, side-on (TIM-1579 §5.3). Square 1:1.
function espresso(stroke) {
  const s = (d) => `    <path stroke="${stroke}" d="${d}"/>`;
  const e = (cx, cy, rx, ry) =>
    `    <ellipse stroke="${stroke}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  return [
    e(300, 540, 168, 38), // saucer
    e(300, 318, 96, 30), // cup rim
    e(300, 318, 72, 21), // thick crema circle (§4.2 espresso variant)
    s("M 206 322 C 214 430 250 486 300 488 C 350 486 386 430 394 322"), // cup wall
    s("M 392 344 C 452 344 460 410 398 420"), // handle
  ].join("\n");
}

// Empty state — sheet of paper with a folded corner, minimal (TIM-1579 §4.4). Square.
function emptyNoData(stroke) {
  const s = (d) => `    <path stroke="${stroke}" d="${d}"/>`;
  return [
    s("M 210 180 L 210 560 L 470 560 L 470 232 L 418 180 Z"), // page w/ clipped corner
    s("M 418 180 L 418 232 L 470 232"), // fold
  ].join("\n");
}

// ── Model-type selection icons (TIM-1697) ──────────────────────────────────
// One line-art mark per coffee-shop model type from the onboarding "What kind of
// shop are you imagining?" step. Each is composed on a shared 220x200 canvas with a
// transparent background (TIM-1675) and the §2.2 `light` variant (dark-teal stroke)
// so the marks align in the selection buttons and read on both button states.
// Subjects are visually distinct per model type per the board ask on TIM-1576.

// Shared local-shape helpers, matching the existing draw functions' convention of
// emitting one stroked element per call.
const pathFn = (stroke) => (d) => `    <path stroke="${stroke}" d="${d}"/>`;
const ellipseFn = (stroke) => (cx, cy, rx, ry) =>
  `    <ellipse stroke="${stroke}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;

// Full cafe with food — the universal place setting: a plate flanked by a fork
// and knife. Reads as "sit-down food" instantly, distinct from the drinks-only types.
function fullCafe(stroke) {
  const s = pathFn(stroke);
  const e = ellipseFn(stroke);
  return [
    e(110, 100, 40, 40), // plate
    e(110, 100, 28, 28), // inner ring
    s("M 50 50 V 70"), // fork tines
    s("M 56 50 V 70"),
    s("M 62 50 V 70"),
    s("M 49 70 Q 56 77 63 70"), // tine bridge
    s("M 56 77 V 152"), // fork stem
    s("M 164 50 C 157 60 157 86 164 96 V 50 Z"), // knife blade
    s("M 164 96 V 152"), // knife handle
  ].join("\n");
}

// Espresso bar (drinks only) — a counter espresso machine with group head + cup.
function espressoBar(stroke) {
  const s = pathFn(stroke);
  const e = ellipseFn(stroke);
  return [
    s("M 64 56 H 156 Q 164 56 164 64 V 104 Q 164 112 156 112 H 64 Q 56 112 56 104 V 64 Q 56 56 64 56 Z"), // body
    s("M 78 56 V 44 H 142 V 56"), // cup-warmer rail
    e(82, 80, 9, 9), // pressure gauge
    e(82, 80, 1.5, 1.5), // gauge center
    s("M 128 72 H 150 V 90 H 128 Z"), // display panel
    s("M 102 112 V 122 H 118 V 112"), // group head
    s("M 110 122 V 130"), // portafilter spout
    s("M 158 112 L 170 132"), // steam wand
    e(110, 150, 16, 5), // cup rim
    s("M 95 150 C 96 162 103 168 110 168 C 117 168 124 162 125 150"), // cup body
    s("M 125 153 C 136 153 136 164 126 165"), // handle
  ].join("\n");
}

// Roastery cafe — a drum roaster with bean hopper, drum-face door, and beans.
function roasteryCafe(stroke) {
  const s = pathFn(stroke);
  const e = ellipseFn(stroke);
  return [
    s("M 66 78 H 150 Q 160 78 160 88 V 140 Q 160 150 150 150 H 66 Q 56 150 56 140 V 88 Q 56 78 66 78 Z"), // housing
    e(90, 114, 28, 28), // drum face
    e(90, 114, 10, 10), // door
    s("M 100 114 H 108"), // door handle
    e(138, 104, 3.5, 3.5), // knobs
    e(138, 120, 3.5, 3.5),
    s("M 118 50 H 154 L 146 78 H 126 Z"), // hopper
    e(130, 42, 9, 6), // beans (with center crease)
    s("M 130 36 C 126 42 134 42 130 48"),
    e(148, 37, 9, 6),
    s("M 148 31 C 144 37 152 37 148 43"),
    s("M 72 150 V 166"), // legs
    s("M 144 150 V 166"),
  ].join("\n");
}

// Drive-through or kiosk — an awning over a service window with a to-go cup,
// and a drive-lane arrow beneath.
function driveThru(stroke) {
  const s = pathFn(stroke);
  return [
    s("M 44 66 L 60 44 H 160 L 176 66"), // awning top
    s("M 44 66 Q 55 76 66 66 Q 77 76 88 66 Q 99 76 110 66 Q 121 76 132 66 Q 143 76 154 66 Q 165 76 176 66"), // scalloped hem
    s("M 56 66 V 160 H 164 V 66"), // booth body
    s("M 80 84 H 140 V 124 H 80 Z"), // service window
    s("M 76 124 H 144"), // sill ledge
    s("M 100 106 H 120 L 117 112 H 103 Z"), // to-go cup lid
    s("M 107 106 V 100 H 113 V 106"), // sip dome
    s("M 103 112 L 105 124 H 115 L 117 112"), // cup body
    s("M 48 172 H 150"), // drive lane
    s("M 150 172 L 142 167"), // arrowhead
    s("M 150 172 L 142 177"),
  ].join("\n");
}

// Mobile cart or pop-up — a wheeled cart under a scalloped canopy with a cup.
function mobileCart(stroke) {
  const s = pathFn(stroke);
  const e = ellipseFn(stroke);
  return [
    s("M 48 70 Q 110 44 172 70"), // canopy top arc
    s("M 48 70 Q 60 84 72 70 Q 84 84 96 70 Q 108 84 120 70 Q 132 84 144 70 Q 156 84 168 70"), // scalloped hem
    s("M 64 70 V 92"), // posts
    s("M 152 70 V 92"),
    s("M 60 92 H 156 V 152 H 60 Z"), // cart box
    s("M 78 100 H 138 V 122 H 78 Z"), // serving window
    e(82, 162, 12, 12), // wheels
    e(82, 162, 3, 3),
    e(134, 162, 12, 12),
    e(134, 162, 3, 3),
  ].join("\n");
}

const SUBJECTS = {
  "flat-white": { slot: "recipe-card", w: 600, h: 800, sw: 5, draw: flatWhite, defVariant: "light" },
  espresso: { slot: "recipe-card", w: 640, h: 640, sw: 5, draw: espresso, defVariant: "light" },
  "empty-no-data": { slot: "empty-state", w: 480, h: 480, sw: 4, draw: emptyNoData, defVariant: "muted" },
  // Model-type selection icons (TIM-1697): transparent bg, shared 220x200 canvas.
  "model-full-cafe": { slot: "model-type", w: 220, h: 200, sw: 6, draw: fullCafe, defVariant: "light", transparent: true },
  "model-espresso-bar": { slot: "model-type", w: 220, h: 200, sw: 6, draw: espressoBar, defVariant: "light", transparent: true },
  "model-roastery-cafe": { slot: "model-type", w: 220, h: 200, sw: 6, draw: roasteryCafe, defVariant: "light", transparent: true },
  "model-drive-thru": { slot: "model-type", w: 220, h: 200, sw: 6, draw: driveThru, defVariant: "light", transparent: true },
  "model-mobile-cart": { slot: "model-type", w: 220, h: 200, sw: 6, draw: mobileCart, defVariant: "light", transparent: true },
};

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else (a[k] = n), i++;
  }
  return a;
}

async function render(subjectKey, variantKey) {
  const def = SUBJECTS[subjectKey];
  if (!def) throw new Error(`Unknown subject: ${subjectKey}. Known: ${Object.keys(SUBJECTS).join(", ")}`);
  const variant = variantKey || def.defVariant;
  const v = VARIANTS[variant];
  if (!v) throw new Error(`Unknown variant: ${variant}. Known: ${Object.keys(VARIANTS).join(", ")}`);

  const svg = frame(def.w, def.h, v.bg, def.draw(v.stroke), def.sw, def.transparent);
  const slotDir = path.join(OUT_DIR, def.slot);
  await mkdir(slotDir, { recursive: true });
  const svgPath = path.join(slotDir, `${subjectKey}.svg`);
  const pngPath = path.join(slotDir, `${subjectKey}.png`);
  await writeFile(svgPath, svg);
  // 2x raster for attachment / marketing fallback (TIM-1579 §6 "export at 2x").
  await sharp(Buffer.from(svg)).resize(def.w * 2, def.h * 2).png().toFile(pngPath);
  console.log(`✓ ${subjectKey} [${variant}] → ${path.relative(ROOT, svgPath)} + ${path.relative(ROOT, pngPath)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.all) {
    for (const key of Object.keys(SUBJECTS)) await render(key, undefined);
    return;
  }
  if (!args.subject) throw new Error('Provide --subject <key> or --all. Keys: ' + Object.keys(SUBJECTS).join(", "));
  await render(String(args.subject), args.variant ? String(args.variant) : undefined);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
