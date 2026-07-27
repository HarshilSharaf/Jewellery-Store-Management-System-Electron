# SQLite migration (MySQL → better-sqlite3)

> **Status:** the data layer has moved from MySQL (mysql2 + stored procedures)
> to an **embedded SQLite database** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).
> mysql2 is fully removed. This page is the canonical summary of that change;
> where other `docs/` pages still describe MySQL/stored-procedures, this page
> supersedes them until they are rewritten.

## Why

The product is an offline-first, single-shop POS for small jewellers (see
[`../overview.md`](../overview.md)). Requiring a shopkeeper to install and run a
MySQL server is a non-starter for that market. Embedded SQLite ships as a single
file in the OS user-data directory, needs zero setup, is faster for this
single-writer workload, and reduces backup to a file copy.

## Architecture

- **One synchronous handle**, opened once in the Electron **main process**
  (`src-electron/db/index.js`). No pool, no async, no network.
- The renderer still sends `call <proc>(?)` strings over the existing
  `db:execute` / `db:query` IPC channels **and** the named channels
  (`metalRates:*`, `shopSettings:*`, `karigar:*`, …). `src-electron/db/router.js`
  maps each proc name to a JS implementation and returns results in the **same
  envelope shape mysql2 produced for a `CALL`** — `[...resultSets, sentinel]`.
- Because the envelope is preserved, the renderer's existing result-flatten
  layer (`DbBridgeService.flatten()`, which slices off the trailing packet)
  keeps working unchanged. **The Angular client was not rewritten for the
  data-layer swap.**

```
renderer (Angular)                      main process
  service.execute('call get_x(?)') ──►  ipcMain db:execute
                                          └► router.tryExecute / runProc
                                              └► db/procedures/<domain>.js  ──► better-sqlite3
  flatten([...sets, sentinel]) ◄──────────── [...sets, sentinel]
```

## Money & weights (important)

SQLite has no real `DECIMAL`. To avoid floating-point rounding on gold rates ×
grams and GST totals, **money is stored as integer paise (₹1 = 100) and weights
as integer milligrams (1 g = 1000)**. Conversion happens only at the data-layer
boundary (`src-electron/db/money.js`):

- **On read**, integer columns are *hydrated* back to fixed-precision strings
  (`"12345.00"`, `"9.500"`) to match mysql2's old DECIMAL-as-string output, by
  column name — so the renderer contract is unchanged.
- **On write**, incoming rupee/gram values are converted to integers.

## Schema & migrations

Schema is versioned via `PRAGMA user_version`; a forward-only migration runner
in `db/index.js` applies each step in a transaction. SQL lives in
`src-electron/db/schema/`:

| Version | File | Contents |
|---|---|---|
| 1 | `001_baseline.sql` | 15 P1 tables + reference seed (purities, tax slabs) |
| 2 | `002_p2_tables.sql` | 9 P2 tables (karigar, schemes, repair, whatsapp, ibja, stock movements) |
| 3 | `003_perf_indexes.sql` | Targeted performance indexes (orders list sort, latest-rate lookup) |
| 4 | `004_query_opt_indexes.sql` | Query-audit indexes (`invoices(soldToCustomer,createdAt)`, `savingschemes(createdAt)`) |

The migration list + runner live in `db/migrate.js` and are shared by the app
(`db/index.js`) and the demo seeder (`db/seed-demo.js`) so the two can never
drift (an earlier bug had the seeder skip later migrations).

MySQL-isms were translated: `AUTO_INCREMENT`→`INTEGER PRIMARY KEY AUTOINCREMENT`
(including the old `BIGINT` ids), `ENUM`→`TEXT` + `CHECK(...)`, `TINYINT(1)`→
`INTEGER` + `CHECK(col IN (0,1))`, `JSON`→`TEXT` + `CHECK(json_valid)`,
`DATETIME`→`TEXT`. `ON UPDATE CURRENT_TIMESTAMP` has no SQLite equivalent, so
`updatedAt` is maintained by per-table `AFTER UPDATE` triggers. FK enforcement
requires `PRAGMA foreign_keys = ON` per connection (see below).

## Stored procedures → JavaScript

All ~96 MySQL stored procedures are reimplemented as JS functions
`(db, params) => resultSets` under `src-electron/db/procedures/<domain>.js`,
registered by exact proc name in `db/procedures/index.js`. MySQL idioms map to:
`UUID()`→`crypto.randomUUID()`, `NOW()/CURDATE()`→`datetime('now')`/`date('now')`,
`JSON_OBJECT` audit inserts→a `writeAudit()` helper, `LAST_INSERT_ID()`→
`info.lastInsertRowid`, `SELECT … INTO`→`resolveId()`, `ON DUPLICATE KEY UPDATE`→
`ON CONFLICT … DO UPDATE`, `SIGNAL`→`throw`, multi-statement bodies→
`db.transaction(fn)()`. Shared helpers live in `db/helpers.js`.

Tests: **`npm run test:db`** (`node --test`, per-domain `*.test.js`) covers
routing, the envelope/flatten contract, integer-paise round-trips, invoice-total
reconciliation, pagination and RBAC.

## Performance / PRAGMAs

Set per-connection at open in `db/index.js`:

