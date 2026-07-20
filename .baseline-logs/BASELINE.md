# Phase 3 baseline snapshot

**Commit under test:** `wip/baseline-2026-07-16` @ `1d1fc50` (parent) + `4add432` (submodule).
**Date:** 2026-07-16
**Environment:** Node 24.18.0, npm 11.16.0, Windows 11 Enterprise, Angular 19.2.

## Results

| Check | Result | Notes |
|---|---|---|
| `tsc -p tsconfig.app.json --noEmit` | PASS (exit 0, 0 lines of output) | Clean typecheck of app config. |
| `npm run build` (`ng build --configuration=production`) | PASS (exit 0) | 5 warning classes recorded below. |
| `ng test --watch=false --browsers=ChromeHeadless` | **FAIL** | TS6053: `client/polyfills.ts` referenced by `tsconfig.spec.json:12` no longer exists (deleted in the WIP standalone-components migration). Karma exits before executing any test. |
| Lint | N/A | No lint script configured; no ESLint config present. |

## Pre-existing baseline warnings (not caused by Phase 4)

Recorded so any post-Phase-4 diff can attribute changes correctly.

1. Sass `@import` deprecation — `client/styles.scss:25` uses `@import 'animate.css/animate.min';`. Removable in Dart Sass 3.0.
2. Initial bundle exceeds 500 kB budget by 455 kB (total 955 kB). Budget lives in `angular.json`.
3. CommonJS import warning: `sweetalert2` used by `client/app/modules/settings/components/settings-page/settings-page.component.ts`.
4. CommonJS import warning: `bcryptjs` used by `client/app/modules/profile/components/profile-page/profile-page.component.ts`.
5. CommonJS import warning: `base64-js` used by `Backend/Shared/file-system.service.ts`.
6. CommonJS import warning: `dayjs` used by `Backend/Customers/db-customers.service.ts`.

## Pre-existing baseline failure

**BASELINE-FAIL-001** — `tsconfig.spec.json:12` references `client/polyfills.ts` which was deleted as part of the standalone-components WIP migration. Karma cannot start. **Not caused by Phase 4 work**; will be corrected as part of the UI-modernization workstream (drop the reference, since standalone bootstrap does not need polyfills.ts — polyfills now live in `angular.json` build.polyfills).

## Additional data points

- Github Dependabot reported 195 vulnerabilities on the default branch (4 critical / 82 high / 82 moderate / 27 low) as of the WIP push. Detailed breakdown lives at the repo's `/security/dependabot` page.
- No CI configured (no `.github/`, `.gitlab-ci.yml`, `Jenkinsfile`, or `azure-pipelines*`).
- No `LICENSE` file.
- Uncommitted (intentionally excluded from baseline): `src-electron/hide_from_screenShare.js` (references `ffi-napi`/`ref-napi` that are not in `package.json`).
