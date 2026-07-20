# Security: hardening checklist

This document tracks what has been hardened, what is documented but not yet
mitigated, and what remains open. Every item links to the file(s) responsible
so a reviewer can verify the state on the current branch.

## Electron process hardening

- [x] `nodeIntegration: false` on all `BrowserWindow`s
      ([`src-electron/main.js`](../../src-electron/main.js)).
- [x] `contextIsolation: true` on all `BrowserWindow`s.
- [x] `webSecurity: true` on all `BrowserWindow`s.
- [x] A `preload.js` script is set on both the splash and main windows.
- [x] The renderer never calls `window.require(...)`; all Node access flows
      through the `window.electronAPI` bridge exposed via
      `contextBridge.exposeInMainWorld`.
- [x] `ElectronStore.initRenderer()` has been removed from `main.js` (no longer
      needed once the renderer stops importing `electron-store` directly).
- [ ] Open windows validate `event.url` in `will-navigate` and reject anything
      that isn't the app's own origin. Currently the main window can be
      navigated by any renderer script (low risk on a single-tenant desktop
      app but a good defence-in-depth).
- [ ] Explicit Content-Security-Policy meta tag in `index.html`. Currently the
      default is Chromium's - which is permissive by default.

## Secrets & configuration

- [x] Credentials live in `.env`, which is `.gitignore`d. `.env.example`
      documents the expected variables.
- [x] `docker-compose.yml` reads from `${VAR}` and `env_file: .env`; no
      credentials hard-coded in tracked files.
- [x] `Backend/Shared/store.service.ts` prefers `.env`-seeded values and logs a
      warning when it falls back to the documented defaults.
- [ ] Secrets are only in memory in the renderer (form input) and the main
      process (pool config); they never touch disk except via `electron-store`.
      This is acceptable for a same-machine app but worth auditing if the pool
      ever moves to a network DB.

## Authentication

- [x] Bcrypt hashing (`compare` / `hash`) executes in the main process, not the
      renderer. The plaintext password is passed to `auth.compareHash` /
      `auth.generateHash` once per operation.
- [x] Session token (`authData` in `electron-store`) carries a hard 24-hour
      `expiration` timestamp. `AuthGuard` checks it on every route change.
- [ ] Password strength policy (min length, character classes). Currently none.
- [ ] Rate limiting on failed login attempts. Currently none - a local attacker
      can brute-force forever.
- [ ] Bcrypt cost factor is 10. Fine for desktop; if this ever becomes
      network-facing, bump to 12+ and benchmark.

## Data at rest

- [ ] MySQL data volume is not encrypted. On a shared Windows workstation this
      matters - anyone with local admin can read `mysql:8.0`'s tablespace.
      Consider BitLocker / FileVault on the host.
- [ ] `electron-store` JSON is plaintext. `authData` includes `email`, `uid`,
      `type`. `defaultDbInfo` / `currentDbInfo` include the DB password. Any
      local user can read the file.

## Dead code and attack surface

- [ ] `JwtInterceptor` at `client/app/helpers/Http-Interceptor/jwt.interceptor.ts`
      is unused - there is no HTTP server. Remove in Phase 6.
- [ ] `HttpClient` provider in `client/app/app.config.ts` is unused except by
      the dead interceptor. Remove alongside.
- [ ] `crypto-browserify` path alias removed from `tsconfig.json` (Deps
      workstream). Verified when that lands.
- [ ] `@angular/localize` removed from dependencies + polyfills (Deps
      workstream). Fewer surface area, one less CommonJS warning.

## DB user grants

- [x] `zeus_user` has `EXECUTE` only on the schema; no direct table access.
- [ ] Consider a separate read-only user for future reporting / analytics
      needs. Not required today.

## SQL injection

- [x] Every user-supplied value is passed via parameterized `?` placeholders
      through `mysql2.execute`. Stored procedures receive them as typed
      parameters.
- [x] Stored procedures use `LIKE CONCAT('%', searchQuery, '%')` on typed
      `VARCHAR` parameters, not string interpolation. Safe.

## Follow-ups

Items marked `[ ]` above are the security backlog. None are release-blocking
for a single-shop, single-machine deployment; all should be revisited before
this ships beyond that.
