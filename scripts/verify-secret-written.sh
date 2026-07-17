#!/usr/bin/env bash
# verify-secret-written.sh — SI-verify probe (TIM-3966)
#
# Confirms a named secret exists and is active in the Paperclip
# company_secrets store for the given company. Intended to run
# post-accept on any Service-Identity parent issue (TIM-2895 Move 3)
# before the SI parent closes. A miss must reopen the SI parent with
# a fresh request_confirmation naming /TIM/settings/secrets.
#
# Usage: scripts/verify-secret-written.sh <company_id> <secret_name>
#
# Env:
#   SUPABASE_DB_URL  Paperclip embedded pg DSN (weekly-rotated).
#                    Required. Never echoed to stdout/stderr on failure.
#
# Exit codes:
#   0  hit          → stdout: "verified: <id>"
#   1  usage error  → stderr: usage
#   2  env missing  → stderr: SUPABASE_DB_URL unset
#   3  psql error   → stderr: sanitized error (DSN redacted)
#   4  miss         → stderr: not found for company/name

set -euo pipefail

usage() {
  echo "Usage: $0 <company_id> <secret_name>" >&2
  echo "  Verifies row in company_secrets where status='active'." >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

COMPANY_ID="$1"
SECRET_NAME="$2"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "FATAL: SUPABASE_DB_URL is not set" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "FATAL: psql not on PATH" >&2
  exit 2
fi

redact() {
  # Strip the DSN and any bare postgres:// URL from an error blob.
  sed \
    -e "s|${SUPABASE_DB_URL}|<SUPABASE_DB_URL>|g" \
    -e "s|postgres\(ql\)\?://[^ ]*|<postgres-dsn>|g"
}

STDERR_FILE="$(mktemp)"
trap 'rm -f "$STDERR_FILE"' EXIT

# Parameterized query — args pass through psql -v, not shell interpolation.
# ON_ERROR_STOP=1 turns SQL errors into non-zero psql exit.
# -A -t -F '' keeps output as a bare id, no headers, no separators.
set +e
ROW_ID="$(
  psql "$SUPABASE_DB_URL" \
    --no-psqlrc \
    -v ON_ERROR_STOP=1 \
    -v company_id="$COMPANY_ID" \
    -v secret_name="$SECRET_NAME" \
    -A -t \
    -c "SELECT id FROM company_secrets WHERE company_id = :'company_id' AND name = :'secret_name' AND status = 'active' LIMIT 1;" \
    2>"$STDERR_FILE"
)"
PSQL_STATUS=$?
set -e

if [[ $PSQL_STATUS -ne 0 ]]; then
  echo "FATAL: psql failed (exit $PSQL_STATUS):" >&2
  redact <"$STDERR_FILE" >&2
  exit 3
fi

# Strip trailing whitespace/newlines from bare psql output.
ROW_ID="${ROW_ID//[$'\r\n\t ']/}"

if [[ -z "$ROW_ID" ]]; then
  echo "MISS: no active secret named '$SECRET_NAME' for company '$COMPANY_ID'" >&2
  echo "      paste at /TIM/settings/secrets and re-run this probe" >&2
  exit 4
fi

echo "verified: $ROW_ID"
exit 0
