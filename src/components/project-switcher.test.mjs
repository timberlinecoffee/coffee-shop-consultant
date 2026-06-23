// TIM-2962: source-string pinning for project-switcher behavior.
// Following the pattern from src/components/auth/login-* (TIM-2961): no jsdom,
// just regex assertions against the file contents so the four bug fixes are
// regression-protected without standing up a React test harness for one file.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE = readFileSync(path.join(__dirname, "project-switcher.tsx"), "utf8");

test("Bug 1: onCreated dedups by project.id (filter on prev)", () => {
  // The parent setProjects callback must filter out any existing row with
  // the same id before prepending. Without this, clicking "Open Project"
  // on the post-create modal shows the same plan twice in the dropdown
  // until refetchProjects() lands.
  const handler = SOURCE.match(/onCreated=\{\(project, activatedNow\) => \{[\s\S]+?\}\}/);
  assert.ok(handler, "onCreated callback not found");
  assert.match(handler[0], /prev\.filter\(\(p\)\s*=>\s*p\.id\s*!==\s*project\.id\)/);
});

test("Bug 2: selector button does NOT render activeProject.locationLabel", () => {
  // The closed selector trigger should show the plan title only. The
  // locationLabel chip used to appear between the name and the chevron;
  // it now lives only in the dropdown rows.
  const buttonBlock = SOURCE.match(
    /aria-haspopup="listbox"[\s\S]+?<ChevronDown/,
  );
  assert.ok(buttonBlock, "selector trigger block not found");
  assert.doesNotMatch(buttonBlock[0], /activeProject\??\.locationLabel/);
  // Sanity: title still renders.
  assert.match(buttonBlock[0], /activeProject\?\.name/);
});

test("Bug 3: trash icon classes do not gate visibility on hover/focus", () => {
  // The trash button must be always visible. The old class string included
  // opacity-60 + group-hover:opacity-100 + focus-visible:opacity-100; all
  // three must be gone.
  const trashBlock = SOURCE.match(/aria-label=\{`Delete \$\{project\.name\}`\}[\s\S]{0,200}/);
  // Look at the button wrapper instead — find the className for the trash button.
  const trashButton = SOURCE.match(
    /<button[\s\S]+?onDelete\(\);[\s\S]+?<Trash2/,
  );
  assert.ok(trashButton, "trash button block not found");
  assert.doesNotMatch(trashButton[0], /opacity-60\b/);
  assert.doesNotMatch(trashButton[0], /group-hover:opacity-/);
  assert.doesNotMatch(trashButton[0], /focus-visible:opacity-/);
  void trashBlock;
});

test("Bug 4: post-switch navigation uses window.location.assign", () => {
  // router.push("/dashboard") + router.refresh() is a no-op when the user
  // is already on /dashboard (the case immediately after creating + opening
  // a plan), so HomeV2's client useState survives and shows the previous
  // plan's data. The fix is a hard navigation.
  // switchProject:
  assert.match(SOURCE, /switchProject[\s\S]+?window\.location\.assign\("\/dashboard"\)/);
  // openCreatedProject:
  assert.match(SOURCE, /openCreatedProject[\s\S]+?window\.location\.assign\("\/dashboard"\)/);
  // delete-active branch in onDeleted:
  assert.match(
    SOURCE,
    /deleted\.isActive[\s\S]{0,200}window\.location\.assign\("\/dashboard"\)/,
  );
  // And the old soft-nav pair must NOT appear as a statement in any of
  // those three handlers. Strip // line-comments first so the rationale
  // text in the surrounding block doesn't false-match.
  const stripComments = (s) =>
    s.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const switchBlock = SOURCE.match(
    /async function switchProject\([\s\S]+?\n  \}\n/,
  );
  assert.ok(switchBlock, "switchProject body not found");
  assert.doesNotMatch(stripComments(switchBlock[0]), /router\.push\("\/dashboard"\)/);
  const openBlock = SOURCE.match(
    /async function openCreatedProject\([\s\S]+?\n  \}\n/,
  );
  assert.ok(openBlock, "openCreatedProject body not found");
  assert.doesNotMatch(stripComments(openBlock[0]), /router\.push\("\/dashboard"\)/);
});
