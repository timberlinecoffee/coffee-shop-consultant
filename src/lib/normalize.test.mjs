// TIM-1356: pinning tests for the AI content normalization boundary.
// Contract for AI-CONTENT-NORMALIZATION.md. Every generation boundary calls
// these, so regressions surface here first.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toTitleCase,
  stripAIJargon,
  applyVoiceRules,
  stripEmojiFromBody,
  stripPlaceholderTokens,
  normalizeAIOutput,
} from "./normalize.ts";

test("toTitleCase is re-exported and title-cases label fragments", () => {
  assert.equal(toTitleCase("mocha latte training"), "Mocha Latte Training");
});

test("stripAIJargon replaces the TIM-882 banned clichés", () => {
  assert.equal(stripAIJargon("Let's delve into roasting"), "Let's explore roasting");
  assert.equal(stripAIJargon("We can leverage the espresso machine"), "We can use the espresso machine");
  assert.equal(stripAIJargon("Let's dive deeper here"), "Let's go further here");
  assert.equal(stripAIJargon("This is a game-changer"), "This is a major improvement");
  assert.equal(stripAIJargon("This is a game changer"), "This is a major improvement");
});

test("stripAIJargon preserves leading capitalization of the replaced word", () => {
  assert.equal(stripAIJargon("Delve into the menu"), "Explore the menu");
  assert.equal(stripAIJargon("Leverage your suppliers"), "Use your suppliers");
});

test("stripAIJargon leaves clean copy untouched", () => {
  const clean = "Pull a balanced shot and steam the milk to 140F.";
  assert.equal(stripAIJargon(clean), clean);
});

test("applyVoiceRules removes em and en dashes (no em dashes in user copy)", () => {
  assert.equal(
    applyVoiceRules("Great espresso — it starts with the grind."),
    "Great espresso, it starts with the grind.",
  );
  assert.equal(
    applyVoiceRules("Two things matter–grind and dose."),
    "Two things matter, grind and dose.",
  );
});

test("applyVoiceRules keeps hyphens in compound words", () => {
  assert.equal(applyVoiceRules("A cold-brew tower"), "A cold-brew tower");
});

test("applyVoiceRules strips corporate-filler openers and re-capitalizes", () => {
  assert.equal(
    applyVoiceRules("We are pleased to offer fresh single-origin roasts."),
    "Fresh single-origin roasts.",
  );
  assert.equal(
    applyVoiceRules("We're excited to announce that classes start Monday."),
    "Classes start Monday.",
  );
});

test("stripEmojiFromBody removes emoji from body text", () => {
  assert.equal(stripEmojiFromBody("Welcome 🎉 to the course"), "Welcome to the course");
  assert.equal(stripEmojiFromBody("Great work ✅ today"), "Great work today");
});

test("stripEmojiFromBody handles ZWJ sequences and skin-tone modifiers", () => {
  assert.equal(stripEmojiFromBody("Our barista 👩🏽‍🚀 is ready"), "Our barista is ready");
});

test("stripEmojiFromBody leaves plain digits, # and * intact", () => {
  assert.equal(stripEmojiFromBody("Order #3 costs $5 *now*"), "Order #3 costs $5 *now*");
});

test("normalizeAIOutput runs all four on a label fragment (title-cases)", () => {
  assert.equal(normalizeAIOutput("mocha latte training 🎉"), "Mocha Latte Training");
});

test("normalizeAIOutput does NOT title-case sentence prose", () => {
  const input = "Let's delve into roasting — it's 🎉 a game-changer for your shop.";
  const out = normalizeAIOutput(input);
  assert.equal(out, "Let's explore roasting, it's a major improvement for your shop.");
});

test("normalizeAIOutput leaves multi-line prose in sentence case", () => {
  const input = "Welcome to the program.\nWe leverage hands-on practice.";
  const out = normalizeAIOutput(input);
  assert.equal(out, "Welcome to the program.\nWe use hands-on practice.");
});

test("all functions are safe on empty input", () => {
  for (const fn of [toTitleCase, stripAIJargon, applyVoiceRules, stripEmojiFromBody, stripPlaceholderTokens, normalizeAIOutput]) {
    assert.equal(fn(""), "");
  }
});

// TIM-3854: defense-in-depth against LLM "HEREHEREHERE..." confusion output.
// Root cause is upstream (circular BP-to-BP seed replaced with workspace
// seed) — this scrubber makes sure a garbage token from any lane never
// reaches the founder-facing preview.

test("stripPlaceholderTokens removes HEREHEREHERE and similar repeats", () => {
  assert.equal(stripPlaceholderTokens("HEREHEREHERE"), "");
  // Post-strip whitespace collapsed to a single space — the "double space
  // blemish" was called out in TIM-3854 code review; matched here so a
  // regression re-introducing it fails this pin.
  assert.equal(stripPlaceholderTokens("HEREHEREHEREHERE more text"), " more text");
  assert.equal(stripPlaceholderTokens("Prefix TODOTODOTODO suffix"), "Prefix suffix");
  assert.equal(stripPlaceholderTokens("Repeat HERE HERE HERE space"), "Repeat space");
});

test("stripPlaceholderTokens removes bracketed [FILL IN] / {{VAR}} placeholders", () => {
  // Punctuation-adjacent placeholders leave no stranded space before the punct.
  assert.equal(stripPlaceholderTokens("Total: [FILL IN] units"), "Total: units");
  // Trailing space at end-of-string is preserved (real prose ends in a period
  // or newline that trims cleanly). The blemish we care about is double-space
  // IN the middle of a paragraph.
  assert.equal(stripPlaceholderTokens("Total: [FILL_IN]"), "Total: ");
  assert.equal(stripPlaceholderTokens("Value {{PLACEHOLDER}} here"), "Value here");
  assert.equal(stripPlaceholderTokens("Insert [INSERT SHOP NAME] there"), "Insert there");
});

test("stripPlaceholderTokens removes XXXX / ____ visual placeholders", () => {
  assert.equal(stripPlaceholderTokens("XXXXXX plans"), " plans");
  assert.equal(stripPlaceholderTokens("Address: ______"), "Address: ");
});

test("stripPlaceholderTokens leaves legit ALLCAPS acronyms alone", () => {
  // Single ALLCAPS token — leave untouched.
  assert.equal(stripPlaceholderTokens("Use the SBA loan program."), "Use the SBA loan program.");
  assert.equal(stripPlaceholderTokens("NNN lease with CAM."), "NNN lease with CAM.");
  // Two distinct acronyms in a row — also not the "HEREHERE" pattern.
  assert.equal(stripPlaceholderTokens("SCA and USA."), "SCA and USA.");
});

test("normalizeAIOutput scrubs HERE placeholder in the pipeline", () => {
  // "HEREHEREHERE" was long enough (12 chars, no punctuation, ≤ 8 words) to
  // slip through isLabelShaped's guard and could have hit the title-case
  // pass. The scrubber runs BEFORE isLabelShaped so the empty result is
  // returned as-is.
  assert.equal(normalizeAIOutput("HEREHEREHEREHERE"), "");
  assert.equal(
    normalizeAIOutput("The Kestrel opens in HEREHEREHERE with a full team."),
    "The Kestrel opens in with a full team.",
  );
});
