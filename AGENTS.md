<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:supabase-migration-rules -->
# Supabase migrations: commit the SQL in the same PR

When you call the Supabase MCP `apply_migration` tool, you MUST also commit the exact SQL you applied to `supabase/migrations/<version>_<name>.sql` in the same PR that introduced the change. No exceptions.

- The filename `<version>` must match the version recorded in `supabase_migrations.schema_migrations` on the project you applied against.
- Use the same SQL body verbatim (no edits between `apply_migration` and the file).
- This applies to dev, staging, and prod projects equally.

Why: The repo is the auditable source of truth for the deployed schema. Applying without committing breaks `supabase db diff`, makes rollback impossible, and forces archeology like TIM-759. If you only need a dev experiment, use a Supabase development branch — not direct `apply_migration` on a long-lived project.

If you discover an applied-but-uncommitted migration, file a child issue under TIM-759 and recover the SQL from `schema_migrations.statements` before merging anything else against that project.
<!-- END:supabase-migration-rules -->
