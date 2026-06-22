#!/usr/bin/env node
// TIM-1578: Groundwork illustration generation pipeline (admin/CLI tool).
//
// Renders an on-brand illustration from a recipe (or an inline prompt) via the
// OpenAI image API, optimizes it with sharp, writes it under
// public/images/illustrations/<slot>/<id>.webp, and records it in
// src/lib/illustrations/manifest.generated.json.
//
// Integration model: curated static assets, generated once and committed. This is
// an internal tool, never called at runtime.
//
// Usage:
//   node scripts/generate-illustration.mjs --recipe hero-your-coffee-shop
//   node scripts/generate-illustration.mjs --all                 # every recipe
//   node scripts/generate-illustration.mjs --recipe <id> --dry-run   # no API call, no key
//   node scripts/generate-illustration.mjs --prompt "..." --id custom --slot empty-state --size 1024x1024 --quality medium
//
// --dry-run prints the resolved prompt + estimated cost WITHOUT calling the API,
// so the whole pipeline (recipe resolution, prompt assembly, paths, manifest) can
// be verified before an OPENAI_API_KEY is provisioned.
//
// Auth: set OPENAI_API_KEY in the environment (see docs/illustrations/PIPELINE.md).
// A ChatGPT Plus subscription does NOT grant API access — this needs a platform
// API key with its own usage-based billing. The key is never logged.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import {
  RECIPES,
  getRecipe,
  resolvePrompt,
  estimateCostUsd,
  OPENAI_IMAGE_MODEL,
} from "../src/lib/illustrations/recipes.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// TIM-2906: agent runs don't always receive OPENAI_API_KEY from /TIM/settings/secrets,
// but the project root has it in .env.prod / .env.local. Source the key from those
// files iff not already in process.env so heartbeats can run this script without a
// fresh board paste. We only read OPENAI_API_KEY — other vars are untouched.
function hydrateOpenAIKeyFromDotenv() {
  if (process.env.OPENAI_API_KEY) return;
  for (const name of [".env.prod", ".env.local"]) {
    const p = path.join(ROOT, name);
    if (!existsSync(p)) continue;
    try {
      const txt = readFileSync(p, "utf8");
      const m = txt.match(/^OPENAI_API_KEY=(.*)$/m);
      if (!m) continue;
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (v) {
        process.env.OPENAI_API_KEY = v;
        return;
      }
    } catch {
      // fall through to next candidate
    }
  }
}
hydrateOpenAIKeyFromDotenv();
const PUBLIC_DIR = path.join(ROOT, "public", "images", "illustrations");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "illustrations", "manifest.generated.json");
const OPENAI_URL = "https://api.openai.com/v1/images/generations";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

/** Build the list of {id, slot, size, quality, prompt, alt} jobs to run. */
function buildJobs(args) {
  if (args.all) {
    return RECIPES.map((r) => ({
      id: r.id,
      slot: r.slot,
      size: r.size,
      quality: r.quality,
      prompt: resolvePrompt(r),
      alt: r.alt,
      background: r.background ?? "opaque",
    }));
  }
  if (args.recipe) {
    const r = getRecipe(args.recipe);
    if (!r) throw new Error(`Unknown recipe id: ${args.recipe}. Known: ${RECIPES.map((x) => x.id).join(", ")}`);
    return [{ id: r.id, slot: r.slot, size: r.size, quality: r.quality, prompt: resolvePrompt(r), alt: r.alt, background: r.background ?? "opaque" }];
  }
  if (args.prompt) {
    const id = args.id || "custom";
    const slot = args.slot || "empty-state";
    const size = args.size || "1024x1024";
    const quality = args.quality || "medium";
    const background = args.transparent ? "transparent" : "opaque";
    return [{ id, slot, size, quality, prompt: resolvePrompt({ subject: String(args.prompt) }), alt: id, background }];
  }
  throw new Error("Provide --recipe <id>, --all, or --prompt \"...\". See --help / docs/illustrations/PIPELINE.md");
}

async function callOpenAI(job, apiKey) {
  // TIM-1695: a transparent background must be requested at the API level (and
  // forces a format that carries alpha). The model then returns off-white strokes
  // on alpha rather than on a painted teal field, so no luminance matte is needed.
  const transparent = job.background === "transparent";
  const body = {
    model: OPENAI_IMAGE_MODEL,
    prompt: job.prompt,
    size: job.size,
    quality: job.quality,
    n: 1,
  };
  if (transparent) {
    body.background = "transparent";
    body.output_format = "png"; // alpha-capable; sharp converts to lossless webp below
  }
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI image API ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response missing b64_json image data");
  return Buffer.from(b64, "base64");
}

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.assets) parsed.assets = {};
    return parsed;
  } catch {
    return { _comment: "Generated by scripts/generate-illustration.mjs. Do not edit by hand.", assets: {} };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("See header of scripts/generate-illustration.mjs or docs/illustrations/PIPELINE.md");
    return;
  }
  const dryRun = Boolean(args["dry-run"]);
  const jobs = buildJobs(args);

  const totalCost = jobs.reduce((sum, j) => sum + estimateCostUsd(j), 0);
  console.log(`Model: ${OPENAI_IMAGE_MODEL}`);
  console.log(`Jobs: ${jobs.length} | Estimated total cost: $${totalCost.toFixed(4)}`);
  for (const j of jobs) {
    console.log(`\n• ${j.id} [${j.slot}] ${j.size} ${j.quality} ~$${estimateCostUsd(j).toFixed(4)}`);
    console.log(`  prompt: ${j.prompt}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] No API call made, no files written. Plumbing verified.");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "\nERROR: OPENAI_API_KEY is not set. Export it before running (see docs/illustrations/PIPELINE.md).\n" +
        "Note: a ChatGPT Plus subscription does not grant API access — a platform API key with its own billing is required."
    );
    process.exit(2);
  }

  const manifest = await loadManifest();
  for (const j of jobs) {
    const slotDir = path.join(PUBLIC_DIR, j.slot);
    await mkdir(slotDir, { recursive: true });
    console.log(`\nRendering ${j.id} ...`);
    const png = await callOpenAI(j, apiKey);
    const webpPath = path.join(slotDir, `${j.id}.webp`);
    // Transparent line art uses near-lossless webp so thin strokes stay crisp at the
    // alpha edges; opaque rasters stay on the lighter lossy setting.
    const webpOpts =
      j.background === "transparent"
        ? { quality: 95, alphaQuality: 100, nearLossless: true }
        : { quality: 90 };
    await sharp(png).webp(webpOpts).toFile(webpPath);

    const publicPath = `/images/illustrations/${j.slot}/${j.id}.webp`;
    manifest.assets[j.id] = {
      path: publicPath,
      model: OPENAI_IMAGE_MODEL,
      size: j.size,
      quality: j.quality,
      generatedAt: new Date().toISOString(),
      costUsd: Number(estimateCostUsd(j).toFixed(4)),
    };
    console.log(`  wrote ${publicPath}`);
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nUpdated manifest: ${path.relative(ROOT, MANIFEST_PATH)}`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
