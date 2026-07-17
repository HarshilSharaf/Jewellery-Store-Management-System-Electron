# Backend / Database Optimization workstream report

Branch: `optimize/backend-database`
Base commit: `1d1fc50` (parent) + `4add432` (client submodule)
Client submodule tip after this workstream: `56bbe34` on `wip/baseline-2026-07-16`

## Summary

This workstream implements the five sections declared in `WORKSTREAM_SCOPE.md`:

1. mysql2 connection pool + `LoggerService` fix + 30s per-query timeout
2. `Scripts/Migrations/V001__add_guid_and_soft_delete_indexes.sql` (+ rollback), runner in `docker/init/01-init-db.sh`
3. `.env` externalization for docker-compose + main-process fallback with warning
4. Full IPC bridge (`preload.js` + `main.js`) so every renderer service reaches Node capabilities through `window.electronAPI.*`
5. Electron hardening (`contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`) — safe because Section 4 removed every `window.require(...)` call

The only cross-workstream touch is one file inside the `client` submodule (`app/shared/services/Auth/auth.service.ts`) which had to stop importing `bcryptjs` directly; that commit lives on the current submodule WIP branch and the parent worktree bumps the pointer.

## Commits (in order)

| # | Sha | Message |
|---|-----|---------|
| 1 | `203dcfe` | feat(db): add V001 index migration and wire docker init to run it |
| 2 | `4348137` | feat(config): externalise MySQL credentials to .env |
| 3 | `77eaccb` | feat(electron): own DB pool, store, bcrypt, and fs in main process via IPC |
| 4 | `ca0db84` | refactor(shared): route DatabaseService and LoggerService through IPC |
| 5 | `1239df7` | refactor(shared): route Store, FileSystem, Utility, Splash through IPC |
| 6 | `56bbe34` | feat(auth): route bcrypt hashing to Electron main process via IPC (SUBMODULE) |
| 7 | `14c36b9` | chore(submodule): bump client to bcrypt-IPC swap commit |

Six commits in the parent worktree, one commit in the client submodule. Every parent-worktree commit builds successfully; each submodule commit was validated after the parent bump.

## Build / test results

* `npm run build` — passes. The build baseline (parent commit `1d1fc50`, without any workstream edits) already prints 6 `NG8107` template warnings from three components (`AddProductFormComponent`, `OrderDetailsComponent`, `PrintInvoiceComponent`). Those warnings are unchanged after this workstream — zero new warnings, zero new errors, zero regressions.
* Baseline vs post-workstream build output was compared with a clean `git stash + checkout 1d1fc50 -- <touched dirs>` cycle; both output the same "Application bundle generation complete" line and the identical set of warnings.
* No test suite was executed; `karma.conf.js` exists but there are no meaningful unit tests around the backend services.

## What changed (by file)

### Section 1 — Connection & error observability

* `Backend/Shared/database.service.ts`
  * Replaced direct `mysql.createConnection` with a call to `window.electronAPI.db.initialize(config)` which builds the mysql2 pool in the main process (see below).
  * `execute()` / `query()` now accept an optional `{ timeoutMs }` option, defaulting to 30 000 ms. The timeout is enforced in the main process via `Promise.race`.
  * `prepareResponseData` was NOT semantically changed. It now carries a large JSDoc comment documenting the fragile "mysql2 returns rows + trailing OkPacket for CALLs" contract so future maintainers do not casually refactor it.

* `Backend/Shared/logger.service.ts`
  * Rewrote `LogError` to serialise `Error` instances by pulling out `name`, `message`, `code`, `errno`, `sqlState`, `sqlMessage`, `stack` instead of `JSON.stringify(err)` (which returned `"{}"` for real Errors).
  * Both `LogInfo` and `LogError` route through `window.electronAPI.logger.*`. A `console` fallback is retained for renderer contexts where the preload has not run.

* `src-electron/main.js` (pool + timeout live here now)
  * `createPool()` uses `mysql2/promise.createPool` with `connectionLimit: 10`, `waitForConnections: true`, `queueLimit: 0`, `enableKeepAlive: true`, `keepAliveInitialDelay: 10000`.
  * Explicit `pool.on('error', ...)` listener logs `PROTOCOL_CONNECTION_LOST`-class errors via electron-log.
  * `runWithTimeout(fn, timeoutMs)` wraps every `db:execute` / `db:query` IPC call so a runaway query cannot stall the UI indefinitely.
  * Fresh smoke `ping()` after pool creation surfaces bad credentials at `initialize` time rather than on the first business query.

### Section 2 — Missing indexes (forward migration only)

