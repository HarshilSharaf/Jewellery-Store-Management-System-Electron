# Dependency Upgrade workstream — Phase 4 report

**Branch:** `upgrade/dependencies` @ base `1d1fc50`
**Worktree:** `c:/My Files/My REPOS/project-dependency-upgrade`
**Scope:** Wave 1 (baseline hygiene) + Wave 2 (Karma → WTR investigation) only. Angular 20 / Electron / electron-store v10 / rxjs 8 / TS 5.9 / bcryptjs v3 all out of scope.

## Commits produced (4)

1. `1539ab0` — chore(tsconfig): drop orphaned `crypto-browserify` path alias
2. `1da78be` — chore: drop `@angular/localize` (unused)
3. `aa187d2` — chore(package): pin Node engine to `>=20.11.0`
4. `ba78de2` — chore(deps): patch-bump runtime deps within same major

All four commits are signed with the required `Co-Authored-By` trailer and each keeps `npm run build` passing.

## Dependency inventory (before → after)

### `dependencies`

| Package | Baseline (`1d1fc50`) | After | Notes |
| --- | --- | --- | --- |
| `@angular/animations` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/cdk` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/common` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/compiler` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/core` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/forms` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/localize` | `^19.2.0` | **removed** | no `$localize` / `i18n=` usage in `client/` |
| `@angular/material` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/platform-browser` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/platform-browser-dynamic` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/router` | `^19.2.0` | `^19.2.0` | unchanged |
| `@fortawesome/fontawesome-free` | `^7.2.0` | `^7.3.1` | patch/minor bump within v7 |
| `animate.css` | `^4.1.1` | `^4.1.1` | pinned (may be culled later by Backend) |
| `base64-js` | `^1.5.1` | `^1.5.1` | pinned; removal blocked (see coordination request) |
| `bcryptjs` | `^2.4.3` | `^2.4.3` | 2.4.3 is v2.x tip; no v3 per scope |
| `chart.js` | `^4.5.1` | `^4.5.1` | already at latest 4.x |
| `dayjs` | `^1.11.19` | `^1.11.21` | patch bump |
| `electron-log` | `^5.4.3` | `^5.4.4` | patch bump |
| `electron-store` | `^8.2.0` | `^8.2.0` | v10 out of scope (ESM-only) |
| `mysql2` | `^3.17.2` | `~3.17.5` | pinned to `~3.17.x` per scope; installed 3.17.5 |
| `ngx-image-compress` | `^18.1.7` | `^18.1.7` | unchanged |
| `ngx-print` | `^3.2.0` | `^3.2.0` | major jump would need UI work |
| `ngx-skeleton-loader` | `^12.0.0` | `^12.0.0` | unchanged |
| `ngx-ui-loader` | `^19.0.0` | `^19.0.0` | unchanged |
| `rxjs` | `^7.8.2` | `^7.8.2` | v8 out of scope |
| `sweetalert2` | `^11.26.18` | `^11.26.25` | patch bump |
| `tslib` | `^2.8.1` | `^2.8.1` | already at latest 2.x |
| `zone.js` | `~0.15.0` | `~0.15.0` | unchanged |

### `devDependencies`

| Package | Baseline | After | Notes |
| --- | --- | --- | --- |
| `@angular-devkit/build-angular` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/cli` | `^19.2.0` | `^19.2.0` | unchanged |
| `@angular/compiler-cli` | `^19.2.0` | `^19.2.0` | unchanged |
| `@types/bcryptjs` | `^2.4.6` | `^2.4.6` | matches bcryptjs 2.x |
| `@types/jasmine` | `^6.0.0` | `^6.0.0` | unchanged |
| `concurrently` | `^8.2.2` | `^8.2.2` | v9/v10 defer |
| `electron` | `^40.4.1` | `^40.4.1` | out of scope |
| `jasmine-core` | `~5.6.0` | `~5.6.0` | unchanged |
| `karma` | `~6.4.4` | `~6.4.4` | Karma stays (see Wave 2) |
| `karma-chrome-launcher` | `~3.2.0` | `~3.2.0` | unchanged |
| `karma-coverage` | `~2.2.1` | `~2.2.1` | unchanged |
| `karma-jasmine` | `~5.1.0` | `~5.1.0` | unchanged |
| `karma-jasmine-html-reporter` | `~2.1.0` | `~2.1.0` | unchanged (dev-only, still useful) |
| `typescript` | `~5.8.0` | `~5.8.0` | 5.9 out of scope |

