#!/usr/bin/env bash
# safe-delete-branch.sh — Delete a branch only after confirming it is merged.
# Codifies TIM-987.
#
# Usage: scripts/safe-delete-branch.sh <branch> [--force-i-checked]
#
# --force-i-checked: override the merge check when you have independently
#   verified the branch is safe to delete (e.g. an abandoned WIP branch
#   that was never intended to merge). This flag must be explicit — it will
#   not be inferred.

set -euo pipefail

BRANCH="${1:-}"
FORCE=false

if [[ -z "$BRANCH" ]]; then
  echo "Usage: $0 <branch> [--force-i-checked]" >&2
  exit 1
fi

if [[ "${2:-}" == "--force-i-checked" ]]; then
  FORCE=true
fi

# Fetch so origin/main is current.
git fetch origin --prune --quiet

# Check for unmerged commits on the branch vs origin/main.
UNMERGED=$(git log "origin/main..$BRANCH" --oneline 2>/dev/null || true)

if [[ -n "$UNMERGED" ]]; then
  if [[ "$FORCE" == true ]]; then
    echo "WARNING: branch '$BRANCH' has unmerged commits, but --force-i-checked was supplied."
    echo "Proceeding with force delete."
    git branch -D "$BRANCH"
    echo "✓ Force-deleted branch '$BRANCH'."
  else
    echo "REFUSED: branch '$BRANCH' has commits not on origin/main:" >&2
    echo "$UNMERGED" >&2
    echo "" >&2
    echo "Merge the branch before deleting. If you are sure it is safe to delete," >&2
    echo "re-run with --force-i-checked." >&2
    exit 1
  fi
else
  git branch -d "$BRANCH"
  echo "✓ Deleted branch '$BRANCH' (all commits confirmed on origin/main)."
fi
