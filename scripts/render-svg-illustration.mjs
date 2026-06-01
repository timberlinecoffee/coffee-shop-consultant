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
// organic curves with round caps/joins (§2.4).
function frame(w, h, bg, body, sw) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>
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

const SUBJECTS = {
  "flat-white": { slot: "recipe-card", w: 600, h: 800, sw: 5, draw: flatWhite, defVariant: "light" },
  espresso: { slot: "recipe-card", w: 640, h: 640, sw: 5, draw: espresso, defVariant: "light" },
  "empty-no-data": { slot: "empty-state", w: 480, h: 480, sw: 4, draw: emptyNoData, defVariant: "muted" },
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

  const svg = frame(def.w, def.h, v.bg, def.draw(v.stroke), def.sw);
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
