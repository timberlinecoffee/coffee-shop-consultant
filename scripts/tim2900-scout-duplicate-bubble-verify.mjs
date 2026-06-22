// TIM-2900 verify: assert Scout does not render the same assistant message
// twice for a single turn.
//
// Repro of the bug (pre-fix):
//   `useCopilotStream.assistantBuffer` stayed populated with the final reply
//   after the stream settled, while `CoPilotDrawer` ALSO committed the same
//   text into `messages`. The render path showed both the committed bubble
//   AND the still-populated streaming bubble until the next send() cleared
//   the buffer. Visible to users as "Scout sent me the same answer twice".
//
// Fix:
//   `useCopilotStream` now stamps each turn with `streamingTurnId`. Render
//   guard at CoPilotDrawer.tsx:1400 only shows the streaming bubble while
//   `streamingTurnId !== null`. Parent calls `commitTurn(turnId)` the same
//   tick it commits `setMessages([...assistant])`, so React batches the
//   bubble swap into one render — no overlap, no duplicate.
//
// This script intercepts `/api/copilot/stream` with deterministic SSE so
// the assertion is not gated on Anthropic spend or model latency. Three
// successive prompts are sent; for each turn the script asserts exactly
// one assistant bubble carrying the response text.
//
// Run from repo root:
//   node scripts/tim2900-scout-duplicate-bubble-verify.mjs
//
// Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY (read from .env.local by default).

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, existsSync } from "node:fs";

const env = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        }),
    )
  : process.env;

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_URL = process.env.PROD_URL ?? "https://groundwork.cafe";
const HOST = new URL(PROD_URL).host;
const TARGET_EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env");
  process.exit(2);
}

const REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. mint session cookie ────────────────────────────────────────────────
console.log(`[1/6] minting magiclink for ${TARGET_EMAIL}...`);
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
});
if (linkErr) throw linkErr;
const tokenHash = linkData?.properties?.hashed_token;
if (!tokenHash) throw new Error("no token_hash");

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
});
if (sessErr) throw sessErr;
const session = sessData.session;
if (!session) throw new Error("no session");

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: "bearer",
  user: session.user,
});

// ── 2. launch browser, drop cookie ────────────────────────────────────────
console.log("[2/6] launching browser...");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
]);
const page = await ctx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`  [browser err] ${msg.text()}`);
});
mkdirSync("scripts/shots", { recursive: true });

// ── 3. install deterministic SSE intercept ────────────────────────────────
// We synthesize unique-per-turn assistant text so each turn is independently
// auditable AND the dedupe doesn't accidentally hide a real second bubble
// that happens to share content with another turn.
const TURNS = [
  { prompt: "TIM-2900 probe 1: what's your favorite color?", reply: "[TIM-2900-A1] Color answer for probe 1." },
  { prompt: "TIM-2900 probe 2: pick a number between 1 and 10.", reply: "[TIM-2900-A2] Number answer for probe 2." },
  { prompt: "TIM-2900 probe 3: name a coffee origin.", reply: "[TIM-2900-A3] Origin answer for probe 3." },
];

let turnIndex = 0;
await page.route("**/api/copilot/stream", async (route) => {
  const reply = TURNS[turnIndex]?.reply ?? "[TIM-2900-Aunknown] fallback";
  turnIndex += 1;
  // Stream in small chunks to mimic real model output cadence.
  const chunks = [];
  const text = reply;
  const step = Math.max(8, Math.ceil(text.length / 6));
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + step));
  }
  const body =
    chunks
      .map((c) => `event: text\ndata: ${JSON.stringify({ delta: c })}\n\n`)
      .join("") +
    `event: done\ndata: ${JSON.stringify({
      threadId: "tim2900-fixture-thread",
      modelUsed: "tim2900-fixture",
    })}\n\n`;
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
    body,
  });
});

