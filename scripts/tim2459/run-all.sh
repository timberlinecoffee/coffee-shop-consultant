#!/usr/bin/env bash
# TIM-2459: drive all 6 personas in parallel (3 concurrent), capture output per persona.
set -uo pipefail
cd "$(dirname "$0")/../.."

PERSONAS=(
  p1-seattle-large-cafe
  p2-austin-mobile-cart
  p3-calgary-drive-thru
  p4-toronto-coworking
  p5-melbourne-third-wave
  p6-mexico-roaster-cafe
)

LOG_DIR="verify-tim2459/_logs"
mkdir -p "$LOG_DIR"

run_one() {
  local slug="$1"
  echo "[$(date +%H:%M:%S)] START $slug" >&2
  timeout 360 node scripts/tim2459/walkthrough.mjs "$slug" \
    > "$LOG_DIR/${slug}.log" 2>&1
  local rc=$?
  echo "[$(date +%H:%M:%S)] END   $slug (rc=$rc)" >&2
  return $rc
}
export -f run_one
export LOG_DIR

# 3 concurrent (Playwright + node memory budget)
printf '%s\n' "${PERSONAS[@]}" | xargs -n1 -P3 -I{} bash -c 'run_one "$@"' _ {}

echo "==== completed ===="
for slug in "${PERSONAS[@]}"; do
  if [[ -f "verify-tim2459/$slug/$slug.summary.json" ]]; then
    echo "  ✓ $slug"
  else
    echo "  ✗ $slug (no summary written)"
    tail -10 "$LOG_DIR/$slug.log" | sed 's/^/      /'
  fi
done
