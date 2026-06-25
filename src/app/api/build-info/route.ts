import { NextResponse } from "next/server";

// TIM-2327 follow-up (2026-06-25): public read-only endpoint that returns the
// current build identifier so a user reporting "the fix still doesn't work"
// can curl this from their browser (incl. Incognito) and we can correlate
// against the SHA we expect to be live. Without this, every "did the new
// bundle even load?" question needed a screenshot + chunk-grep round-trip.
//
// Vercel sets VERCEL_GIT_COMMIT_SHA and VERCEL_DEPLOYMENT_ID at build time.
// On non-Vercel runtimes (local dev, preview branches without git context)
// the values fall through to "unknown" so the endpoint never 500s.
//
// No auth, no cookies read or written. The two env vars are non-secret
// (commit SHA + deployment id are visible in every Vercel URL anyway).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      sha_short: (process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown").slice(0, 8),
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? "unknown",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      built_at_iso: process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE ?? "unknown",
    },
    {
      headers: {
        "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    }
  );
}
