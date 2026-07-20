# Migrations

This directory is reserved for **post-launch** forward migrations only.

## Current status

Empty. During Phase 1 (destructive rebuild) the schema is defined entirely in
`Scripts/Tables/*.sql` and `docker compose down -v && docker compose up -d`
re-seeds from scratch. There is nothing to migrate because there is nothing in
production yet.

## When to add a file here

Only after the first pilot shop has real data in production. From that point
forward:

- Any change to a table under `Scripts/Tables/` **and** any change that
  needs to run against an existing installation must ship as a numbered
  forward migration here:
  `V0NN__short_snake_case_description.sql`.
- Pair every forward file with a rollback: `V0NN__rollback.sql`.
- The docker init script (`docker/init/01-init-db.sh`) picks up
  `V*.sql` in lexical order and runs them AFTER tables and BEFORE stored
  procedures. Rollback files are excluded by name.

## Why the previous V001 file is gone

`V001__add_guid_and_soft_delete_indexes.sql` and its rollback were removed
during the Phase 1 rebuild. The indexes it added (GUID uniqueness, soft-delete
+ createdAt composites) are now baked directly into the new table DDL so that
the schema declared in `Scripts/Tables/*.sql` is the single source of truth.
