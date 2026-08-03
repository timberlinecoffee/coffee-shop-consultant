// TIM-4116 (UX Phase 5): text is teal, and stays teal.
//
// Trent, 2026-08-03: "The text is still black or near black or grey. Again, we
// want that teal text across the platform, both in the header and body text."
//
// "Again" is why this file exists. He asked once before — "I don't think I want
// black font. I think we can go for a blue font across the platform instead" —
// and it was logged as D-009, read as a rejection of black rather than an
// instruction to move body text off it. The accent was correctly left alone and
// #1a1a1a quietly stayed. A preference stated in conversation evaporated; a
// preference with a test around it does not.
//
// Two failure modes are guarded, and they pull against each other:
//   1. Text drifts back toward neutral — the original bug.
//   2. Someone lightens the teal because a screenshot looked heavy, and body
//      copy silently drops below the readable floor.
// Both are computed here from the actual token values, not asserted from a
// number someone typed in a comment.
//
// Run: node --experimental-strip-types --test src/lib/text-colour.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** Read a token from a given block (`:root`-ish default, or `.dark`). */
function token(name, { dark = false } = {}) {
  const block = dark
    ? css.slice(css.indexOf(".dark {"))
    : css.slice(0, css.indexOf(".dark {"));
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `${name} is not defined as a 6-digit hex${dark ? " in .dark" : ""}`);
  return m[1].toLowerCase();
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("body text is unmistakably teal, not a near-neutral that reads as black", () => {
  // The actual complaint was visual: "still black or near black or grey". So
  // the test is visual too — the blue and green channels must lead red by a
  // wide margin. #1a1a1a (21,21,21) has a spread of 0 and fails. #155e63
  // (21,94,99) has a spread of 78.
  for (const [name, hex] of [
    ["--foreground", token("--foreground")],
    ["--card-foreground", token("--card-foreground")],
    ["--muted-foreground", token("--muted-foreground")],
    ["--dark-grey", token("--dark-grey")],
  ]) {
    const [r, g, b] = rgb(hex);
    const spread = Math.min(g, b) - r;
    assert.ok(
      spread >= 30,
      `${name} is ${hex} — only ${spread} of teal cast over red. That reads as grey.`
    );
    assert.ok(b >= r, `${name} is ${hex} — warmer than it is cool`);
  }
});

test("teal body text is still readable on both surfaces", () => {
  // The counterweight. Teal that looks nice in a screenshot but drops body copy
  // under 4.5:1 is a worse outcome than the black it replaced.
  const bg = token("--background");
  const card = token("--card");
  const fg = token("--foreground");
  const muted = token("--muted-foreground");

  assert.ok(contrast(fg, bg) >= 7, `body on page is ${contrast(fg, bg).toFixed(2)}:1, under AAA 7:1`);
  assert.ok(contrast(fg, card) >= 7, `body on card is ${contrast(fg, card).toFixed(2)}:1, under AAA 7:1`);
  assert.ok(
    contrast(muted, bg) >= 4.5,
    `secondary copy on page is ${contrast(muted, bg).toFixed(2)}:1, under AA 4.5:1`
  );
  assert.ok(
    contrast(muted, card) >= 4.5,
    `secondary copy on card is ${contrast(muted, card).toFixed(2)}:1, under AA 4.5:1`
  );
});

test("dark mode carries the same teal without inverting into unreadable ink", () => {
  // Teal INK on a near-black page would be unreadable, so dark mode carries the
  // cast in the light text instead. Both the cast and the contrast are checked,
  // because it would be easy to "fix" a contrast failure here by reverting to a
  // neutral off-white and losing the brand entirely.
  const bg = token("--background", { dark: true });
  const card = token("--card", { dark: true });
  const fg = token("--foreground", { dark: true });
  const muted = token("--muted-foreground", { dark: true });

  for (const [name, hex] of [["--foreground", fg], ["--muted-foreground", muted]]) {
    const [r, g, b] = rgb(hex);
    assert.ok(
      Math.min(g, b) - r >= 10,
      `dark-mode ${name} is ${hex} — neutral, so dark mode looks like a different product`
    );
  }
  assert.ok(contrast(fg, bg) >= 7, `dark body on page is ${contrast(fg, bg).toFixed(2)}:1`);
  assert.ok(contrast(fg, card) >= 7, `dark body on card is ${contrast(fg, card).toFixed(2)}:1`);
  assert.ok(contrast(muted, bg) >= 4.5, `dark secondary on page is ${contrast(muted, bg).toFixed(2)}:1`);
  assert.ok(contrast(muted, card) >= 4.5, `dark secondary on card is ${contrast(muted, card).toFixed(2)}:1`);
});

test("no screen hardcodes a near-black text colour", () => {
  // The token change moves ~2,000 call sites. What it CANNOT move is a screen
  // that wrote the hex itself — which is exactly how six Business Plan elements
  // and one Buildout input stayed black through the first attempt at this.
  const out = execSync(
    `grep -rn 'text-\\[#' src --include=*.tsx || true`,
    { cwd: new URL("../..", import.meta.url).pathname, encoding: "utf8" }
  ).trim();

  const offenders = out
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const m = line.match(/text-\[#([0-9a-fA-F]{6})\]/);
      if (!m) return false;
      const [r, g, b] = rgb(`#${m[1]}`);
      // Near-neutral AND dark = the thing being banned. A hardcoded light or
      // clearly-coloured value is someone's deliberate choice, not this bug.
      const neutral = Math.max(r, g, b) - Math.min(r, g, b) <= 24;
      return neutral && luminance(`#${m[1]}`) < 0.35;
    });

  assert.deepEqual(
    offenders,
    [],
    `these hardcode a near-black text colour instead of using --foreground:\n${offenders.join("\n")}`
  );
});

test("no screen sets text colour from the neutral Tailwind ramp", () => {
  // text-gray-900 / text-neutral-500 and friends bypass the tokens entirely, so
  // they survive any change made here. There were 249 of them across the app;
  // this keeps the count at zero. Coloured ramps (text-amber-600, text-red-500)
  // are untouched — they carry meaning.
  const out = execSync(
    `grep -rnE 'text-(gray|slate|neutral|zinc|stone)-[0-9]{2,3}' src --include=*.tsx || true`,
    { cwd: new URL("../..", import.meta.url).pathname, encoding: "utf8" }
  ).trim();

  assert.equal(
    out,
    "",
    `these set text colour outside the token system:\n${out}`
  );
});