* `Scripts/Migrations/V001__add_guid_and_soft_delete_indexes.sql`
  * Adds all indexes requested in scope: `uk_customers_customerGuid`, `idx_customers_deletedAt`, `uk_invoices_invoiceGuid`, `idx_invoices_cancelledAt_createdAt`, `uk_payments_paymentGuid`, `idx_products_deletedAt_isSold`, `uk_products_productGuid`.
  * `products.productGuid` already carries a UNIQUE key (`products_product_guid`) defined in `Scripts/Tables/Products.sql`. The migration only adds `uk_products_productGuid` if neither name is present, so it is idempotent when re-run on a live database.
  * Wraps every DDL in an `information_schema.STATISTICS` probe (`__v001_add_index_if_missing`) so partial success on a prior run is safe to retry.

* `Scripts/Migrations/V001__rollback.sql`
  * Drops the same indexes if present. Historical `products_product_guid` is intentionally left in place — this rollback only reverses V001, not the original schema.

* `docker/init/01-init-db.sh`
  * Runs `Scripts/Migrations/V*.sql` (excluding `*__rollback.sql`) between Tables and Stored-Procedures.
  * Parametrized the trailing `GRANT` on `${MYSQL_DATABASE}.*` to `${MYSQL_USER}` so the previously hard-coded `zeus_user` follows the `.env` config.

### Section 3 — `.env` externalization

* `.env.example` (new)
  * Documents `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT` with safe demo defaults.
* `.gitignore` now excludes `.env` and `.env.local`.
* `docker-compose.yml`
  * Uses `env_file: .env` plus `${VAR:-fallback}` interpolation so the compose file works both with and without a `.env` present.
* `Backend/Shared/store.service.ts`
  * No longer requires `electron-store` directly. On first launch (`defaultDbInfo` missing) it asks the main process via `window.electronAPI.store.getDefaultDbInfo()` for values derived from `process.env`. Only if the IPC channel returns nothing does it fall back to hard-coded demo credentials — and a warning is logged.
* `src-electron/main.js`
  * `readEnv()` helper pulls `MYSQL_*` from `process.env` with `.env.example` defaults. Emits a warning via electron-log if `MYSQL_USER`/`MYSQL_PASSWORD` are not set.

### Section 4 — IPC bridge

* `src-electron/preload.js` (new)
  * `contextBridge.exposeInMainWorld('electronAPI', ...)` publishing exactly the surface listed in scope: `db.{initialize, execute, query}`, `store.{get, set, delete, getDefaultDbInfo}`, `auth.{compareHash, generateHash}`, `fs.{getPicturesDirectory, ensureDir, writeImage, readImageBase64, deleteImage, existsSync}`, `app.{relaunch, closeSplashscreen}`, `logger.{info, error}`.
  * No escape hatch is exposed (no raw `ipcRenderer`).
* `src-electron/main.js`
  * Registers a matching `ipcMain.handle` for every channel. `db:*` uses the pool created by `db:initialize`; `store:*` uses a single `ElectronStore` instance; `auth:*` uses `bcryptjs` (unchanged algorithm and cost); `fs:*` reads/writes base64 payloads to disk so no raw Buffer needs to cross IPC; `app:*` and `logger:*` are trivial.
  * Removed the stale `ElectronStore.initRenderer()` call — the renderer no longer touches electron-store.
* `Backend/Shared/file-system.service.ts`
  * Dropped `fs` and `electron` requires. Image write path now:
    1. FileReader → base64 via `imageCompressService.compressFile`
    2. base64 → `window.electronAPI.fs.writeImage(path, base64)` → main process → `fs.writeFileSync`.
  * Public method signatures unchanged so `Backend/**/*.service.ts` and the client code that uses `FileSystemService` do not need edits.
* `Backend/Shared/utitlity.service.ts`
  * `relaunch()` goes through `window.electronAPI.app.relaunch()`.
* `Backend/Shared/splashscreen.js`
  * Switched from `require("electron")` to `window.electronAPI.app.closeSplashscreen()`.

### Section 5 — Electron hardening

* `src-electron/main.js`
  * Both windows configured with `nodeIntegration: false`, `contextIsolation: true`, `webSecurity: true`, and `preload: path.join(__dirname, 'preload.js')`. The stale TODO comments were removed with the rewrite.
* Because Sections 3 and 4 already relocated every renderer-side native-module import, enabling contextIsolation is a strict tightening with no other renderer changes needed.

### Submodule bcrypt IPC swap

* `client/app/shared/services/Auth/auth.service.ts` (SUBMODULE, commit `56bbe34` on `wip/baseline-2026-07-16`)
  * Dropped `import * as bcrypt from 'bcryptjs'`.
  * Uses `window.electronAPI.auth.compareHash(plaintext, hash)` — algorithm and cost unchanged, boolean contract preserved. Existing password hashes in the DB continue to validate.
