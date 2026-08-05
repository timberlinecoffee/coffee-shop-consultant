// TIM-4119: Sign Out has to actually sign you out.
//
// Found by trying to use it. Clicking Sign Out in the sidebar took you to a
// browser error page and left the session intact.
//
// The cause: `/auth/signout` exports POST only, and the sidebar linked to it
// with a plain `<Link href>` — a GET. Next answered 405, Chrome rendered its own
// error page, and nothing was signed out. The Account page and the Settings
// screen submit a form and worked fine, which is exactly why it went unnoticed:
// two of the three callers were correct, and the broken one was the one on
// every screen.
//
// Worse than a dead button. Someone on a shared laptop clicks Sign Out, sees a
// broken page, closes the tab, and walks away believing they are logged out.
//
// The route is RIGHT to be POST-only — signing out changes state, and a GET
// endpoint that destroys a session can be fired by any <img> tag on any page.
// So this guards the callers, and guards that the route does not "fix" itself
// by opening up to GET.
//
// Run: node --experimental-strip-types --test src/lib/auth/signout-callers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const repo = new URL("../../..", import.meta.url).pathname;
const read = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

/** Every file that references the sign-out endpoint, excluding the route itself. */
function callerFiles() {
  const out = execSync(
    `grep -rl 'auth/signout' src --include=*.tsx --include=*.ts || true`,
    { cwd: repo, encoding: "utf8" }
  ).trim();
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith("auth/signout/route.ts"));
}

test("nothing reaches sign-out with a plain link", () => {
  // The exact bug. A GET to a POST-only route is a 405 and a browser error
  // page, which reads to the owner as "the app is broken" — while leaving them
  // logged in.
  for (const file of callerFiles()) {
    const src = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

    assert.doesNotMatch(
      src,
      /<Link\s[^>]*href=["'`]\/auth\/signout/,
      `${file} signs out with <Link>, which issues a GET and cannot work`
    );
    assert.doesNotMatch(
      src,
      /<a\s[^>]*href=["'`]\/auth\/signout/,
      `${file} signs out with an anchor, which issues a GET and cannot work`
    );
    assert.doesNotMatch(
      src,
      /(router\.(push|replace)|location\.(href|assign))\s*\(?\s*=?\s*["'`]\/auth\/signout/,
      `${file} navigates to sign-out, which issues a GET and cannot work`
    );
  }
});

test("every sign-out control submits a form", () => {
  // The positive half. A file could pass the test above by removing sign-out
  // entirely, or by wiring it to something that silently does nothing.
  const callers = callerFiles().filter((f) => /\.tsx$/.test(f));
  assert.ok(callers.length >= 2, "expected at least the sidebar and the account page");

  for (const file of callers) {
    const src = read(file);
    assert.match(
      src,
      /<form[^>]*action=["'`]\/auth\/signout["'`][^>]*method=["'`]post["'`]/i,
      `${file} references sign-out but never posts to it`
    );
  }
});

test("no sign-out form is torn down by its own click handler", () => {
  // The second half of this bug, and the subtler one. The first fix turned the
  // sidebar's link into a form submit but kept the neighbours' onClick, which
  // calls setOpen(false). That unmounts the <form> during the click handler,
  // and a browser cancels a submission whose form no longer exists. The button
  // looked right, posted nothing, and left the session intact — the same
  // symptom as before, one layer down.
  //
  // Closing the menu is pointless here regardless: the page is navigating away.
  for (const file of callerFiles().filter((f) => /\.tsx$/.test(f))) {
    const src = read(file);
    const form = src.match(
      /<form[^>]*action=["'`]\/auth\/signout["'`][\s\S]*?<\/form>/i
    );
    if (!form) continue;
    assert.doesNotMatch(
      form[0],
      /onClick=/,
      `${file}: the sign-out button runs a click handler that can unmount its own form before it submits`
    );
  }
});

test("the sign-out route stays POST-only", () => {
  // If a future fix "solves" a 405 by adding a GET handler, the bug comes back
  // as something worse: any <img src="/auth/signout"> on any page — an avatar,
  // an email pixel, a pasted link preview — silently ends the session.
  const route = read("src/app/auth/signout/route.ts");
  assert.match(route, /export async function POST/, "the POST handler is gone");
  assert.doesNotMatch(
    route,
    /export (async )?function GET/,
    "sign-out gained a GET handler — any image tag can now end a session"
  );
  assert.match(
    route,
    /signOut\(/,
    "the route no longer actually signs the user out"
  );
});
