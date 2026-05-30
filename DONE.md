# Definition of Done

A ship issue is **done** when ALL three conditions hold simultaneously:

1. **Branch merged to `origin/main`** — `git log origin/main..HEAD` is empty on the feature branch (or the branch no longer exists because the PR was merged).
2. **Production URL returns 200** — `curl -sf "$PROD_URL"` succeeds within the last 5 minutes.
3. **UI issues only: QA Lead approval + Playwright smoke pass** — the QA Lead has commented approval on the issue AND `npx playwright test --grep "@$ISSUE_ID"` exits 0.

The `scripts/done-gate.sh` script asserts all three before an agent may PATCH a ship issue to `done`. Run it; paste the output; close the issue.

## Anti-patterns (these are NOT done)

| State | Why it is NOT done |
|---|---|
| PR open / in review | Branch not merged. Any unmerged commit is still at risk. |
| Tests pass on branch | Production has not changed until the branch lands on `main`. |
| Preview URL works | Preview ≠ production. The production alias still serves the old code. |
| `status=done` set by agent without evidence | The merge-verification-sweeper will auto-reopen it. |
| "Deployed to Vercel" without verifying `main` | Feature branches deploy to previews, not production (see `AGENTS.md`). |

## Evidence format

`scripts/done-gate.sh` writes `done-evidence/$ISSUE_ID.json`:

```json
{
  "issueId": "TIM-NNN",
  "mergeSha": "<commit sha on main>",
  "prodHttpCode": 200,
  "timestamp": "<ISO-8601>",
  "playwrightExitCode": 0
}
```

Include this file (or its contents) in the closing comment.

## Related

- `AGENTS.md` → merge-verification-sweeper section
- `UI-QUALITY-CHECKLIST.md` — checklist gating QA Lead approval
- `scripts/done-gate.sh` — enforcement script
