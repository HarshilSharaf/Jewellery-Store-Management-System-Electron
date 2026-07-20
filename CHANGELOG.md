# Changelog

All notable changes to this project are documented here. Format is loosely
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning
follows a SemVer-lite policy (see
[`docs/releases/build-and-package.md`](./docs/releases/build-and-package.md)).

## [Unreleased] - Modernization sweep

Phase 4 of the modernization sweep. Sections here will be trimmed and dated
once the sweep is signed off in Phase 6.

### Added

- IPC bridge (`window.electronAPI`) exposed from `src-electron/preload.js` for
  DB, store, auth, filesystem, logger, and app-lifecycle operations. The
  renderer no longer uses `window.require`.
- MySQL connection pool with keep-alive in the Electron main process (replaces
  the single-connection `mysql.createConnection`).
- `Scripts/Migrations/` directory + `V001__add_guid_and_soft_delete_indexes.sql`
  adding unique keys on customer / invoice / payment / product GUIDs and
  covering indexes for `deletedAt` / `isSold` filters. Container init script
  applies migrations after tables and before stored procedures.
- `.env` / `.env.example` for MySQL credentials and host settings; `.env` is
  gitignored. `docker-compose.yml` parameterized to read from it.
- Docs tree under `docs/`, plus `CONTRIBUTING.md` and this `CHANGELOG.md`.
- Unit tests around `AuthGuard`, `DatabaseService.prepareResponseData`,
  `CartService`, and other shared services (UI workstream).

### Changed

- Electron `BrowserWindow` now runs with `contextIsolation: true`,
  `nodeIntegration: false`, `webSecurity: true`, and a preload script.
- Renderer-side `bcryptjs.compare` and `bcryptjs.hash` calls in
  `client/app/shared/services/Auth/auth.service.ts` now route through
  `window.electronAPI.auth.compareHash` / `generateHash` (executes in main).
- Design system consolidated to Angular Material M3. Bootstrap-compat shim
  removed. `data-bs-toggle` modals migrated to `MatDialog` (UI workstream).
- `LoggerService.LogError` now serializes Error objects with explicit
  message / code / errno / sqlState / stack fields instead of the empty
  `{}` that `JSON.stringify(new Error())` produces.
- `Backend/Shared/store.service.ts` seeds `defaultDbInfo` from `.env` values
  and logs a warning if it falls back to documented defaults.
- Documentation rewrite: root `README.md` trimmed and pointed at `docs/`.
  Stale version numbers (Electron 26, Angular 14) corrected to Electron 40 /
  Angular 19.
- Dependencies: patch bumps to `mysql2`, `dayjs`, `chart.js`, `electron-log`,
  `sweetalert2`, `tslib`, `bcryptjs`, `@fortawesome/fontawesome-free`.
  `@angular/localize` and the `crypto-browserify` path alias removed
  (Deps workstream).

### Fixed

- `client/polyfills.ts` reference in `tsconfig.spec.json` removed (was
  breaking `npm test`).
- ~25 UI bugs covering subscription leaks, `AfterViewChecked` +
  `detectChanges` loop hazards, canvas chart leaks, duplicate-on-revisit
  card lists, unclamped negative payments, missing `trackBy`, stray
  `console.log`s, `aria-*` mistakes, and unresponsive layout breakpoints
  (UI workstream).

### Deprecated / removed candidates for Phase 6

- `JwtInterceptor` at `client/app/helpers/Http-Interceptor/jwt.interceptor.ts`
  (dead; no HTTP server to talk to).
- Angular `HttpClient` provider in `client/app/app.config.ts` (unused after
  interceptor removal).
- Stored-procedure bugs discovered but intentionally not patched this sweep:
  `add_customer` GUID handling, older delete filters' `OR`/`AND` precedence,
  `phoneNumber` `BIGINT` param vs. `VARCHAR(20)` column, `save_order`
  `WHILE`-loop iteration over JSON.
- Money columns typed `DOUBLE` (candidates for `DECIMAL(12, 2)`).

## [0.0.0] - Pre-modernization baseline

Seed entry - the state of the codebase before the modernization sweep. This
version was never explicitly released; it's the checkpoint against which the
Unreleased entries above are described. `package.json` reports `0.0.0`.

Notable pre-modernization traits (all replaced above):

- Electron ran with `nodeIntegration: true`, `contextIsolation: false`,
  `webSecurity: false`. Renderer used `window.require('mysql2/promise')`,
  `window.require('electron-store')`, etc.
- MySQL credentials hard-coded in `docker-compose.yml` and
  `Backend/Shared/store.service.ts`.
- Single MySQL connection instead of a pool.
- No `Scripts/Migrations/` directory.
- Root `README.md` referenced Electron v26 and Angular 14.
