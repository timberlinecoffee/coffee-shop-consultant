#!/usr/bin/env node
/**
 * Smoke test runner — TIM-1357
 *
 * Wraps `playwright test` so callers can use:
 *   pnpm test:smoke -- --issue=TIM-XXX
 *
 * The --issue flag is converted to the SMOKE_ISSUE env var that
 * tests/smoke.spec.ts reads.
 */

import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const issueArg = args.find((a) => a.startsWith("--issue="));
const remaining = args.filter((a) => !a.startsWith("--issue="));

const env = { ...process.env };
if (issueArg) {
  env.SMOKE_ISSUE = issueArg.split("=")[1];
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "tests/smoke.spec.ts", ...remaining],
  { stdio: "inherit", env }
);

process.exit(result.status ?? 0);