### `engines`

Added `"engines": { "node": ">=20.11.0" }` — codifies the supported Node runtime so `npm ci` fails fast on older Node.

## Removed dependencies

- `@angular/localize` (and its `polyfills` entry in both `build` and `test` targets of `angular.json`).
- `crypto-browserify` **path alias** from `tsconfig.json` (the package itself was never installed; only a dead `paths` mapping existed).

## Configuration changes

- `tsconfig.json` — removed the `paths` block that mapped `crypto` → `./node_modules/crypto-browserify`.
- `angular.json` — dropped `@angular/localize/init` from `build.options.polyfills` and `test.options.polyfills`. Test target still uses the Karma builder.
- `package.json` — added `engines.node`; removed `@angular/localize` from `dependencies`; patch-bumped six deps.

## Breaking-change summary

None. All bumps are within the existing SemVer major range (mostly patch, some minor within same major for FontAwesome). No source code was touched; no template or TS API surface changed. Removing `@angular/localize` is behavior-preserving because nothing in `client/` invokes `$localize` or uses `i18n=` markers.

## Build verification

`npm run build` (production, `--base-href ./`) passes on every commit. Warning inventory is identical to baseline:

- 1x `bundle initial exceeded maximum budget` (955.33 kB vs. 500 kB) — pre-existing.
- 4x CommonJS-not-ESM warnings for `sweetalert2`, `bcryptjs`, `base64-js`, `dayjs` — pre-existing.
- Several `NG8107` template optional-chain warnings and Sass `@import` deprecation warnings — pre-existing (client-owned; UI workstream).