```
journal_mode        = WAL          -- concurrent read/write, persistent
synchronous         = NORMAL       -- safe + fast under WAL
foreign_keys        = ON           -- OFF by default; enforces every FK
busy_timeout        = 5000         -- ride out brief lock contention
cache_size          = -65536       -- 64 MB page cache
temp_store          = MEMORY       -- sorts / GROUP BY temp b-trees in RAM
mmap_size           = 268435456    -- up to 256 MB memory-mapped reads
journal_size_limit  = 67108864     -- cap WAL at 64 MB after checkpoint
analysis_limit      = 400          -- bound cost of optimize/ANALYZE
```

`PRAGMA optimize` runs on connection **open and close** (SQLite's recommendation
for long-lived connections); the demo seeder runs `ANALYZE`. Beyond the FK/date/
status/soft-delete indexes carried over in the baseline, migrations v3–v4 add
**covering** indexes for patterns the existing ones couldn't serve:
`idx_invoices_createdAt`, `idx_metalrates_purity_session_date`,
`idx_invoices_soldToCustomer_createdAt`, `idx_savingschemes_createdAt`. We
deliberately avoid speculative indexes on this small DB.

### Query audit (read + write)

A `EXPLAIN QUERY PLAN`-backed audit of all ~96 procs produced these applied
fixes (verified plans flip `SCAN`/temp-B-tree → index `SEARCH`):

- **Sargable date ranges (biggest win).** Reports filtered with
  `WHERE date(col) BETWEEN @from AND @to`; wrapping the indexed column in
  `date()` forced full scans. Rewritten to half-open raw ranges
  `col >= @from AND col < @toNext` (exclusive next-day bound computed in JS),
  which are index-seekable — `get_sales_register`, `get_day_book`,
  `get_gstr1_export_rows`.
- **v4 indexes** for `get_customer_orders` and `get_all_saving_schemes` sorts.
- **Empty-search skip:** `get_all_customers` omits its 5-column `LIKE` when the
  search box is blank, so the default list is a covering-index count.
- **Write correctness:** `loginUser`, `update_user_image`, `delete_user_image`
  now wrap their multi-statement writes in `db.transaction` (all other writes
  were already transactional), dropping redundant re-SELECTs.

Deliberately **not** applied (documented, low ROI on a single-user POS): a
global prepared-statement cache; N+1 child-fetch batching in `get_all_orders`
(measured ~8→3.5 ms/page — negligible absolute at POS scale); grouped-count
join in `get_all_karigars`; and speculative indexes for rarely-run reports.

## Backup & restore

`src-electron/backup.js` no longer shells out to `mysqldump`/`mysql`. It takes a
consistent, WAL-safe snapshot via `better-sqlite3`'s online `.backup()` API and
encrypts it with the **unchanged AES-256-GCM + scrypt** archive format
(`*.db.enc`). Restore decrypts, runs `PRAGMA integrity_check`, then atomically
swaps the DB file (clearing `-wal`/`-shm` sidecars) and relaunches. No external
binaries required.

- Inspect an archive without restoring: **`npm run backup:decrypt -- <archive.db.enc> <passphrase> [out.db]`**
  → produces a plain `.db` openable in any SQLite viewer.

## Packaging

`better-sqlite3` v13 ships **N-API prebuilt binaries** — one binary works for
both Node and Electron, so no per-ABI compilation is needed. `electron-builder`
is configured with `npmRebuild: false` and `asarUnpack` for the native `.node`
files (and `serialport`). Install with **`npm ci --ignore-scripts`** (npm would
otherwise try to compile `better-sqlite3` from source via `node-gyp`). See
[`../releases/build-and-package.md`](../releases/build-and-package.md).

## Dev workflow

- **DB location:** dev (unpackaged) uses the repo's `demo.db`; packaged builds use
  `app.getPath('userData')/jewellery.db`. `ZEUS_DB_PATH` overrides both.
- **Demo data:** `npm run seed:demo` (small) or `npm run seed:demo:large` (busy
  set for reports/dashboards). Writes through the real procs; dev app picks up
  `demo.db` automatically. Never ship demo data in an installer.
- **Default login:** `admin` / `admin` (seeded) — **must be changed before shipping**.

## What was removed

- `mysql2` dependency and the connection pool.
- `docker-compose.yml`, `Dockerfile`, `docker/`, and `MYSQL_*` environment variables.
- The **Database settings page** (MySQL host/port/user/password form) and all DB
  connection-config wiring (`SettingsModel`, `defaultDbInfo`/`currentDbInfo`
  store keys, `store:getDefaultDbInfo`).
- The dead `mysqldump`-based `Backend/Shared/backup.service.ts` mirror.

## Related fixes made during migration

- **Image display:** every image now loads as a base64 data URL over IPC instead
  of `file://` URLs (which Chromium blocks under `webSecurity` in dev). Applies to
  product/customer/user/repair images and the shop logo.
- **Invoice counter:** `save_shop_settings` no longer overwrites the live
  `currentInvoiceCounter` (the old SP reset it, which could produce duplicate
  invoice numbers). Deliberate resets go through `reset_invoice_counter`.
- **Audit resilience:** `writeAudit` nulls a non-existent `actorUserId` rather
  than failing the whole transaction on the audit FK.

## Known faithful-port deviations (to revisit)

These mirror the original MySQL SP behaviour (or an intentional, documented
change) and are worth reviewing against real usage:

- `grandTotal` LIKE searches now match the integer-paise representation, not a
  rupee decimal string.
- Nested-JSON amounts in order-detail reads are hydrated to strings (mysql2
  emitted JSON numbers there).
- Date-window report procs compute ranges in UTC (`datetime('now')`), not IST
  local time.