// ── 4. open Scout on a real workspace page ────────────────────────────────
console.log("[3/6] loading /workspace/business-plan + opening Scout...");
const res = await page.goto(`${PROD_URL}/workspace/business-plan`, {
  waitUntil: "domcontentloaded",
});
if ((res?.status() ?? 0) >= 400 || page.url().includes("/login")) {
  console.error(`  page load failed status=${res?.status()} url=${page.url()}`);
  await browser.close();
  process.exit(1);
}
await page.waitForLoadState("networkidle").catch(() => {});

// Open the drawer via the floating Scout opener.
const opener = page.getByRole("button", { name: /Open Scout/i }).first();
await opener.waitFor({ state: "visible", timeout: 15_000 });
await opener.click();

// Wait for the input to be ready.
const textarea = page.getByPlaceholder(/Ask Scout/i).first();
await textarea.waitFor({ state: "visible", timeout: 10_000 });

// ── 5. send 3 prompts, assert exactly one assistant bubble per turn ───────
console.log("[4/6] sending 3 fresh Scout prompts...");
let failed = false;

for (let i = 0; i < TURNS.length; i += 1) {
  const turn = TURNS[i];
  console.log(`  turn ${i + 1}: "${turn.prompt}"`);
  await textarea.fill(turn.prompt);
  await page.keyboard.press("Enter");

  // Wait for the unique sentinel string to appear (response committed).
  const marker = page.getByText(turn.reply, { exact: false });
  await marker
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(async () => {
      await page.screenshot({
        path: `scripts/shots/tim2900-FAIL-turn-${i + 1}-no-reply.png`,
        fullPage: true,
      });
    });

  // Give the typewriter reveal + commit batch one rAF to settle.
  await page.waitForTimeout(800);

  // Count how many bubbles carry THIS turn's reply text.
  const bubblesWithThisReply = await page
    .locator(`[data-testid="copilot-bubble"][data-role="assistant"]:has-text("${turn.reply}")`)
    .count();

  // Count how many streaming bubbles remain after settle (must be zero).
  const stillStreaming = await page
    .locator('[data-testid="copilot-bubble"][data-role="assistant"][data-streaming="true"]')
    .count();

  console.log(
    `    bubbles carrying turn-${i + 1} reply: ${bubblesWithThisReply} (expected 1), still-streaming: ${stillStreaming} (expected 0)`,
  );
  if (bubblesWithThisReply !== 1 || stillStreaming !== 0) {
    failed = true;
    await page.screenshot({
      path: `scripts/shots/tim2900-FAIL-turn-${i + 1}.png`,
      fullPage: true,
    });
    console.error(`    ✗ FAIL — turn ${i + 1} did not render exactly once`);
  } else {
    console.log(`    ✓ turn ${i + 1} rendered exactly once`);
  }
}

// ── 6. final invariant: total assistant bubbles == turns sent ─────────────
console.log("[5/6] final invariant: total assistant bubbles == 3");
const totalAssistantBubbles = await page
  .locator('[data-testid="copilot-bubble"][data-role="assistant"]')
  .count();
console.log(`  total assistant bubbles: ${totalAssistantBubbles} (expected 3)`);
if (totalAssistantBubbles !== 3) {
  failed = true;
  await page.screenshot({
    path: "scripts/shots/tim2900-FAIL-total-bubble-count.png",
    fullPage: true,
  });
  console.error(`  ✗ FAIL — expected 3 assistant bubbles, found ${totalAssistantBubbles}`);
}

await page.screenshot({
  path: "scripts/shots/tim2900-3-turns-clean.png",
  fullPage: true,
});
console.log("[6/6] saved scripts/shots/tim2900-3-turns-clean.png");

await browser.close();
if (failed) {
  console.error("\n--- RESULT: FAIL ---");
  process.exit(1);
}
console.log("\n--- RESULT: PASS ---");
console.log("Scout rendered exactly one assistant bubble per turn (3/3).");
process.exit(0);
