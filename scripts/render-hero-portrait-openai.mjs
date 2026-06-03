#!/usr/bin/env node
// TIM-1866: GENUINE gpt-image-1.5 portrait hero candidates, in the EXACT recipe
// that produced the board-loved landscape (hero-your-coffee-shop) — just
// recomposed vertical + transparent. NO vector fallback, NO hand-editing.
//
// Reuses the canonical TIM-1579 buildPrompt() with the landscape recipe's params
// (subject "hero-interior", 1.5px uniform stroke, medium-narrative detail) and only
// flips orientation/aspect/variant to portrait + alpha:
//   orientation  landscape panoramic -> vertical full-height
//   variant      dark (off-white on teal) -> dark-transparent (off-white on alpha)
//   aspectRatio  3:2 landscape -> 2:3 portrait
//   size         1536x1024 -> 1024x1536
//
// Renders N independent samples (same on-style prompt) so the board can pick the
// best composition without any drift in style. Outputs to /tmp/hero-portrait-openai/.
//
// Usage: OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/render-hero-portrait-openai.mjs [N]

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { buildPrompt, NEGATIVE_PROMPT } from "../src/lib/illustrations/prompt-recipe.ts";
import { OPENAI_IMAGE_MODEL } from "../src/lib/illustrations/recipes.ts";

const N = Number(process.argv[2]) || 4;
const SIZE = "1024x1536";
const QUALITY = "high";
const OUT_DIR = "/tmp/hero-portrait-openai";
const OPENAI_URL = "https://api.openai.com/v1/images/generations";

// Landscape recipe params (hero-your-coffee-shop) recomposed portrait + transparent.
const slots = {
  subject: "hero-interior",
  orientation: "vertical full-height",
  strokeWeight: "1.5px",
  variant: "dark-transparent",
  detail: "medium narrative",
  aspectRatio: "2:3 portrait",
};

const prompt = `${buildPrompt(slots)}. Avoid: ${NEGATIVE_PROMPT}.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(body, apiKey, maxAttempts = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const status = res.status;
    const text = (await res.text()).slice(0, 300);
    lastErr = new Error(`OpenAI ${status}: ${text}`);
    // 500/502/503/504/429 are transient for gpt-image — back off and retry.
    if ([429, 500, 502, 503, 504].includes(status) && attempt < maxAttempts) {
      const wait = 3000 * attempt;
      console.log(`    ${status} (attempt ${attempt}/${maxAttempts}) — retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

async function render(idx, apiKey) {
  const body = {
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: SIZE,
    quality: QUALITY,
    n: 1,
    background: "transparent",
    output_format: "png",
  };
  const data = await callWithRetry(body, apiKey);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("response missing b64_json");
  const png = Buffer.from(b64, "base64");
  const letter = String.fromCharCode(97 + idx); // a, b, c, d
  const webpPath = path.join(OUT_DIR, `candidate-${letter}.webp`);
  await sharp(png).webp({ quality: 95, alphaQuality: 100, nearLossless: true }).toFile(webpPath);
  await writeFile(path.join(OUT_DIR, `candidate-${letter}.png`), png);
  return webpPath;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: OPENAI_API_KEY not set.");
    process.exit(2);
  }
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Model: ${OPENAI_IMAGE_MODEL} | ${N} candidates | ${SIZE} ${QUALITY}`);
  console.log(`Prompt:\n${prompt}\n`);
  for (let i = 0; i < N; i++) {
    console.log(`Rendering candidate ${String.fromCharCode(97 + i)} ...`);
    const p = await render(i, apiKey);
    console.log(`  wrote ${p}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