* Parent worktree commit `14c36b9` bumps the submodule pointer to `56bbe34`.

## Perf / DB findings (documented, not benchmarked)

Because the app has no representative data volume and no perf-test harness exists, the findings below are static-analysis / query-plan reasoning, not measurements.

* **GUID lookups (customerGuid, invoiceGuid, paymentGuid) were unindexed** in every stored proc that touches an individual entity. Every such proc call was doing a full-table scan against a `CHAR(36)` column. V001 covers this.
* **Soft-delete filters** (`deletedAt IS NULL`, `cancelledAt IS NULL`) were used in list/count procs without a supporting index. On a busy install the query planner would still full-scan and discard rows. V001 adds `idx_customers_deletedAt` and `idx_invoices_cancelledAt_createdAt`.
* **Product marketability filter** — `products` uses `deletedAt IS NULL AND isSold = ?` in several places; V001 adds `idx_products_deletedAt_isSold` (composite in that column order so `deletedAt` narrows first).
* **Connection thrashing** — the previous single-connection design meant every renderer service serialised its queries on one TCP socket. The main-process pool (max 10 concurrent) unblocks concurrent dashboard widgets.
* **Error observability** — every `LogError(...)` on an `Error` instance was writing `"{}"` to `electron-log`. Post-mortem debugging is now actually possible.
* **Query timeout** — no timeout at all previously. Any long/hung query would freeze the UI until the user restarted. 30s ceiling is now enforced.

## Rollback plan

Two levels:

1. **Schema rollback**: run `mysql ... < Scripts/Migrations/V001__rollback.sql` — drops the seven indexes added by V001.
2. **Code rollback**: reset the parent branch to `1d1fc50` and reset the client submodule to `4add432`. The `.env.example`, `.gitignore`, and `docker-compose.yml` edits are safe to leave in place, but a clean revert removes everything.

## Remaining risks (SP bugs — flagged, not fixed, per scope)

These are pre-existing stored-procedure bugs discovered during this workstream. They were intentionally NOT patched (out of scope). Follow-up ticket recommended.

1. **`add_customer` GUID mismatch** (`Scripts/Stored-Procedures/Customers/addCustomer.sql`)
   * The proc allocates `SET GUID = UUID()` and uses it in the imagePath prefix (`CONCAT(GUID,'-customer-',imageFileName)`), but the `INSERT` binds `uuid()` again for the `customerGuid` column — so the image filename and the row's GUID never match. Any downstream lookup that ties the image back to the customer is coincidentally correct only because the app also stores `imagePath` as-is on the row.

2. **OR/AND precedence in soft-delete filter** (multiple procs: `getAllCustomers`, `getCustomerOrders`, `get_all_products`, etc.)
   * Pattern used is `WHERE A.firstName LIKE ? OR A.lastName LIKE ? OR A.email LIKE ? AND A.deletedAt IS NULL`. Because `AND` binds tighter than `OR`, this is parsed as `firstName LIKE ? OR lastName LIKE ? OR (email LIKE ? AND deletedAt IS NULL)`, meaning soft-deleted rows are returned as long as they match `firstName` or `lastName`. Needs parentheses around the OR group.

3. **Phone number type mismatch** (`add_customer.sql`)
   * Declares `IN phoneNumber bigint` but the `customers.phoneNumber` column is `varchar(20)`. Renderer passes strings like `"+91-9876543210"`. MySQL will silently coerce or reject non-numeric input; this only works today because ingest uses digits-only in most seed data.

4. **`save_order` uses `WHILE` cursor instead of `JSON_TABLE`**
   * `Scripts/Stored-Procedures/Orders/saveOrder.sql` iterates over the JSON product list one row at a time. On MySQL 8 `JSON_TABLE` produces the same result in a single set operation.

5. **Error handlers return `SELECT ... AS message`** instead of `RESIGNAL`.
   * Callers cannot distinguish a real result set from an error string; the app has to sniff the shape. `RESIGNAL` would surface the error to mysql2 as a rejected promise.

6. **`prepareResponseData` fragility**
   * Left in place (per scope). New JSDoc on the method documents the mysql2 CALL-vs-SELECT return-shape contract so future changes are less likely to silently break every list view.

## Runtime verification

Not runtime-verified — local Electron launch not tested by this agent. The IPC bridge was built to match the wiring described in the scope doc; `npm run build` passes with no new errors, but no interactive `npm run electron` login-with-`admin/admin123` smoke test was performed.

## Coordination requests

None. The submodule pointer bump is the only cross-workstream file touch and it is contained to the one file scope allows.
