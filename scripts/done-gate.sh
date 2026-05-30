#!/usr/bin/env bash
# done-gate.sh — Assert all "done" conditions before closing a ship issue.
# Usage: scripts/done-gate.sh <ISSUE_ID> [--ui]
#
# --ui flag: also runs Playwright smoke for the issue tag.
#
# Writes done-evidence/<ISSUE_ID>.json on success.
# Exits non-zero on any failure.

set -euo pipefail

ISSUE_ID="${1:-}"
UI_SHIP=false
if [[ "${2:-}" == "--ui" ]]; then
  UI_SHIP=true
fi

if [[ -z "$ISSUE_ID" ]]; then
  echo "Usage: $0 <ISSUE_ID> [--ui]" >&2
  exit 1
fi

PROD_URL="${PROD_URL:-https://coffee-shop-consultant.vercel.app}"
EVIDENCE_DIR="done-evidence"
EVIDENCE_FILE="$EVIDENCE_DIR/$ISSUE_ID.json"

# ── 1. Branch fully merged ──────────────────────────────────────────────────
echo "→ Checking merge status..."
git fetch origin --prune --quiet

UNMERGED=$(git log origin/main..HEAD --oneline 2>/dev/null || true)
if [[ -n "$UNMERGED" ]]; then
  echo "FAIL: branch has commits not on origin/main:" >&2
  echo "$UNMERGED" >&2
  echo "Merge the PR before closing this issue." >&2
  exit 1
fi
MERGE_SHA=$(git rev-parse origin/main)
echo "  ✓ branch merged at $MERGE_SHA"

# ── 2. Production URL returns 200 ───────────────────────────────────────────
echo "→ Checking production URL: $PROD_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL")
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "FAIL: $PROD_URL returned HTTP $HTTP_CODE (expected 200)" >&2
  exit 1
fi
echo "  ✓ $PROD_URL → 200"

# ── 3. Playwright smoke (UI issues only) ────────────────────────────────────
PLAYWRIGHT_EXIT=null
if [[ "$UI_SHIP" == true ]]; then
  echo "→ Running Playwright smoke for @$ISSUE_ID..."
  if ! npx playwright test --grep "@$ISSUE_ID"; then
    echo "FAIL: Playwright smoke failed for @$ISSUE_ID" >&2
    exit 1
  fi
  PLAYWRIGHT_EXIT=0
  echo "  ✓ Playwright smoke passed"
fi

# ── 4. Write evidence ────────────────────────────────────────────────────────
mkdir -p "$EVIDENCE_DIR"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > "$EVIDENCE_FILE" <<EOF
{
  "issueId": "$ISSUE_ID",
  "mergeSha": "$MERGE_SHA",
  "prodHttpCode": $HTTP_CODE,
  "timestamp": "$TIMESTAMP",
  "playwrightExitCode": $PLAYWRIGHT_EXIT
}
EOF

echo ""
echo "✓ All done-gate checks passed. Evidence written to $EVIDENCE_FILE"
cat "$EVIDENCE_FILE"
