# Migrations

Structural changes to the schema (adding indexes, altering columns, dropping
constraints) live under `Scripts/Migrations/` and follow a simple
**forward-only versioned file** convention. There is no tool like Flyway,
Liquibase, or `umzug` in the pipeline - the initialization shell script applies
files in lexicographic order.

## File naming

```
Scripts/Migrations/
  V001__add_guid_and_soft_delete_indexes.sql
  V001__rollback.sql
  V002__<next change>.sql
  V002__rollback.sql
  ...
```

- **`V<NNN>__<snake_case_description>.sql`** for the forward change.
- **`V<NNN>__rollback.sql`** with the exact reversal, kept next to the forward
  file. Rollbacks are documentation and a manual escape hatch - the pipeline
  never runs them automatically.
- Three-digit zero-padded numbering keeps sort order stable up to V999.

## When to add a migration

Add a `V<NNN>__*.sql` migration file when you:

- Add or drop an index.
- Add or rename a column.
- Change a column type.
- Add or drop a foreign key.
- Backfill / normalize data.

Do **not** edit the original `Scripts/Tables/*.sql` files for these changes -
those files describe the baseline that a fresh install starts from. On an
existing installation the migration is what runs.

## Where the pipeline picks them up

`docker/init/01-init-db.sh` runs (in this order):

1. All files under `Scripts/Tables/` (fresh install only - because the shell
   script is a `docker-entrypoint-initdb.d` hook, MySQL only invokes it on an
   empty data volume).
2. All files under `Scripts/Migrations/`, sorted lexicographically. Because the
   Tables step just ran on an empty database, every migration runs against a
   pristine schema on a fresh install.
3. All stored procedures under `Scripts/Stored-Procedures/`.
4. `Scripts/Seed/seed-data.sql`.

For a **manual MySQL install** you need to run migrations by hand after the
tables (see [`../getting-started/quick-start-manual.md`](../getting-started/quick-start-manual.md)).
For an existing running database you apply just the new file(s):

```bash
mysql -u root -p jewellery < Scripts/Migrations/V002__whatever.sql
```

## What has shipped

| Version | Purpose | Forward file | Rollback |
| ------- | ------- | ------------ | -------- |
| V001    | Add unique keys on `customerGuid`, `invoiceGuid`, `paymentGuid`, `productGuid`; add covering indexes for common `deletedAt` / `isSold` filters. | `Scripts/Migrations/V001__add_guid_and_soft_delete_indexes.sql` | `Scripts/Migrations/V001__rollback.sql` |

The baseline `Scripts/Tables/*.sql` files intentionally do **not** include these
indexes - they are the first documented migration, added during the Backend
modernization pass. Future changes append V002, V003, ...

## Guidelines for writing a migration

- **One logical change per file.** Simpler to review, simpler to roll back.
- **Idempotent where possible.** Prefer `CREATE INDEX IF NOT EXISTS ...` when
  MySQL supports it (8.0.29+). Otherwise wrap in a `DROP INDEX ... IF EXISTS`.
- **`ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE`** for index adds on large
  tables (this app is small-scale so contention is unlikely, but the habit is
  cheap).
- **Data backfills** should be `UPDATE` batches guarded by a `WHERE` clause
  that leaves the migration re-runnable.
- **Never edit an already-shipped migration.** If the change is wrong, ship a
  new V(NNN+1) that fixes it.

## Coordinating with stored procedures

A migration that changes a column type or table name **almost always** requires
a matching stored-procedure edit. Because the `Stored-Procedures/` folder is
re-applied wholesale on every container start, this is safe: update the SP file
in place, ship the two files together, and the pipeline will pick them up.

## Coordinating with the renderer

If a migration changes the columns returned by a stored procedure, update the
matching TypeScript model in `client/app/modules/<feature>/models/` in the same
commit or the same PR - the app will otherwise silently render blank cells.
