# QA Fixture Users — Runbook

**Owner:** Product Developer (TIM-682)
**Last updated:** 2026-05-16

---

## Overview

QA fixture users are synthetic Supabase Auth accounts used in staging/CI.
Every mutation to these accounts **must** go through the `qa-fixture-admin`
Edge Function, which enforces a server-side allowlist and writes every
attempt to `auth_users_audit`.

Direct calls to `auth.admin.*` or `auth.users` SQL from agent tooling are
**prohibited** — see [TIM-682](/TIM/issues/TIM-682) and [TIM-677](/TIM/issues/TIM-677).

---

## Allowlist rule

Only emails matching the following pattern may be created, updated, or deleted:

```
^qa-[a-z0-9._-]+@timberline\.coffee$
```

Examples of allowed emails:
- `qa-smoke@timberline.coffee`
- `qa-e2e.checkout@timberline.coffee`
- `qa-tim638@timberline.coffee`

Any other email (including production accounts like `trentrollings@gmail.com`)
returns `403 not_allowlisted` and is logged.

---

## Edge Function: `qa-fixture-admin`

**Location:** `supabase/functions/qa-fixture-admin/index.ts`

**Environment variables required (set in Supabase project secrets):**
| Variable | Description |
|---|---|
| `QA_FIXTURE_TOKEN` | Shared secret; callers must send this as `Authorization: Bearer <token>` |
| `SUPABASE_URL` | Auto-injected by Supabase Edge runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase Edge runtime |

**Request format:**
```json
POST /functions/v1/qa-fixture-admin
Authorization: Bearer <QA_FIXTURE_TOKEN>
Content-Type: application/json

{ "op": "create" | "update" | "delete", "email": "qa-...", "password": "..." }
```

**Responses:**
| Status | Meaning |
|---|---|
| 200 | Operation succeeded |
| 400 | Bad request (missing fields, invalid op) |
| 401 | Missing or wrong token |
| 403 | Email not on allowlist — logged to `auth_users_audit` with `refusal_code: not_allowlisted` |
| 404 | User not found (update only) |
| 500 | Internal error |

---

## Calling the Edge Function

### From the CLI (Deno helper)

```bash
# Set env vars
export NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
export QA_FIXTURE_TOKEN="<token-from-secrets-manager>"

# Create
deno run --allow-env --allow-net scripts/qa/fixture-user.ts \
  create qa-smoke@timberline.coffee "TmpPass123!"

# Update password
deno run --allow-env --allow-net scripts/qa/fixture-user.ts \
  update qa-smoke@timberline.coffee "NewPass456!"

# Delete
deno run --allow-env --allow-net scripts/qa/fixture-user.ts \
  delete qa-smoke@timberline.coffee
```

### From TypeScript / test helpers

```ts
async function callQaFixture(
  supabaseUrl: string,
  token: string,
  op: "create" | "update" | "delete",
  email: string,
  password?: string,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/qa-fixture-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ op, email, password }),
  });
  if (!res.ok) throw new Error(`qa-fixture-admin: ${res.status} ${await res.text()}`);
  return res.json();
}
```

---

## Audit log

Every call is written to `public.auth_users_audit`:

```sql
select * from public.auth_users_audit order by occurred_at desc limit 20;
```

| Column | Description |
|---|---|
| `op` | create / update / delete |
| `target_email` | The email that was targeted |
| `outcome` | `allowed` or `refused` |
| `refusal_code` | `not_allowlisted` (only on refusals) |
| `source_ip` | x-forwarded-for header, if present |
| `occurred_at` | Timestamp |

---

## Migration history

| Migration | Description |
|---|---|
| `20260516000003__qa_fixture_audit.sql` | Creates `auth_users_audit` table |

---

## Deployment

```bash
# Deploy the edge function
supabase functions deploy qa-fixture-admin --project-ref <ref>

# Set the shared secret (generate once, store in 1Password)
supabase secrets set QA_FIXTURE_TOKEN=<token> --project-ref <ref>
```

The `SUPABASE_SERVICE_ROLE_KEY` is **not** set by callers — it is injected
by the Supabase Edge runtime from project secrets. Agent scripts no longer
need the service role key in their environment.

---

## What changed from the old approach

| Before | After |
|---|---|
| Scripts called `supabase.auth.admin.createUser(...)` directly | Scripts call `qa-fixture-admin` Edge Function |
| Required `SUPABASE_SERVICE_ROLE_KEY` in agent env | Requires only `QA_FIXTURE_TOKEN` (narrow-purpose secret) |
| No allowlist enforcement | `^qa-[a-z0-9._-]+@timberline\.coffee$` enforced server-side |
| No audit trail | Every attempt logged to `auth_users_audit` |

---

## Staging SQL seed (demo user)

`supabase/seeds/staging-demo-user.sql` uses direct SQL inserts (not the
JS admin API) and runs under Supabase CLI with full DB privileges. It
creates `demo.owner@timberline.coffee` — a non-QA address that exists
**only in staging**. This seed is run manually by the CTO or via
`supabase db seed`; it does not go through the Edge Function because it
requires full SQL access to multiple tables in a single transaction.

If you need to automate staging resets, wrap each auth row in a
call to `fixture-user.ts` for the auth portion, and handle public-schema
rows separately with a migration or seed SQL file.

---

## Related issues

- [TIM-682](/TIM/issues/TIM-682) — this runbook / edge function
- [TIM-678](/TIM/issues/TIM-678) — audit + scope-down admin access
- [TIM-677](/TIM/issues/TIM-677) — tool-layer allowlist guard
- [TIM-638](/TIM/issues/TIM-638) — QA fixture test suite
