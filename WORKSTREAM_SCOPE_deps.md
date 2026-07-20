# Dependency Upgrade workstream scope

**Branch:** `upgrade/dependencies` @ base `1d1fc50`
**Worktree root:** `c:/My Files/My REPOS/project-dependency-upgrade`
**Scope decision:** Wave 1 + Wave 2 only. **NO** Angular 20, **NO** Electron upgrade, **NO** electron-store v10, **NO** rxjs 8, **NO** TypeScript 5.9.

## In scope — Wave 1: Baseline hygiene (no functional change)

1. **Drop the dead `crypto-browserify` path alias** from `tsconfig.json` line ~27. Package is not installed; alias is orphaned.
2. **Drop `@angular/localize`** from `package.json` dependencies AND from `angular.json` polyfills (both `build.polyfills` and `test.polyfills`). Grep confirms no `$localize` or `i18n=` markers in `client/`.
3. **Patch-level bumps** (no major/minor):
   - `mysql2` to latest 3.17.x
   - `dayjs` to latest 1.11.x
   - `chart.js` to latest 4.5.x
   - `electron-log` to latest 5.4.x
   - `sweetalert2` to latest 11.26.x
   - `tslib` to latest 2.8.x
   - `bcryptjs` to latest 2.4.x (do NOT bump to v3; Backend agent may migrate later)
   - `@fortawesome/fontawesome-free` to latest 7.x
   - `animate.css`, `base64-js` — keep pinned (may be removed later by Backend agent, but stay stable now)
4. **Replace `base64-js` with Node `Buffer`** in `Backend/Shared/file-system.service.ts` — WAIT, this file is Backend-owned. Do NOT edit. File a request in `../COORDINATION_REQUESTS.md` instead: "Please replace `base64-js.fromByteArray(x)` with `Buffer.from(x).toString('base64')` and `base64-js.toByteArray(x)` with `Uint8Array.from(Buffer.from(x, 'base64'))` (or similar depending on call site) so I can remove `base64-js` from package.json." Then keep `base64-js` in package.json for now.
5. Pin Node version in `package.json`: add `"engines": { "node": ">=20.11.0" }`.

## In scope — Wave 2: Karma → Web Test Runner

6. **Migrate test runner from Karma to `@web/test-runner`** (Angular 19 native support via `@angular/build:karma`... wait, Angular 19 doesn't have first-class WTR yet. Fallback: keep Karma but bump `@types/jasmine` and remove `karma-jasmine-html-reporter` if unnecessary. Verify Karma still runs after other cleanups.). 
   
   **DECISION POINT for the agent**: If Angular 19's `@angular-devkit/build-angular:karma` builder works cleanly with `@web/test-runner` via `@angular-devkit/build-angular:web-test-runner` (which was experimental in v17/v18), attempt the migration. Otherwise, stay on Karma and just clean up. Don't spend more than 30% of your effort on this — if it looks like a rabbit hole, revert and document in the report.
   
   If staying on Karma: at minimum, ensure the test suite runs (baseline currently fails because of the missing `polyfills.ts` — UI agent owns that fix, so specs may not pass end-to-end until Phase 6, but the builder itself should not throw config errors).

## Out of scope

- **DO NOT bump** `@angular/*` from 19.2.x to 20.x. That's a full Wave 4 uplift; user declined for this pass.
- **DO NOT bump** `electron` from 40.4.1. Backend agent is hardening the CURRENT Electron 40 (contextIsolation, preload); a version bump is a separate future workstream.
- **DO NOT bump** `electron-store` from v8 to v10 (ESM-only; would require significant main.js refactor).
- **DO NOT bump** `rxjs` from 7 to 8.
- **DO NOT bump** `typescript` from 5.8 to 5.9.
- **DO NOT bump** `bcryptjs` to v3 (behavior tweaks; Backend agent may address separately).
- **DO NOT touch** `Backend/**/*.ts`, `src-electron/main.js`, `docker-compose.yml`, `Scripts/**/*.sql`, `client/app/**` unless directly required by a package's schematic migration (which for the Wave 1+2 scope should be zero).

## Coordination boundaries

- `angular.json`: you own the `polyfills` array cleanup. UI agent may edit `styles`/`scripts` arrays. Both branches editing this file is fine; merge conflict is my responsibility at Phase 6.
- `package.json` / `package-lock.json`: fully yours.
- `tsconfig*.json`: yours to clean up.
- If Backend agent asks for a new dep (e.g., `dotenv`) via `../COORDINATION_REQUESTS.md`, add it in a single dedicated commit at the end so it's easy to revert.

## Success criteria

- `npm ci` succeeds on a clean checkout of this branch.
- `npm run build` succeeds with same warning count as baseline OR fewer (removing `@angular/localize` should drop one CommonJS warning).
- `npm audit` — record before/after counts.
- `WORKSTREAM_REPORT.md` at worktree root with: dep inventory before/after, breaking-change summary, removed deps, security findings, build/test results, remaining risks.