**No new warnings introduced.** The `@angular/localize` polyfill removal did not eliminate a CommonJS warning as scope-hoped (localize's compiled entry is already ESM in v19), so warning count is unchanged.

## `npm audit` before / after

| Scope | Baseline (`1d1fc50`) | After (`ba78de2`) | Delta |
| --- | --- | --- | --- |
| Full (dev + runtime) | 62 (1 low / 25 moderate / 34 high / 2 critical) | 61 (1 low / 25 moderate / 33 high / 2 critical) | −1 high |
| Runtime only (`--omit=dev`) | 14 (1 low / 1 moderate / 12 high) | 10 (0 low / 1 moderate / 9 high) | **−4** |

The runtime-only surface shrank by 4 advisories, mostly from dropping the `@angular/localize` transitive tree (which pulled in older `fast-uri` and other server-side deps that aren't relevant for our Electron packaging). Dev advisories (Karma / webpack transitive) still dominate the total count and would require Karma removal or a full Angular 20 uplift to move — both out of scope.

Full audit report (advisories that remain high/critical) is dominated by `webpack-dev-server`, `karma → connect / body-parser → send`, `esbuild`, `fast-uri`, `picomatch`, and `websocket-driver` — all buildtime-only surfaces.

Baseline Dependabot number (195 vulnerabilities) uses GitHub's advisory graph, which counts every advisory affecting any indirect dep regardless of code path; local `npm audit` de-duplicates and counted 62 for us. Both counts moved in the same direction (down) with the changes here; the absolute numbers differ by tooling.

## Wave 2 — Karma → Web Test Runner: NOT MIGRATED

Attempted the migration end-to-end:

1. `@angular-devkit/build-angular:web-test-runner` builder ships with devkit v19 (`node_modules/@angular-devkit/build-angular/src/builders/web-test-runner/`).
2. Installed `@web/test-runner@1.0.0` as a devDependency and swapped the `test` builder in `angular.json`.
3. Added a minimal `web-test-runner.config.mjs`.
4. Ran `npx ng test --watch=false`. The builder printed:

   ```
   NOTE: The Web Test Runner builder is currently EXPERIMENTAL and not ready for production use.
   The 'assets' option is not yet supported by this builder.
   The 'styles' option is not yet supported by this builder.
   The 'inlineStyleLanguage' option is not yet supported by this builder.
   The 'stylePreprocessorOptions' option is not yet supported by this builder.
   The 'sourceMap' option is not yet supported by this builder.
   The 'progress' option is not yet supported by this builder.
   ```

   Then failed with the same `client/polyfills.ts` missing-file error that afflicts the Karma builder (a UI-owned issue — Angular 15+ moved polyfills to `angular.json`; `tsconfig.spec.json` still lists the phantom file).

**Decision:** revert. Reasons:

- Angular itself flags the builder as EXPERIMENTAL and not production-ready.
- It drops support for six options we use (`assets`, `styles`, `inlineStyleLanguage`, `stylePreprocessorOptions`, `sourceMap`, `progress`) — a functional regression in the dev loop, not a modernisation.
- The blocker for actually running specs (`client/polyfills.ts`) is UI-agent-owned and hits both builders identically, so WTR doesn't unlock anything Karma can't.
- Karma’s dev-only advisories are the same class of issue WTR would trade for `esbuild` / `@web/*` advisories — no clear security win.

The revert is clean: `angular.json` `test` target is bit-identical to its post-Wave-1 state, and `@web/test-runner` was uninstalled. Karma packages remain in `devDependencies` and the Karma builder is still wired.

Total effort spent on Wave 2: well under the 30% budget.

## Coordination requests (please pass to Backend / UI agents)

**No `../COORDINATION_REQUESTS.md` file exists yet at `c:/My Files/My REPOS/`. Filing requests here for Phase 6 pickup.**

### For Backend agent

1. **Replace `base64-js` with Node `Buffer`** in `Backend/Shared/file-system.service.ts` so `base64-js` can leave `dependencies`:
   - `base64-js.fromByteArray(x)` → `Buffer.from(x).toString('base64')`
   - `base64-js.toByteArray(x)` → `Uint8Array.from(Buffer.from(x, 'base64'))`
   Once merged, this workstream (or a follow-up) can drop `base64-js` and eliminate one runtime CommonJS build warning.

2. If any Backend service starts to import `crypto`, note that the old `crypto-browserify` alias is gone — use the built-in Node `node:crypto` module.

### For UI agent

1. **Create `client/polyfills.ts`** (even if empty, or with the historical `import 'zone.js';` line) OR **remove the `client/polyfills.ts` entry from `tsconfig.spec.json`'s `files` array**. Currently `ng test` fails with `TS6053: File 'client/polyfills.ts' not found` on both Karma and WTR builders because `tsconfig.spec.json` still references it. Angular 15+ moved polyfills to `angular.json`, so the physical file is optional — either restore the file or clean the tsconfig reference. The tsconfig cleanup is arguably in this workstream's scope, but per scope note "UI agent owns that fix" I have left it alone to avoid double-editing.

## Remaining risks

- **`ngx-print@3.2.0`** — installed dep is 4 majors behind `ngx-print@22.x`. Not touched here (would need UI agent to validate print flows). Currently working; leave for a future workstream.
- **`ngx-skeleton-loader@12`** — one major behind v13; `ngx-image-compress@18` and `ngx-ui-loader@19` are also candidates for future patch work.
- **`electron@40.4.1`** — out of scope. When bumped to Electron 41+, revisit `electron-log`, `electron-store` compatibility.
- **`base64-js`** — still present pending Backend coordination request above.
- **Karma stack** — accounts for the majority of the remaining npm audit advisories. Full removal would require Angular ≥ 20 (native Vitest support) or a mature WTR builder. Neither is in this workstream's charter.
- **Sass `@import` deprecation** — 15+ deprecation warnings; UI-agent territory (`client/styles.scss`).
- **`sweetalert2`, `bcryptjs`, `dayjs`, `base64-js`** — all still trip the CommonJS optimization warning. Migrating call sites to ESM entries (where they exist) is UI/Backend territory.

## Success criteria — status

- [x] `npm ci` succeeds on a fresh clone (verified — `rm -rf node_modules && npm ci` completed cleanly with the current committed lockfile).
- [x] `npm run build` passes after every commit.
- [x] No new build warnings introduced (warning list is bit-identical to baseline).
- [x] `npm audit` count reduced (62 → 61 total; 14 → 10 runtime-only).
