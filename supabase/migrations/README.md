# Supabase migrations — authoring standard

**The invariant:** every committed filename's `<version>` MUST equal the version
recorded in `supabase_migrations.schema_migrations` for that migration.

The `migration-drift` CI check (`scripts/check-migration-drift.mjs`, TIM-950)
enforces this on every PR that touches `supabase/migrations/**` and on every push
to `main`. A filename version that doesn't match the applied version is *drift* and
hard-fails CI.

## The rule (CTO-finalized, TIM-1232)

**The applied version IS the filename version. Never invent a version number.**

There are two compliant authoring paths. Both satisfy the invariant; pick whichever
fits your tooling.

### Path A — Supabase CLI (preferred where the CLI is available)

```bash
supabase migration new <name>   # creates supabase/migrations/<wallclock>_<name>.sql
#   ...write your SQL into that file...
supabase db push                # applies it; schema_migrations.version == filename version
```

`applied == committed` by construction. Commit the generated file as-is.

### Path B — Supabase MCP `apply_migration` (the de-facto agent path)

The MCP tool assigns the version **server-side at apply time** — you do not choose
it. So you must read it back:

1. Apply: `apply_migration({ name, query })`.
2. Read back the exact version Supabase recorded:
   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations
   ORDER BY version DESC LIMIT 5;
   ```
3. Commit `supabase/migrations/<version>_<name>.sql` with the SQL body **verbatim**
   (no edits between applying and committing).

## Forbidden

- **Hand-assigned / synthetic / round-number versions** (`...000000`, sequential
  `...000001`). This is exactly what caused TIM-1231: 15 migrations were applied with
  real wall-clock versions but committed under invented versions that never matched,
  plus duplicate round-number prefixes that collided. The fix was a 15-file rename.
  Don't recreate it.
- **Editing the SQL** between applying and committing — the repo must match what ran.
- **Closing or merging** a migration PR while `migration-drift` is red.
- **Adding new versions to the baseline** (`scripts/migration-drift-baseline.json`) to
  silence CI. The baseline grandfathers *pre-TIM-950* drift only; fix the filename
  instead.

## If you find applied-but-uncommitted drift

Recover the SQL from the DB and commit it under the matching version — never touch the
DB to "fix" a filename:

```sql
SELECT array_to_string(statements, E';\n')
FROM supabase_migrations.schema_migrations
WHERE version = '<version>';
```

## Verify before pushing

```bash
SUPABASE_DB_URL=<connection string> node scripts/check-migration-drift.mjs
# expect: 0 hard failures
```

Refs: TIM-950 (drift lint), TIM-1231 (one-time reconcile), TIM-759 (prior archeology).
