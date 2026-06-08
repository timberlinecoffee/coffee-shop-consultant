# scripts/ — operational scripts

Most files here are one-shot verifiers, screenshotters, or per-ticket scripts. This README documents the parts that are load-bearing for production operations.

## Migration apply (`apply-tim<N>-migration.mjs`)

**Canonical path for agent-driven DDL** on the prod Supabase project (`ltmcttjftxzpgynhnrpg`).

```bash
SUPABASE_DB_URL='<supavisor v2 pooler url>' node scripts/apply-tim<N>-migration.mjs
```

Each script in this family:

1. Reads `SUPABASE_DB_URL` from env. Fails fast with a clear message if missing.
2. Tries the URL as-is, then falls back to enumerating Supavisor v2 (`aws-1-*`) pooler regions in case the project moves region. See `apply-tim2447-migration.mjs` for the canonical pattern.
3. Applies idempotent DDL (`CREATE IF NOT EXISTS`, `ALTER ... IF NOT EXISTS`) from `supabase/migrations/<version>_<name>.sql`.
4. Stamps the row in `supabase_migrations.schema_migrations` so `scripts/check-migration-drift.mjs` (TIM-950) stays green.
5. Verifies post-conditions (row counts, RLS enabled per `Standing Rule 1`).

**Re-running is safe.** Idempotent DDL + `ON CONFLICT DO NOTHING` on `schema_migrations` means a re-run on an already-applied migration is a no-op, not an error. That is the test for "did SUPABASE_DB_URL land correctly" — re-run the most recent apply script and expect the success summary with `0 row(s)` deltas where applicable.

### Connection string format

Supavisor v2 transaction pooler — IPv4-reachable from GH runners and Paperclip agent runtime:

```
postgresql://postgres.ltmcttjftxzpgynhnrpg:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

- User: `postgres.<project-ref>` (the dotted form is required for Supavisor).
- Port `6543` (transaction mode) is the recommended default for app traffic; `5432` (session mode) also works for one-shot DDL — both are honored by the fallback enumeration. See [TIM-2376](/TIM/issues/TIM-2376) memory note for the full endpoint table.
- `sslmode=require` is mandatory.
- The `aws-0-*` (Supavisor v1) hostnames return `tenant not found` — do not use them.
- `db.<ref>.supabase.co` is IPv6-only — do not use it from CI / agent runners.

### Where the secret lives

`SUPABASE_DB_URL` is provisioned in two places ([TIM-2553](/TIM/issues/TIM-2553)):

- **Paperclip secrets store** — injected into agent run env so this script family works in a CTO/CEO heartbeat.
- **Vercel project env (Production scope)** — for the same scripts called from GitHub Actions or Vercel build steps.

If you find an agent run where `SUPABASE_DB_URL` is unset, open a ticket against the CTO referencing TIM-2553 — do not paste the secret into a thread.

### Writing a new apply script

Follow `apply-tim2447-migration.mjs` as the template:

- `import pg from "pg"` and `setDefaultResultOrder("ipv4first")` at the top.
- One `MIGRATION_FILE` + `MIGRATION_VERSION` + `MIGRATION_NAME` constant set per script.
- DDL must be idempotent — author it that way in `supabase/migrations/` first. See `supabase/migrations/README.md` for the version/filename invariant.
- Verify step prints row counts and asserts RLS is enabled on every new table (Standing Rule 1).
- Exit non-zero on any failure; `console.error("FATAL:", err.message)` for the top-level handler.

## Other load-bearing scripts

| Script | Purpose | Source ticket |
| --- | --- | --- |
| `done-gate.sh` | Pre-`done` assertion: merge + prod-200 + Playwright smoke. Run before PATCHing a ship issue to `done`. | [TIM-1428](/TIM/issues/TIM-1428) |
| `safe-delete-branch.sh` | Wraps `git branch -d`; refuses unmerged. | [TIM-987](/TIM/issues/TIM-987) |
| `check-migration-drift.mjs` | CI gate — filename version must match `schema_migrations`. | [TIM-950](/TIM/issues/TIM-950) |
| `check-links.mjs` | CI gate — internal link checker. | — |
| `smoke.mjs` | Production smoke run. | — |
