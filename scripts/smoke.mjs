#!/usr/bin/env node
/**
 * Smoke test runner — TIM-1357
 *
 * Wraps `playwright test` so callers can use:
 *   pnpm test:smoke -- --issue=TIM-XXX
 *
 * TIM-2994: route resolution moved here. tests/smoke.spec.ts is loaded via
 * Playwright's require() path; top-level await throws ESM-graph errors there,
 * so we pre-resolve to a comma-separated SMOKE_ROUTES env var the test reads
 * synchronously.
 */

import { spawnSync } from "child_process";
import * as https from "https";
import * as http from "http";

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error("bad JSON")); }
      });
    });
    req.on("error", reject);
  });
}

function parseRoutes(md) {
  const section = md.match(/##\s*Routes\s*\n([\s\S]*?)(?:\n##|$)/i)?.[1] ?? "";
  return section
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.startsWith("/"));
}

async function resolveRoutesForIssue(issueId) {
  const base = process.env.PAPERCLIP_API_URL;
  const token = process.env.PAPERCLIP_API_KEY;
  if (!base || !token) {
    console.warn(`SMOKE_ISSUE=${issueId} but PAPERCLIP_API_URL/KEY missing — using defaults`);
    return null;
  }
  try {
    const issue = await fetchJson(`${base}/api/issues/${issueId}`, token);
    const routes = issue?.description ? parseRoutes(issue.description) : [];
    if (routes.length === 0) {
      console.warn(`No routes in ${issueId} description — using defaults`);
      return null;
    }
    console.log(`Smoke routes from ${issueId}:`, routes);
    return routes;
  } catch (err) {
    console.warn(`Could not fetch ${issueId}:`, err.message ?? err);
    return null;
  }
}

const args = process.argv.slice(2);
const issueArg = args.find((a) => a.startsWith("--issue="));
const remaining = args.filter((a) => !a.startsWith("--issue="));
const env = { ...process.env };

const issueId = issueArg ? issueArg.split("=")[1] : process.env.SMOKE_ISSUE;
if (issueId) {
  const routes = await resolveRoutesForIssue(issueId);
  if (routes) {
    env.SMOKE_ROUTES = routes.join(",");
  }
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "tests/smoke.spec.ts", ...remaining],
  { stdio: "inherit", env }
);

process.exit(result.status ?? 0);
