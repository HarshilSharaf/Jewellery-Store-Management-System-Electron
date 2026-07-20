# Redesign Plan — Phase 1 Workstream reports

The prose sections 1-7 (product positioning, design direction, feature gap, phased roadmap, non-goals, risks) live in the orchestrator's brief inline and are not tracked in the repo. This file is the durable status log — one section per workstream, appended in order.

## 7.1 Workstream A — status

See parent commit `8b54afd` — "feat(phase-1): rebuild schema + cart engine around jewellery-domain data model" — for the full backend/schema rebuild landed 2026-07-20.

## 7.2 Workstream B — status

See parent submodule-pointer commit `0942c30` and client-submodule commits `c46c943` / `705f64a` / `c4a4384` / `e636161` — "design-system foundation" (2026-07-20). Tailwind / Spartan / Lucide / self-hosted fonts were deferred because they required parent-repo edits during a concurrent Workstream A pass.

## 7.3 Workstream C — status

**Update: 2026-07-20 — Design-system stack installed; login + navbar reskinned onto Tailwind + Spartan/brain + Lucide; fonts self-hosted.**

**Packages installed (parent `package.json` devDependencies)**

- `tailwindcss@^3.4.19` (v3 chosen — v4 has Angular integration friction and Spartan's Angular-19-compatible alphas peer on `>=3.3`).
- `postcss@^8.5.20` + `autoprefixer@^10.5.4`.
- `tailwindcss-animate@^1.0.7`.
- `tailwind-merge@^2.6.1` + `clsx@^2.1.1` + `class-variance-authority@^0.7.1`.
- `@spartan-ng/brain@0.0.1-alpha.563` — **pinned**, the last version whose peer deps accept `@angular/core ^19`; alpha.564+ requires Angular 20+. Spartan's helm styling packages (`@spartan-ng/ui-button-helm` etc.) are deprecated in favor of a CLI generator; we hand-roll the equivalent recipes as `@layer components` in `client/styles.scss` (see `.hlm-btn`, `.hlm-btn-primary`, `.hlm-btn-ghost`, `.hlm-btn-icon`, `.hlm-input`).
- `@ng-icons/core@^31.4.0` + `@ng-icons/lucide@^31.4.0` — 31.x is the last minor supporting `@angular/core >=18`; 32.0 needs 20+, 33.0 needs 21+.

**Tailwind config**

- `tailwind.config.js` at repo root. Content globs: `./client/index.html`, `./client/**/*.{html,ts,scss}`. Darkmode: `['selector', 'html[data-theme="dark"]']`.
- Theme colors mapped to Workstream B's semantic tokens via `var(--color-*)` references — e.g. `colors.bg = 'var(--color-bg)'`, `colors.accent.DEFAULT = 'var(--color-accent)'`, plus muted/subtle/hover/active variants and success/warning/danger scales. Same for `borderRadius`, `boxShadow`, `ringColor`. Font families: `sans: ['Inter', 'Hind', 'system-ui', '-apple-system', 'sans-serif']`, `serif: ['"Instrument Serif"', 'Fraunces', 'ui-serif', 'Georgia', 'serif']`. Tokens are **not duplicated** — the config only references B's CSS custom properties.
- `postcss.config.js` at repo root: `{ tailwindcss: {}, autoprefixer: {} }`.
- `@tailwind base; @tailwind components; @tailwind utilities;` added to `client/styles.scss` right after the required `@use '@angular/material' as mat;` (Sass forbids `@use` after any other rule, so `@use` stays at the top; Tailwind directives sit above the token layer and the emitted CSS lets components override utilities via the `!important` bridge already present in the chrome layer).

**Fonts self-hosted (client/assets/fonts/)**

| File | Size (bytes) |
|---|---|
| `Inter-Variable-Latin.woff2` | 48,256 |
| `Inter-Variable-LatinExt.woff2` | 85,068 |
| `Hind-400-Latin.woff2` | 16,216 |
| `Hind-500-Latin.woff2` | 16,788 |
| `Hind-600-Latin.woff2` | 16,612 |
| `Hind-400-Devanagari.woff2` | 74,936 |
| `Hind-500-Devanagari.woff2` | 71,192 |
| `Hind-600-Devanagari.woff2` | 71,512 |
| `InstrumentSerif-400.woff2` | 21,032 |
| `InstrumentSerif-400-Italic.woff2` | 22,128 |

- Source: Fontsource CDN mirrors of the OFL-licensed Google Fonts originals.
- `client/styles.scss` gained matching `@font-face` blocks with `font-display: swap` and `unicode-range` values split by Latin / Latin-Extended / Devanagari so browsers only fetch subsets they need.
- `client/index.html` — removed Google Fonts `<link rel="preconnect">`, the CSS `<link>` for Inter/Hind/Instrument Serif, and the Material Icons `<link>`. Replaced with three local `<link rel="preload" as="font" type="font/woff2" ...>` tags for Inter Variable, Hind 400 Devanagari, and Instrument Serif 400.
- `client/assets/partials/_themes.scss` — dropped its Google Fonts `@import url(...Inter...)` and switched the `body { font-family: ... }` fallback to `'Inter', 'Hind', system-ui, sans-serif`.
- Parent `angular.json` already had `client/assets` on the build/test `assets` array, so no change needed there. Fonts are served at `/assets/fonts/*.woff2` and the served CSS + HTML contain **zero** references to `fonts.googleapis.com` (one remaining Google Fonts `@import` for Rajdhani lives in `client/app/modules/orders/components/print-invoice/print-invoice.component.scss` — that file is in Workstream D's list and was not touched).

**Spartan / helm primitives adopted**

- **Login page** — inputs use `.hlm-input` (border, focus ring, invalid state, placeholder), submit CTA uses `.hlm-btn .hlm-btn-primary`, theme toggle uses `.hlm-btn-icon`. All are `@layer components` recipes composed from Tailwind utilities that reference Workstream B's tokens; login SCSS shrank from ~370 to ~280 lines.
- **Navbar** — theme-toggle button uses `.hlm-btn-icon`; navbar SCSS shrank by ~30 lines. Sidebar mobile toggle button + pin toggle remain on the existing Bootstrap `.btn .nav-link` chrome — they're Bootstrap-driven, not Material.
- **Dashboard** — **not touched.** The dashboard component (`client/app/modules/dashboard/components/main/**`) is in Workstream D's list and D had active uncommitted edits there during this pass. The dashboard already reads B's tokens end-to-end from the earlier reskin, so refactoring its FA icons to Lucide has been deferred. Recommend a follow-up pass once D's dashboard/orders/models work has landed.

**Icons swapped to Lucide (`@ng-icons/lucide`)**

- `lucideSun` + `lucideMoon` — theme toggle button (login + navbar).
- `lucideArrowRight` — login sign-in CTA affordance.
- `lucideCircleAlert` — login form error banner.
- `lucideMenu` — navbar sidebar toggle + pin toggle.
- `lucideSearch` — provided but not yet rendered (declared for the upcoming search-input primitive; kept in the provider so `<ng-icon name="lucideSearch">` is one edit away).
- Icons are provided via `provideIcons({...})` in each component's `viewProviders`, keeping tree-shaking honest.

**Test result summary**

- `npx ng test --watch=false --browsers=ChromeHeadless` — **7 tests SUCCESS**, no new warnings introduced.
- `ng serve --configuration=development --port=4201` — dev server up cleanly (verified after temporarily stashing Workstream D's WIP model + template edits, per the concurrency rule; the stash was popped and D's WIP has since been committed by D as `3275e63`). Sass @import deprecation warnings unchanged from baseline. Confirmed at runtime:
  - `/styles.css` contains zero `fonts.googleapis.com` references.
  - `/assets/fonts/Inter-Variable-Latin.woff2` (and siblings) return HTTP 200 with `Content-Type: font/woff2`.
  - Served `index.html` contains only the three local `<link rel="preload">` font tags.

**Deferred / cannot verify inside this workstream**

- Full `npx ng build` from a fresh working tree currently fails on Workstream D's in-progress `client/app/modules/orders/components/print-invoice/print-invoice.component.html`, which references `product.SGST`, `product.CGST`, `product.discount`, `_InvoiceData?.totalSgst` etc. that D removed from the models but has not yet updated on the template. Those files are in D's list and I did not touch them. Once D commits the corresponding template edits, `ng build` should be green end-to-end.
- Dashboard reskin (FA icons to Lucide, hand-rolled utility CSS to Tailwind) — **deferred** because `client/app/modules/dashboard/**` is in D's list.
- Spartan `hlm-form-field` / `hlm-dialog` / `hlm-select` / `hlm-tabs` primitives are not adopted; the login form only needs input + button. Full-app Material-to-Spartan migration remains a later Phase 1 task, aligned with when customers/inventory/orders come off Material.
- Rajdhani font Google Fonts `@import` in `print-invoice.component.scss` — pending, in D's scope.

**Explicit files touched**

Inside the parent repo (branch `integration/modernization-2026-07-17`, commit `f700e09`):
- `package.json`
- `package-lock.json`
- `tailwind.config.js` (new)
- `postcss.config.js` (new)

Inside `client/` submodule (branch `redesign/ui-modernization`, commit `f9b648c`):
- `styles.scss`
- `index.html`
- `assets/partials/_themes.scss`
- `assets/fonts/Inter-Variable-Latin.woff2` (new)
- `assets/fonts/Inter-Variable-LatinExt.woff2` (new)
- `assets/fonts/Hind-400-Latin.woff2` (new)
- `assets/fonts/Hind-500-Latin.woff2` (new)
- `assets/fonts/Hind-600-Latin.woff2` (new)
- `assets/fonts/Hind-400-Devanagari.woff2` (new)
- `assets/fonts/Hind-500-Devanagari.woff2` (new)
- `assets/fonts/Hind-600-Devanagari.woff2` (new)
- `assets/fonts/InstrumentSerif-400.woff2` (new)
- `assets/fonts/InstrumentSerif-400-Italic.woff2` (new)
- `app/modules/login/components/login.component.{ts,html,scss}`
- `app/shared/components/navbar/navbar.component.{ts,html,scss}`

The parent submodule-pointer bump is intentionally **not** included; the reconciler picks up the client commit at integration time per the workstream contract.
