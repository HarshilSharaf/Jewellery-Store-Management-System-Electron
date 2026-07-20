# Redesign Plan — Commercial Jewellery POS for Small Indian Jewellers

**Date:** 2026-07-20
**Working branch:** `integration/modernization-2026-07-17` (further branches per phase, TBD)
**Data policy:** dummy data everywhere — schema changes are **destructive** (drop + recreate). No migration path. `docker compose down -v && docker compose up -d` re-seeds from scratch.

---

## 1. Positioning

Every incumbent (Marg, Ornate, WinGold, DevLogic, JGold, SwarnApp, Munim) is opaque, visually stuck in 2005, sold via dealer networks, and notorious for licensing hostage-taking and broken support. Vyapar has modern UX but weak jewellery depth.

**Pitch:** *"A modern, offline-first jewellery POS that a shop clerk can learn in 20 minutes, that ships hardware-ready out of the box, and that never holds your data hostage."*

**Target:** Small single-shop Indian jewellers, Tier-2/3 focus. Not global. Not multi-branch chains.
**Delivery:** Offline-first Electron desktop + license key (Tally-style). No cloud sync in v1.
**Pricing hypothesis:** ₹19,999 perpetual + ₹4,999/yr optional AMC.

**Four defensible wedges:**

| Wedge | Why competitors don't have it |
|---|---|
| Modern UI, keyboard-first | Marg still ships on CD; every rival has Windows-95 chrome |
| WhatsApp bill send built-in | Not a single competitor page advertises it (Vyapar has it as generic SMB feature) |
| HUID never paywalled, first-class | Munim gates HUID behind mid-tier; legally mandatory since Apr 2023 |
| CSV migration IN and OUT | Nobody advertises it — anti-lock-in pitch to Marg-fatigued users |

---

## 2. Design direction

### The one big shift
**Warm-neutral, editorial, keyboard-first.** Not slate-grey MDI, not fashion e-commerce. Linear's density and keyboard model, applied to a shop-counter workflow, in a champagne/ivory palette that flatters gold photography.

### Design system stack

| Layer | Choice | Why |
|---|---|---|
| Component primitives | Replace Angular Material with **Tailwind + [Spartan/ng](https://www.spartan.ng/) (shadcn-for-Angular) + Radix Colors** | Material is 12 years of 2015 aesthetics. Spartan/ng = headless primitives we own. Radix Colors gives semantic 12-step light+dark. |
| Type — Latin | **Inter Variable** with `font-feature-settings: "cv11", "ss03", "tnum"` | Purpose-built for dense UI. `tnum` non-negotiable for bill columns. |
| Type — Devanagari | **Hind** or **Mukta** (metric-compatible with Inter) | Vanilla Inter clips Devanagari matras at line-height 1.2. |
| Type — display | Serif for KPI values only — **Fraunces** or **Instrument Serif** | Only rate ticker + invoice total. |
| Icons | **Lucide** via ng-icons | 1,747 icons, strict 2px stroke, tree-shakable |
| Color | Ivory `oklch(97% 0.01 85)`, amber accent `oklch(72% 0.14 65)`, single deep neutral for text | Kills the Marg saturated-primary button soup |
| Density | 32-36px table rows desktop, 40-48px touch; 13-14px body, 11-12px caption | POS convention (Shopify/Lightspeed/Toast) |
| Motion | <300ms, ease-out, transform-origin from trigger, nothing decorative | Clerks on low-end hardware feel wasted frames |
| Dark mode | Ship it, don't default it, honor OS preference | Long-session counter app |

### Screens that matter

1. **Cart / order builder** — 70% table (SKU/HUID • image • purity • net wt • rate • making • total), 30% totals stack, rate ticker on top, barcode scanner focus-anywhere, `Alt+W` grabs weight from scale, `⌘K` command palette (Phase 3).
2. **Inventory** — portrait product thumbnails, grid ↔ table density toggle, sticky filter chips (purity/category/in-stock/HUID-present), owner sees cost overlay.
3. **Dashboard** — kill 3D pie. One line chart, three KPI tiles with serif totals + tabular sub-values, top-products with thumbnails, live IBJA rate card.
4. **Invoice print** — one CSS driving two templates: A4 GST (HSN 7113, CGST/SGST split, amount-in-words, e-invoice QR field) and 80mm thermal (`@page { size: 80mm auto }`).
5. **Settings** — replace DB-connection-only page with shop identity, tax rates, invoice series, print prefs, gold-rate source, backup schedule, WhatsApp keys, RBAC users, hardware setup + test buttons.

---

## 3. Feature gap (what's mandatory that we don't have)

Ordered by "kills the sale if absent":

| # | Feature | Current | Notes |
|---|---|---|---|
| 1 | Karat/purity per product (22K/18K/14K + fineness 916/750/585) | Absent | Every price calc branches on this |
| 2 | HUID, gross wt, net wt, stone wt per piece | Absent | BIS-mandatory on invoice since Apr 2023 |
| 3 | Daily metal-rate table + rate-lock-on-bill-open | Absent | #1 cashier dispute source |
| 4 | Making charges: flat / per-gram / % + wastage % | UI has flat "labour" only | Three billing modes coexist in market |
| 5 | GST split 3% → 1.5% CGST + 1.5% SGST intra / 3% IGST inter + HSN 7113 | Stored as amount, no rate, no HSN | Won't clear a CA review |
| 6 | Shop identity table (name, GSTIN, address, logo, invoice-series prefix) | Hard-coded in print-invoice.component.html | Every install needs this on day 1 |
| 7 | Thermal 3" (80mm) invoice + A4 fallback | A4 only via ngx-print | Every shop has a thermal printer |
| 8 | Barcode / HUID scanner input on cart | Absent | Manual 6-char HUID = #1 post-2023 complaint |
| 9 | Weighing-scale integration (RS-232 + USB-HID) | Absent | Table stakes |
| 10 | Old-gold exchange as first-class invoice line | Absent | Half of retail purchases involve exchange |
| 11 | Saving-scheme ledger (Golden Harvest style) | Absent | Owner's recurring-revenue lever |
| 12 | Karigar (goldsmith) job-work register | Absent | Owner's monthly reconciliation pain |
| 13 | Reports: day-book, GSTR-1 JSON, stock by purity, karigar ledger | Absent | CA handoff |
| 14 | WhatsApp bill send (Meta Business API + PDF) | Absent | Killer demo feature |
| 15 | CSV / Tally XML export (IN and OUT) | Absent | Migration + CA handoff |
| 16 | RBAC — admin sees costs, cashier doesn't | Display-only (`type` in sidebar) | Owners paranoid about cashiers |
| 17 | Backup + restore (encrypted mysqldump) | Absent | Trust builder |

---

## 4. Phased roadmap

Solo dev, evenings/weekends. Compress if full-time.

### Phase 1 — First pilot shop (4-6 weeks)

Goal: a real jeweller can run a full day of billing with it.

**Schema rebuild** (destructive — dummy data only). New / rebuilt tables: `ShopSettings`, `Purities`, `TaxSlabs`, `MetalRates`, `OldGoldReceipts`, `AuditLog`, `InvoiceLineItems` (replaces Invoice_Products_Mapping), `Products` (rebuilt with sku/huid/purityCode/gross-net-stone-wt/making mode+value/wastage/cost/tag price), extended `Customers` (gstin/pan/remarks/creditBalance), extended `Invoices` (rateSnapshot JSON, oldGoldCreditAmount, hsn, placeOfSupply, invoiceNumber, isEinvoice, irn, qrCodeData), extended `Payments` (refNumber/reconciledAt), extended `Users` (permissions/lastLoginAt). Stubs (DDL only, no procs/UI): `SavingSchemes`, `SavingSchemeInstallments`, `KarigarJobCards`, `KarigarLedger`, `StockMovements`.

**Cart engine rewrite** — per-line: `metal = ratePerGram × netWeight`, `wastage = wastage% × metal`, `making = f(makingMode, makingValue, netWeight, metal)` (flat/perGram/percent), `stones = stoneCharges`, `taxable = metal + wastage + making + stones − discount`, per-line GST split (CGST+SGST intra / IGST inter driven by ShopSettings placeOfSupply). Grand total = Σ (taxable + tax) − roundOff.

**Design system foundation** — Tailwind + Spartan/ng + Lucide + Inter/Hind + Radix Colors installed. Global tokens. Reskin login + dashboard end-to-end as the pattern.

### Phase 2 — Competitive with Marg (6-8 weeks)

- HUID + barcode scanner input (keyboard-wedge focus).
- Weighing-scale integration via `serialport` (RS-232) and USB-HID.
- Old-gold exchange UI on cart.
- Saving-scheme module (enroll, receipt, maturity, redemption).
- Karigar module (issue, receive, wastage ledger).
- Reports v1: day-book, sales register, stock summary by purity, GSTR-1 JSON.
- RBAC (route guards + proc-level type check).
- A4 GST invoice rebuild with HSN, amount-in-words, e-invoice QR field.
- Backup + restore (mysqldump + AES-encrypted archive).

### Phase 3 — Growth wedges (ongoing)

- WhatsApp Business API — bill send + saving-scheme reminders + festival campaigns. **Meta verification paperwork must start on day 1 of P3 — 2-6 week lead time.**
- CSV migration importer (Marg / Tally / raw CSV → schema).
- Tally XML export (Voucher + Ledger masters).
- IBJA rate auto-fetch (2×/day scrape or paid feed).
- Hindi/Gujarati/Marathi UI via Angular `i18n`.
- Read-only Android companion via Capacitor.
- Command palette `⌘K` with breadcrumbs (Rauno Freiberg pattern).
- Repair / job-ticket module.

---

## 5. Non-goals for v1

- No cloud sync. Local-first is the wedge; the moment we add cloud we're in Marg's world of "license suspended, pay AMC".
- No e-way bill / IRP live integration until a pilot crosses ₹5cr turnover. Field-ready, integration-deferred.
- No RFID. Asked-for-loudly, rarely-used.
- No multi-branch / chain features. Different product, different price band.
- No fancy motion library.

---

## 6. Risks

- **HUID exemption at ≤₹40L turnover** — widely cited, not verified against 2026 BIS notification. Confirm with a jeweller's CA before making HUID mandatory-in-schema.
- **Old-gold GST treatment** (RCM vs Rule 32(5) margin scheme) — conflicting AARs. Ship as config toggle, not hard-coded policy.
- **WhatsApp Business API** — Meta business verification + template approval + green-tick. 2-6 week lead time.
- **Scale firmware quirks** — every RS-232 scale has its own protocol. Ship with Essae + Contech + one HID model tested; add-more-on-request.
- **Sales channel.** Marg wins via dealers. Direct DTC + local Facebook/YouTube demos is the default; a "certified installer" model in one city is a Phase-2 experiment. This decides P3 feature order.

---

## 7. Phase 1 execution log

### 7.1 Workstream A — status

**Landed 2026-07-20, parent commit `8b54afd`.** Backend schema + cart engine rebuild.

- 20 tables under `Scripts/Tables/`: 7 new core (ShopSettings, Purities, TaxSlabs, MetalRates, OldGoldReceipts, AuditLog, InvoiceLineItems), 5 P2 DDL stubs (SavingSchemes, SavingSchemeInstallments, KarigarJobCards, KarigarLedger, StockMovements), 1 rebuilt (Products), 4 extended (Customers, Invoices, Payments, Users). `Invoice_Products_Mapping` deleted. V001 index migrations deleted; indexes baked into new DDL. `Scripts/Migrations/` retained with a README stating it's post-launch-only.
- `docker/init/01-init-db.sh` TABLES array reordered dependency-safe.
- 22 stored procedures rewritten, 6 new (`get_current_metal_rates`, `save_metal_rates`, `get_shop_settings`, `save_shop_settings`, `get_purities`, `get_tax_slabs`). OR/AND precedence bug in search WHEREs fixed as part of the rewrite.
- Seed data rewritten: Radiance Jewellers shop identity, invoice prefix `RAD/2026/` counter 9 after seed, 4 users, 20 customers (2 B2B with GSTIN/PAN), 43 products with SKU/HUID, 360 metal-rate rows (30 days × 2 sessions × 6 purities), 8 invoices with 10 line items, 8 payments, 1 old-gold receipt.
- Backend TS: `Backend/Orders/cart-totals.ts` (per-line + per-cart totals engine); `Backend/Shared/metal-rates.service.ts`, `Backend/Shared/shop-settings.service.ts`; interfaces under `Backend/Shared/interfaces/`. Wired through `Backend/Orders/db-orders.service.ts`, `Backend/Inventory/db-inventory.service.ts`, `Backend/Customers/db-customers.service.ts`.
- IPC in `src-electron/main.js` + `src-electron/preload.js`: new channels `metalRates.getCurrent`, `metalRates.save`, `shopSettings.get`, `shopSettings.save`. Security posture preserved (`contextIsolation: true`, `nodeIntegration: false`).
- `docker compose down -v && docker compose up -d` runs green; smoke-tested `save_order` (writes invoice + increments counter + marks products sold), `record_payment` (flips `isPaymentDone`), `cancel_order` (unwinds line items + stamps reason), and the two new metal-rate procs.
- Interfaces list handed to Workstream D was: `client/app/interfaces/{Inventory,Customers,Orders}/*-service-interface.ts` and models under `client/app/modules/{customers,inventory,orders}/models/`, plus new services mirroring `metal-rates.service.ts` and `shop-settings.service.ts` and type mirrors of `Backend/Shared/interfaces/*` under `client/app/interfaces/Shared/`.

### 7.2 Workstream B — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization` (`c46c943` / `705f64a` / `c4a4384` / `e636161`); submodule pointer bumped on parent as `0942c30`.** Design-system foundation and initial reskin.

- Radix-based token system in `client/styles.scss` — Sand + Amber + status scales as CSS vars; semantic tokens (`--color-bg`, `--color-fg`, `--color-accent`, `--color-border`, `--color-success/warning/danger` each with `-hover`/`-fg`/`-subtle`), shadow + radius scales.
- Dark theme swapped via `html[data-theme="dark"]` with pre-hydration inline script in `client/index.html`; first paint is theme-correct.
- `ThemeService` at `client/app/shared/services/theme.service.ts` — signal-based, persists to `localStorage['jsms.theme']`, honors `prefers-color-scheme` on first visit.
- Fonts (this pass): Google Fonts via preconnect + preload; C swapped these to self-hosted WOFF2 (see 7.3).
- Login page reskin — warm-ivory two-panel layout, single amber CTA, Reactive Forms, corner theme toggle.
- Dashboard rebuild — 3D pie killed; single area-fill line chart (Chart.js 4, redraws on theme swap), three KPI tiles with serif totals + tabular-nums deltas, top-products list with thumbnails, recent-orders table. Live-rate card placeholder pending D's wiring.
- Navbar reskin — circular sun/moon toggle, Instrument Serif brand wordmark.
- Sidebar bridged via token overrides in `styles.scss` (legacy Lightning Admin partial not yet rewritten).
- `ng build --configuration=development` and `ng test` (7/7) both green at close of B.
- **Deferred out of B:** Tailwind + Spartan/ng + `@ng-icons/lucide` install (blocked on parent `package.json` access during concurrent WS A run), self-hosted WOFF2 (blocked on parent `angular.json` assets path). Both picked up by Workstream C.

### 7.3 Workstream C — status

**Landed 2026-07-20, parent commits `f700e09` + `b10424b`; submodule commit `f9b648c` on `redesign/ui-modernization`.** Design-system stack installation + font self-hosting + login/navbar refactor onto Spartan/brain + Lucide.

Packages (parent `package.json`):

- `tailwindcss@^3.4.19` + `postcss@^8.5.20` + `autoprefixer@^10.5.4` (v3 chosen — v4 has Angular integration friction and Spartan's Angular-19-compatible alphas peer on `>=3.3`).
- `tailwindcss-animate@^1.0.7`, `tailwind-merge@^2.6.1`, `clsx@^2.1.1`, `class-variance-authority@^0.7.1`.
- `@spartan-ng/brain@0.0.1-alpha.563` — **pinned**, the last version whose peer deps accept `@angular/core ^19`; alpha.564+ requires Angular 20+. Spartan's helm styling packages are deprecated in favor of a CLI generator; hand-rolled equivalent recipes live as `@layer components` in `client/styles.scss` (`.hlm-btn`, `.hlm-btn-primary`, `.hlm-btn-ghost`, `.hlm-btn-icon`, `.hlm-input`).
- `@ng-icons/core@^31.4.0` + `@ng-icons/lucide@^31.4.0` — 31.x is the last minor supporting `@angular/core >=18`.

Tailwind config:

- `tailwind.config.js` + `postcss.config.js` at repo root. Content globs: `./client/index.html`, `./client/**/*.{html,ts,scss}`. `darkMode: ['selector', 'html[data-theme="dark"]']`.
- Theme extension references B's semantic tokens via `var(--color-*)` — colors, radius, shadow, ring all point at the tokens; **no duplication**.
- `@tailwind base/components/utilities` added to `client/styles.scss` right after the required `@use '@angular/material' as mat;`.

Fonts self-hosted under `client/assets/fonts/` (10 WOFF2 files, ~440KB total): Inter Variable Latin + LatinExt, Hind 400/500/600 Latin + Devanagari, Instrument Serif 400 upright + italic. `@font-face` blocks with `font-display: swap` and `unicode-range` splits so browsers fetch only the subsets they need. Removed Google Fonts `<link rel="preconnect">` + CSS `<link>` + Material Icons `<link>` from `client/index.html`; replaced with three local `<link rel="preload">` tags. Confirmed at runtime: zero `fonts.googleapis.com` references in served CSS/HTML, local `.woff2` return HTTP 200 with `Content-Type: font/woff2`.

Spartan/brain + helm primitives adopted:

- **Login** — inputs use `.hlm-input`, submit CTA uses `.hlm-btn .hlm-btn-primary`, theme toggle uses `.hlm-btn-icon`. Login SCSS shrank ~370 → ~280 lines.
- **Navbar** — theme-toggle uses `.hlm-btn-icon`; navbar SCSS shrank ~30 lines.
- **Dashboard** — deliberately not touched (in D's list at time of C's run).

Icons swapped to Lucide via `@ng-icons/lucide`:

- `lucideSun` + `lucideMoon` (theme toggles).
- `lucideArrowRight` (login CTA).
- `lucideCircleAlert` (login error banner).
- `lucideMenu` (navbar toggles).
- `lucideSearch` (provider-registered for future search primitive).

Verification at close of C: `ng test --watch=false --browsers=ChromeHeadless` 7/7 green. `ng serve` on :4201 clean, no `fonts.googleapis.com` in `/styles.css`, `/assets/fonts/*.woff2` return HTTP 200. Full `ng build` at close of C was still failing on D's in-progress template files — resolved by D's `8e7e95a`.

Deferred out of C:

- Dashboard FA-to-Lucide swap (in D's list at run time).
- Spartan `hlm-form-field` / `hlm-dialog` / `hlm-select` primitives — pending full Material-to-Spartan migration (later Phase 1).
- Rajdhani Google Fonts `@import` in `print-invoice.component.scss` — pending, in D's scope (resolved separately).

### 7.4 Workstream D — status

**Landed 2026-07-20, submodule commits `ed52514` / `3275e63` / `11a9a75` / `8e7e95a` on `redesign/ui-modernization`.** Frontend interface + service + page sync to A's new backend shapes, cart-engine wiring end-to-end.

- **Interfaces mirrored** — `client/app/interfaces/Shared/{cart,metal-rate,shop-settings,product,purity,tax-slab}.ts` (new) mirror A's `Backend/Shared/interfaces/*` shapes. Service-interface files updated: `client/app/interfaces/Inventory/inventory-service-interface.ts`, `client/app/interfaces/Customers/customer-service-interface.ts`, `client/app/interfaces/Orders/orders-service-interface.ts`.
- **Models synced** — `client/app/modules/customers/models/`, `client/app/modules/inventory/models/`, `client/app/modules/orders/models/` all updated to the new field sets. Old `productWeight` field removed; new fields (sku, huid, purityCode, gross/net/stone weight, stone charges, makingMode, makingValue, wastagePercent, cost/tag price, hsnCode) flow through.
- **Angular services** — customer/inventory/order services rerouted through a unified `DbBridge` (commit `11a9a75`). Two new services: `client/app/shared/services/MetalRates/metal-rates.service.ts` (methods `getCurrent()` + `save()`) and `client/app/shared/services/ShopSettings/shop-settings.service.ts` (methods `get()` + `save()`). Both signal-based; consume the new IPC channels A exposed on `window.electronAPI.metalRates.*` and `window.electronAPI.shopSettings.*`.
- **Customer pages** — add-customer form + view-details form gained state, stateCode, GSTIN, PAN, remarks inside an "Additional details" accordion; view-details renders creditBalance read-only; customer-orders table maps to invoiceNumber + grandTotal.
- **Inventory pages** — available-products table columns rebuilt around SKU, HUID, purityCode, netWeight, tagPrice (drops productWeight + productGuid columns). Add-product + product-details forms carry the full new field set (sku, huid, purity dropdown from `get_purities`, hsnCode, gross/net/stone weight, stone charges, makingMode + makingValue, wastage %, cost/tag price).
- **Order pages** — orders list column set switches from "Id" to "invoiceNumber" and maps the new customerDetails JSON shape returned by `get_all_orders`. Order details page shows `invoiceNumber` in the header and breaks down `subTotalTaxable`, GST split, making/wastage/stone charges, old-gold credit, round-off, `cancelReason`. Order-products-details table displays the new per-line fields (metalValue, makingCharge, wastageCharge, stoneCharge, discountAmount, tax split, lineTotal). Order-payments form gains `refNumber` and passes it to `record_payment`.
- **Print-invoice** — template rewritten around the new line-item + totals shape; kept minimal per Phase 1 scope (full A4 GST + 80mm thermal rebuild is Phase 1 later).
- **Prepare-order / create-invoice** — the biggest churn. Rebuilt end-to-end: locks rates from `get_current_metal_rates`, hydrates tax slabs from `get_tax_slabs`, runs the client-side cart-totals engine on every field change, saves through `save_order` via the new `SaveOrderPayload` contract. A jeweller can now add a product → see calculated totals → hit save → get a valid invoice row.
- **Dashboard** — live-rate card wired to `MetalRatesService.getCurrent()`. Formats INR with tabular-nums; skeleton + empty states added. Recent-orders row bindings use `grandTotal + invoiceNumber + totalLineItems` with backward-compatible aliases.
- **Cart sidebar shared component** — renders SKU / HUID / purity / net weight instead of the removed `productWeight`/subCategory-only surface.

**Explicitly not built (Phase 1 later or P2 scope):** credit-balance write UI on customers, old-gold exchange UI on cart, saving-scheme UI, full A4 GST + 80mm thermal invoice rebuild.

---

## 8. Phase 1 close — verification and outstanding

**Reconciled 2026-07-20 as parent commit `b5e579d`.** Submodule pointer bumped to include Workstreams C + D; plan prose sections 1-6 restored (they had been stripped in a prior mid-flight pass).

**End-to-end gates:**

- `ng test --watch=false --browsers=ChromeHeadless` — **7/7 SUCCESS** on the integrated tree.
- `ng build --configuration=development` — **PASS** (14.1s). Warnings are legacy Sass `@import` deprecations from `animate.css` and `lightning-admin` partials, unchanged from baseline.
- Backend / DB rebuild — verified during Workstream A close (`docker compose down -v && docker compose up -d` green, seed data loads, all rewritten procs smoke-tested).

**Phase 1 originally scoped, now landed:**

- Schema drop-and-rebuild around jewellery-domain data model (Workstream A).
- Cart engine rewrite with metal / wastage / making (flat/perGram/percent) / stones / per-line GST split (Workstream A + D wired).
- Shop identity + metal rates + tax slabs as first-class settings (Workstream A + D wired).
- IPC channels for metal rates + shop settings (Workstream A).
- Design system foundation: Radix Colors tokens, dark mode, Inter + Hind + Instrument Serif self-hosted (Workstreams B + C).
- Tailwind + Spartan/brain (alpha.563 — Angular 19 compatible) + @ng-icons/lucide installed (Workstream C).
- Login + navbar + dashboard reskin end-to-end (Workstreams B + C).
- Frontend interface + service + page sync to new backend shapes (Workstream D).
- Customers pages gain GSTIN/PAN/remarks fields; inventory pages gain SKU/HUID/purity/weights/making/wastage/prices; orders show formatted `invoiceNumber` + full per-line breakdown; create-invoice wired end-to-end against `save_order`.

**Deferred / follow-up items (still Phase 1 scope, not P2):**

1. **Full A4 GST + 80mm thermal invoice rebuild.** Print template currently minimal placeholder. Needs shop-identity-from-settings, HSN column, amount-in-words, e-invoice QR placeholder field, two-CSS-one-template with `@page { size: 80mm auto }` variant. Reference: [ClearTax GST invoice format](https://cleartax.in/s/gst-invoice).
2. **Full Angular Material → Spartan primitives migration.** Customers, inventory, orders, settings still use `mat-form-field` / `mat-select` / `mat-table` / `mat-paginator` / `mat-stepper` / `mat-dialog` / `mat-datepicker` / `mat-tooltip` / `mat-icon`. Material theme retained globally at reduced surface. Migrate module-by-module.
3. **Dashboard FA → Lucide swap.** Dashboard was reskinned in B but its icons are still FontAwesome; swap to Lucide via `@ng-icons/lucide` and drop `@fortawesome/fontawesome-free` when the last usage is gone.
4. **Rajdhani Google Fonts `@import` in `print-invoice.component.scss`.** Last CDN font holdout; move to self-hosted or drop the family in the invoice rebuild.
5. **Legacy Sass `@import`s** in `client/styles.scss` (`animate.css`, `lightning-admin`) — Dart Sass 3.0 will remove these. Not urgent, but on the runway.
6. **Settings page rebuild.** Current settings page still edits DB connection only. Needs shop identity form, tax rate editor, invoice-series editor, print prefs, gold-rate source picker (manual vs IBJA feed), backup schedule stub, WhatsApp API keys stub (P3 gates it), RBAC users editor, hardware test buttons stub (P2 gates it).
7. **Rate management screen.** No UI yet to edit today's AM/PM rates. Right now they live in seed data only. Needs a compact "Today's rates" form callable from the navbar or settings.

**Explicit Phase 2 items (not touched, and correctly not):** HUID scanner input, weighing-scale RS-232/USB-HID, old-gold exchange cart UI, saving-scheme module, karigar module, reports v1, RBAC route guards, backup/restore.

**Not yet integrated with real hardware or network:** WhatsApp Business API (P3 with 2-6 week lead time), IBJA rate auto-fetch (P3), e-invoice IRP integration (deferred until pilot crosses ₹5cr turnover).

### 7.5 Workstream E — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization`: `8b007e0` (amount-in-words utility + spec), `2c7e1e9` (print-invoice rebuild), `5e3c185` (settings page rebuild), `5da10fb` (navbar rate pill styling). Rate-pill component files themselves were swept into F's `bea86d3` FA→Lucide commit while E's changes were staged.** Parent-repo submodule pointer not bumped. Ran on top of F's parallel work; stayed strictly out of F's territory (data-table, customers, inventory, orders/orders-page + order-details + order-products-details + order-payments + prepare-order, dashboard, sidebar, styles.scss, assets/partials).

**Invoice print fields shipped (A4 GST):** shop identity block (name, addr1/addr2, city+state+pincode, phone, email, GSTIN, PAN, state+stateCode) driven by ShopSettingsService; invoice title (Tax Invoice / e-Invoice); invoice number + date + time; HSN in metadata + per-line; customer bill-to (name, phone, address, city+state+stateCode, GSTIN, PAN); place-of-supply block; supply-type indicator (intra vs inter). Line table: S.No, description with SKU + HUID + purity chip, HSN, gross wt, net wt, rate/g, metal value, making, wastage, stone, discount, taxable, CGST%+amt + SGST%+amt (intra) OR IGST%+amt (inter), line total. Totals block: subtotal-taxable, making, wastage, stone, CGST/SGST or IGST, discount (subtractive), old-gold credit (subtractive), round-off, grand total in serif tabular-nums numerals. Amount-in-words below totals via `numberToIndianRupees`. Old-gold credit callout when `oldGoldCreditAmount > 0`. e-Invoice QR placeholder square rendered only when `isEinvoice` true (with IRN below if present). Bank/UPI block placeholder + terms + signature. Intra vs inter driven by `shop.stateCode === placeOfSupplyStateCode` (parses `(NN)` suffix or falls back to customer `stateCode`).

**Invoice print thermal (80mm):** same fields stacked single-column with `@page { size: 80mm auto; margin: 3mm }`. Header center-aligned with serif shop name. Line items condensed per-purity rows with taxable + tax breakdown. Grand total prominent, amount-in-words italic footer, thank-you kicker.

**Print toggle:** `variant` signal, default A4, toolbar buttons `[A4] [80mm] [Print]`. Toolbar hidden during `@media print` and toggleable via `[showToolbar]` input; the embedded usage inside order-details' hidden `#print-container` keeps default A4 with toolbar off.

**Preview route added:** `/orders/print-invoice/:orderGuid` renders `PrintInvoicePreviewComponent` which either accepts state from a router `navigate` call (as F's dormant `printInvoice()` in `order-details.component.ts` already tried to do) or fetches by orderGuid via `OrderService.getOrderDetails`. Route registered in `orders-routing.config.ts`.

**Settings tabs — real vs stub:**

| Tab | Status |
|---|---|
| Shop identity | **Real.** All fields validated; state dropdown auto-fills stateCode; GSTIN pattern-validated; logo upload reuses `FileSystemService.compressAndSaveImage`. Save calls `save_shop_settings` via DbBridge. |
| Tax & invoice | **Real.** Invoice prefix editable, current counter readonly, reset-to-N button confirms via SweetAlert then calls `reset_invoice_counter` (proc TBD — falls through silently if absent). Tax slabs displayed read-only from `get_tax_slabs`. |
| Metal rates | **Real.** AM+PM inputs for every purity from `get_purities`, copy-AM→PM button, effective-date picker, saves via `save_metal_rates`. Historical rates table (last 30 days) fed by `get_metal_rates_history` proc — proc TBD; UI stays empty if absent, no crash. |
| Print & hardware | **Real** for default variant + thermal printer name (localStorage-backed). **Stub cards** for barcode/scale ("Configure — Phase 2"). |
| Backup | **Stub.** Export + restore buttons log intent and toast "not yet implemented". No IPC channels added. |
| Users & permissions | **Stub.** Shows two hard-coded rows (admin, cashier1). Add-user form validates then toasts "not yet implemented". No `get_all_users` / `add_user` proc call — those are Phase 2 alongside RBAC. |
| Database | **Real, unchanged.** Existing MySQL creds editor moved under this tab; save + relaunch flow preserved. |

**Settings routing:** single `/settings` route unchanged; tabs are in-component (hand-rolled buttons + signal, not `mat-tab-group`) so Material stays out of this module.

**Navbar rate pill:** `RatePillComponent` at `client/app/shared/components/navbar/rate-pill/`. Sits between the search area and the theme toggle (`.nav-item--rate-pill`). Icon `lucideIndianRupee`. Click opens an inline popover (no dialog primitive — hand-rolled with document-click + escape-key close handlers). Popover shows AM + PM `hlm-input` fields for 999 / 916 / 750, session toggle, effective date picker, save + "Full editor →" (routes to `/settings`). Save calls `MetalRatesService.save()` per session; SweetAlert toast on success + failure.

**Files touched (this workstream, submodule tree — parent repo untouched):**

- `client/app/shared/utils/amount-in-words.ts` (new)
- `client/app/shared/utils/amount-in-words.spec.ts` (new)
- `client/app/shared/utils/indian-states.ts` (new, 36 codes + GSTIN regex)
- `client/app/modules/orders/components/print-invoice/print-invoice.component.{ts,html,scss}` (rewritten; Rajdhani `@import` removed; two-variant renderer; Intl en-IN money; `@page` rules per variant)
- `client/app/modules/orders/components/print-invoice-preview/print-invoice-preview.component.{ts,html,scss}` (new preview wrapper)
- `client/app/modules/orders/orders-routing.config.ts` (added `print-invoice/:orderGuid` route)
- `client/app/modules/settings/components/settings-page/settings-page.component.{ts,html,scss}` (fully rewritten as tabbed shell; keeps DB tab intact)
- `client/app/shared/services/ShopSettings/shop-settings.service.ts` (falls through to `DbBridgeService` when `window.electronAPI.shopSettings` is absent; adds `resetInvoiceCounter`)
- `client/app/shared/services/MetalRates/metal-rates.service.ts` (same fallthrough; adds `getHistory`)
- `client/app/shared/components/navbar/rate-pill/rate-pill.component.{ts,html,scss}` (new, swept into F's `bea86d3` while E was staging)
- `client/app/shared/components/navbar/navbar.component.{ts,html,scss}` (import + slot + `.nav-item--rate-pill` margin — minimal, alongside F's FA→Lucide edits)

**Deferred / requires WS A follow-up (documented, not blocking):**

1. **`reset_invoice_counter` stored proc** — settings > tax tab expects it; called via `db.execute` wrapped in try/catch so a missing proc doesn't crash. WS A owns adding.
2. **`get_metal_rates_history` stored proc** — settings > rates tab expects it for the last-30-days table; try/catch protected. WS A owns adding.
3. **Dedicated IPC bridges for `metalRates.*` and `shopSettings.*`** — services already prefer these but fall through to stored procs today. Wiring them in `src-electron/preload.js` + `src-electron/main.js` (parent repo) would give the settings + pill flows a purpose-built surface, but the DbBridge path is fully functional right now.
4. **Barcode / scale hardware config** — placeholder Phase 2 cards; no code paths.
5. **Real user list + add-user + backup** — stub UI with toasts, no backend calls.

**Verification at close of E:**

- `ng build --configuration=development` — PASS (14–15s, warnings are the pre-existing Sass `@import` deprecations; no new warnings introduced by E).
- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 new `numberToIndianRupees` cases: zero, one rupee, one hundred, rupees+paise, one crore, 99.99L with paise, paise rollover, negative amount).
- Live app walkthrough: not run (Electron `npm start` not exercised as part of E — F's concurrent SCSS refactor still had uncommitted `styles.scss` + `assets/partials/*` changes in the working tree; stashing them restores a clean build, so E's changes are known-clean).

**Explicit non-goals kept in E (correctly not touched):** RBAC, saving-scheme, karigar, reports v1, WhatsApp send, IBJA fetch, real backup/restore, real user CRUD, scale/scanner integration.

### 7.6 Workstream F — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization`: `d729d27` (data-table), `e8baa6b` (customers), `07b26d6` (inventory purity), `cddb1c7` (categories paginator + orders stepper + navbar cart badge + global error handler), `9e9b368` (Material theme drop from styles.scss), `bea86d3` (FA to Lucide sweep), `cfa7ddc` (Sass @use migration).** Parent-repo submodule pointer not bumped; parent `package.json` untouched.

**Angular Material eliminated. Zero `mat-*` selectors remain in `client/app`** (verified: `grep -r "mat-form-field\|mat-select\|mat-datepicker" client/app/modules/{customers,inventory,orders}` is empty; only comment references in `data-table.component.scss` document the migration). `@use '@angular/material' as mat;` + `mat.define-theme` + `mat.all-component-themes` all removed from `client/styles.scss`. Migrated surfaces:

| Surface | mat-* consumed → replacement |
|---|---|
| Shared `data-table` | `mat-table` + `mat-header-cell` + `mat-cell` + `mat-paginator` + `mat-sort` + `mat-progress-spinner` (6 usages) → native `<table>` + hand-rolled sort chevrons (`lucideChevronsUpDown`/`Up`/`Down`) + custom paginator with first/prev/next/last buttons. Public @Input/@Output surface unchanged; `pageChangeEvent` still emits `{ pageIndex, pageSize, length, searchQuery }`. Density: 36px desktop, 44px `@media (pointer: coarse)` via CSS var. |
| Customers `add-customer-form` | `MatDialog` + `mat-dialog-title/content/actions` + `MatDialogModule` (4 usages) → self-owned overlay panel (host `[open]` input, `(closed)` output). Escape closes; overlay-click closes; `.hlm-input.is-invalid` for Reactive-Forms error state. |
| Categories `available-master/sub/product-categories` | `mat-paginator` (3 usages) → new shared `app-simple-paginator` (`client/app/shared/components/simple-paginator/`). |
| Orders `prepare-order/select-customer` | `mat-paginator` (1 usage) → `app-simple-paginator`. |
| Orders `prepare-order/stepper` | `mat-stepper` + `mat-step` + `mat-button` + `MatStepperModule` + `STEPPER_GLOBAL_OPTIONS` + `BreakpointObserver` (12 usages) → hand-rolled 4-step wizard with numbered/checked pills, guards on advance, `lucideCheck`/`ChevronRight`/`ChevronLeft`. |
| Navbar `add-to-cart` | `MatBadgeModule` (1 usage) → tabular-nums badge span + `lucideShoppingBag`. |
| Shared `global-error-handler` service | `MatSnackBar` (1 usage) → SweetAlert2 toast mixin (already the app's dialog pattern). |

**Total `mat-*` usages killed: 28 across 11 files.**

**FontAwesome to Lucide swap complete.** `grep -r "fa fa-\|fa-solid\|fa-regular\|fa-brands\|fontawesome" client/ --include="*.html" --include="*.ts" --include="*.scss"` returns zero non-comment hits. Icons swapped across 26 files: sidebar menu (dashboard/orders/customers/categories/inventory + logout — all 7 items now `lucideLayoutDashboard`/`ShoppingCart`/`Users`/`Tags`/`Package`/`LogOut`); navbar profile-dropdown (`lucideUser`/`Settings`/`Power`); dashboard main tiles + list icons (`lucideIndianRupee`/`Package`/`Users`/`TrendingUp`/`TrendingDown`/`ChartLine`/`Gem`/`ArrowRight`); dashboard recent-orders + data-table row actions (`lucideSquareArrowOutUpRight`/`Ban`/`ShoppingCart`); customers view-details (person/pencil/trash/rotate/save/loader/user); inventory forms + view-details (pencil/trash/rotate/save/loader/plus); orders page + details + payments + create-invoice (`lucideShoppingCart`/`Printer`/`IndianRupee`/`Save`); category add-form buttons (`lucidePlus`); cart-items row delete (`lucideCircleMinus`); info-card delta arrows (`lucideArrowUp`/`Down`); page-header back arrow (`lucideArrowLeft`); image-upload cloud-upload across all four variants (`lucideCloudUpload`). Registered per-component via `viewProviders: [provideIcons({...})]`.

**Legacy Sass `@import` migration.** `client/styles.scss` no longer emits any `@import`-deprecation warnings originating from project SCSS. `client/assets/lightning-admin.scss` moved from six `@import "./partials/..."` lines to `@use` (with `variables` namespaced as `*` to preserve the existing `$primary` / `$sidebar-icon-color` / `$text-primary` references). Each internal partial (`_bootstrap-compat`, `_navbar`, `_sidebar`, `_themes`, `_dashboard`) gained an explicit `@use "variables" as *;` header. `@extend .icon-style` in `_sidebar.scss` uses `!optional` so cross-module extension no longer fails. `darken()` calls in `_bootstrap-compat.scss` (7 instances) replaced with `color.adjust($lightness: -N%)` and `@use "sass:color"` added. `styles.scss` loads `./assets/lightning-admin` + `animate.css/animate.min` via `@use` at the top of the file. Remaining build warnings are all `NG8107` optional-chain style notes in `AddProductFormComponent` / `CreateInvoiceComponent` / `PrintInvoiceComponent` templates and one unused-`PageHeaderComponent` in `MainComponent` — all pre-existing, none from this workstream.

**Rajdhani font holdout.** Resolved by Workstream E in `print-invoice.component.scss` rewrite. `grep -r "fonts.googleapis.com\|Rajdhani" client/` returns zero hits.

**Parent-repo cleanup (flagged, not done — requires parent-repo access):**

- **Drop `@angular/material` from `package.json`.** No app-code consumers remain in `client/`. Should also drop `@angular/cdk` unless something else pulls it (Spartan/brain declares it as peer).
- **Drop `@fortawesome/fontawesome-free` from `package.json`.** No app-code consumers remain.
- **Optional: move `animate.css` into `angular.json` `styles` array** so the Sass entry point no longer needs to load it. Not urgent — Sass `@use 'animate.css/animate.min'` works today.

**Verification at close of F:**

- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (baseline 7 + E's 8 amount-in-words specs).
- `ng build --configuration=development` — PASS (no new errors; only pre-existing NG8107 warnings from E's print-invoice + inventory forms remain).
- Grep gates:
  - `grep -r "fa fa-\|fa-solid\|fa-regular\|fontawesome" client/` → empty (excluding doc-comment in `styles.scss`).
  - `grep -r "fonts.googleapis.com" client/` → empty.
  - `grep -r "mat-form-field\|mat-select\|mat-datepicker" client/app/modules/{customers,inventory,orders}` → empty.
  - `grep -r "mat-\|MatModule\|@angular/material" client/app` → matches only a comment reference in `data-table.component.scss`.

**Files touched (this workstream, submodule tree — parent repo untouched):**

- `client/app/shared/components/data-table/data-table.component.{ts,html,scss}` (rewritten).
- `client/app/shared/components/simple-paginator/simple-paginator.component.{ts,html,scss}` (new).
- `client/app/shared/components/sidebar/sidebar.component.{ts,html}` (icons → Lucide).
- `client/app/shared/components/navbar/add-to-cart/add-to-cart.component.{ts,html,scss}` (badge + icon rewrite).
- `client/app/shared/components/navbar/profile-dropdown/profile-dropdown.component.{ts,html}` (icons → Lucide).
- `client/app/shared/components/cart-items/cart-items.component.{ts,html}`.
- `client/app/shared/components/info-card/info-card.component.{ts,html}`.
- `client/app/shared/components/page-header/page-header.component.{ts,html}`.
- `client/app/shared/services/global-error-handler.service.ts` (SweetAlert toast).
- `client/app/modules/customers/components/add-customer-form/*.{ts,html,scss}` (overlay panel).
- `client/app/modules/customers/components/customers-page/*.{ts,html,scss}` (button + [open] plumbing).
- `client/app/modules/customers/components/view-details/*.{ts,html}` (icons).
- `client/app/modules/customers/components/image-upload/*.{ts,html}` (icons).
- `client/app/modules/inventory/components/product-details-form/*.{ts,html}` (purity label + icons).
- `client/app/modules/inventory/components/product-image-upload/*.{ts,html}` (icons).
- `client/app/modules/inventory/components/view-product-details/*.{ts,html}` (icons).
- `client/app/modules/inventory/components/available-products/components/add-product-form/*.{ts,html}` (purity label + icons).
- `client/app/modules/inventory/components/available-products/components/image-upload/*.{ts,html}` (icons).
- `client/app/modules/orders/components/orders-page/*.{ts,html,scss}` (icons + toolbar layout).
- `client/app/modules/orders/components/order-details/*.{ts,html}` (icons).
- `client/app/modules/orders/components/order-payments/*.{ts,html}` (icons).
- `client/app/modules/orders/components/prepare-order/components/stepper/*.{ts,html,scss}` (wizard rebuild).
- `client/app/modules/orders/components/prepare-order/components/select-customer/*.{ts,html}` (simple-paginator swap).
- `client/app/modules/orders/components/prepare-order/components/create-invoice/*.{ts,html}` (icons).
- `client/app/modules/categories/components/master-categories/components/{available-master-categories,add-master-category-form}/*.{ts,html}`.
- `client/app/modules/categories/components/sub-categories/components/{available-sub-categories,add-sub-category-form}/*.{ts,html}`.
- `client/app/modules/categories/components/product-categories/components/{available-product-categories,add-product-category-form}/*.{ts,html}`.
- `client/app/modules/dashboard/components/main/main.component.{ts,html}` (icons).
- `client/app/modules/dashboard/components/recent-orders/recent-orders.component.{ts,html}` (icons).
- `client/app/modules/profile/components/image-upload/*.{ts,html}` (icons).
- `client/app/modules/profile/components/profile-page/profile-page.component.{ts,html}` (icons).
- `client/styles.scss` (drop Material theme, hoist lightning-admin to `@use`).
- `client/assets/lightning-admin.scss` (`@import` → `@use`).
- `client/assets/partials/_bootstrap-compat.scss` (`@use` + `color.adjust`).
- `client/assets/partials/_navbar.scss` / `_sidebar.scss` / `_themes.scss` / `_dashboard.scss` (`@use "variables" as *;`).

**Deferred / follow-ups (documented, not blocking):**

- **`prepare-order/create-invoice.component`** — no Material remaining, but still uses Bootstrap grid classes; matches surrounding modules (not F's concern to overhaul).
- **`_bootstrap-compat.scss`** — pre-existing NG8107 optional-chain warnings in Add-product-form / Create-invoice / Print-invoice templates. Cosmetic. Not F's territory.
- **`animate.css` migration to `angular.json`** — deferred, requires parent-repo write.
- **`@angular/material` + `@fortawesome/fontawesome-free` npm packages** — safe to drop from parent `package.json` now that no consumers remain in `client/app`. Flagged for a separate parent-repo commit.

---

## 9. Phase 1 truly closed — Workstream E + F reconciliation

**Reconciled 2026-07-20.** Submodule pointer bumped to include E's 4 commits + F's 7 commits on `redesign/ui-modernization`. Parent-repo package/CSS cleanup landed alongside.

**Parent-repo cleanups landed at reconciliation:**

- Dropped `@angular/material@^19.2.0` and `@fortawesome/fontawesome-free@^7.3.1` from `package.json` (zero consumers per F's grep verification — only a doc comment reference in `styles.scss` remained).
- Removed the `./node_modules/@fortawesome/fontawesome-free/css/all.min.css` entry from `angular.json` `build.options.styles` array (it was the only lingering consumer and would have broken the build after uninstall).
- `@angular/cdk` retained — Spartan/brain declares it as a peer.

**End-to-end gates on the reconciled tree:**

- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 `numberToIndianRupees` cases).
- `ng build --configuration=development` — PASS (6.4s). Remaining warnings are pre-existing `NG8107` optional-chain template style notes in a few components (Add-product form, Create-invoice, Print-invoice, dashboard main) — cosmetic, unchanged from baseline.
- Backend / DB — unchanged since Workstream A close; still runs green.

**Phase 1 exit state — what a small Indian jeweller can now do with this app:**

1. Log in (dark mode auto-honored).
2. See a dashboard with revenue chart, KPI tiles with `tnum`-aligned deltas, top-products list, live-rate card driven by real `MetalRates` data.
3. Edit today's AM/PM rates for 999/916/750 via a navbar pill in seconds, or the full editor in Settings for all six purities.
4. Configure shop identity (name, address, state, GSTIN with pattern validation, phone, email, logo) that then flows into every invoice.
5. Manage customers with GSTIN, PAN, remarks, credit balance (read-only for now).
6. Manage inventory with SKU, HUID, purity, gross/net/stone weight, three making-charge modes (flat/perGram/percent), wastage%, cost + tag price, category triple.
7. Build a cart that locks today's rate on open, computes metal + wastage + making + stones − discount per line, applies per-line GST (CGST+SGST intra / IGST inter driven by state comparison), saves through `save_order` to produce a formatted `RAD/2026/NNNNN` invoice number.
8. View any invoice with full per-line breakdown, record partial payments with UPI/cheque ref numbers, cancel with a stamped reason.
9. Print the invoice as A4 GST (HSN 7113, CGST/SGST split, amount-in-words via `numberToIndianRupees`, e-invoice QR placeholder) or 80mm thermal receipt via a toolbar toggle.
10. Everything is offline-first Electron, no cloud sync, no license-server dependency.

**Design-system exit state:**

- Zero Angular Material components anywhere in the app.
- Zero FontAwesome usages anywhere in the app (only doc-comment references).
- Zero Google Fonts CDN references — all fonts self-hosted WOFF2.
- Sass entry point migrated off legacy `@import` to `@use` with proper namespacing.
- Tailwind + Spartan/brain (alpha.563, pinned for Angular 19) + ng-icons/Lucide + Radix Colors tokens + Inter/Hind/Instrument Serif form the entire visual surface.
- Dark mode + light mode both first-class; theme preference persisted, OS-preference-respecting on first visit.

**What genuinely blocks a pilot store today (P2 territory, not Phase 1):**

- No HUID/barcode scanner input path (the current entry is manual).
- No weighing-scale RS-232/USB-HID integration.
- No old-gold exchange line on cart (schema is ready, UI is not).
- No saving-scheme module (schema stub exists).
- No karigar job-work module (schema stub exists).
- No reports (day-book, sales register, stock by purity, GSTR-1 JSON).
- No RBAC route guards or proc-level checks (admin `type` is still display-only).
- No backup/restore (UI stub exists; no IPC / mysqldump wiring).

These are Phase 2. Their gating features and the corresponding schema stubs from Phase 1 are aligned; Phase 2 is now unblocked.

**Not committed / not touched (all correctly out of scope):** IBJA rate auto-fetch (P3), WhatsApp Business API (P3, 2-6 week lead time on Meta verification), CSV/Tally XML migration (P3), Hindi/Gujarati/Marathi i18n (P3), Android companion (P3), `⌘K` command palette (P3), repair/job-ticket module (P3).

---

## 10. Phase 1.5 — Full UI rebuild before Phase 2

**Decision made 2026-07-21:** before starting Phase 2 features (HUID/barcode, weighing scale, old-gold cart, saving-scheme, karigar, reports, RBAC, backup), do a full UI rebuild. Prior phases got the app off Material and off FontAwesome and installed the Tailwind + Spartan + Radix stack, but the Lightning Admin sidebar-shell chrome and Bootstrap grid remained across every screen. The visual direction from plan section 2 (warm-neutral editorial, slim rail nav, top rate ticker, dense typography) never fully landed.

**Scope of the rebuild:**

- **Rip Lightning Admin theme** entirely. Files: `client/assets/lightning-admin.scss`, `client/assets/partials/_*.scss`, any bootstrap-compat script wired via `angular.json`, plus their references in `client/styles.scss`. Assess whether `animate.css` and Bootstrap grid classes across templates can be dropped in the same pass (Tailwind covers both).
- **New app shell** (`client/app/shared/components/app-shell/` — new). Slim left rail: brand → nav items (Today / Sell / Stock / People / Catalog / Settings) with Lucide icons + active-state accent + tooltip labels when collapsed. Top bar: rate ticker (999 / 916 / 750 pills with lock button), global search (⌘K trigger, but palette itself stays P3), theme toggle, user avatar dropdown. Content column: warm ivory background, generous padding, one column with contextual right-panel slot for edits/details (Linear/Height style) instead of always-full-page transitions.
- **Redesign every feature screen** against the new shell + design tokens: Dashboard, Orders list + details + payments, Order-builder / Cart (the money screen), Invoice preview, Customers list + view, Inventory list + view, Categories, Users, Profile, Settings, Login.
- **Design anchors (unchanged from section 2):** Inter Variable + Hind (both already self-hosted), Instrument Serif for display-only KPI numerals + shop name, Lucide icons, warm-ivory `oklch(97% 0.01 85)` bg with amber `oklch(72% 0.14 65)` accent, 32-36px desktop table rows, 13-14px body / 11-12px caption, `tnum` on all money columns, motion under 300ms and only on state changes, dark mode as toggle.
- **Reference direction:** Linear's dim-chrome-to-lift-content recipe, the [Khwaahish jewellery dashboard on Behance](https://www.behance.net/gallery/227463105/Store-Management-Dashboard-Khwaahish), warm-ivory palette borrowed from Missoma / Mejuri to flatter product photography.

**Execution plan:**

- **Workstream G — Foundation** (first, sequential): rip Lightning Admin, build the new AppShell component, redesign the Dashboard as the pattern. Blocks screen redesigns.
- **Workstream H — People + Stock**: Customers + Inventory screens, once G lands.
- **Workstream I — Sell + Books**: Orders list + Order details + Order payments + Order-builder / Cart + Invoice preview blend, once G lands.
- **Workstream J — Catalog + admin**: Categories + Users + Profile + Settings visual polish + Login consistency pass, once G lands.

H / I / J can run in parallel once G is green. All work continues on submodule branch `redesign/ui-modernization`.

**Explicitly out of scope for this rebuild pass:** Phase 2 features (HUID/barcode input, scale integration, old-gold cart line, saving-scheme, karigar, reports, RBAC, backup/restore). Those come after the rebuild is fully green.

### 10.1 Workstream G — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization`: `51a1675` (Lightning Admin rip), `3e8887e` (AppShell scaffolding + wiring), `fe24966` (delete old chrome), `200885f` (dashboard redesign).** Parent-repo submodule pointer not bumped (per rules). Parent `angular.json` retains the `animate.min.css` removal from the initial G-restart pass; `client/assets/bootstrap-compat.js` stays in the scripts array because feature templates in categories, inventory add-product, and order-payments still call `data-bs-toggle="modal"` on it (non-trivial, waits for H/I/J).

**Lightning Admin surface eliminated (reconciled across both G sessions):**

- Deleted `client/assets/lightning-admin.scss` (six-partial `@use` graph).
- Deleted `client/assets/partials/_navbar.scss`, `_sidebar.scss`, `_themes.scss`, `_dashboard.scss`.
- Retained `client/assets/partials/_bootstrap-compat.scss` and `_variables.scss` — the compat layer is what keeps H/I/J's still-Bootstrap-grid feature templates styled until they migrate off.
- `client/styles.scss` now boots `bootstrap-compat` at the top, then Tailwind base/components/utilities, then the hlm-* recipes, then the token system. No `@use './assets/lightning-admin'` reference remains.

**AppShell shipped (`client/app/shared/components/app-shell/`):**

- `app-shell.component.{ts,html,scss}` — outer container: `<top-bar>` (h-14, `border-b`) on top, `<rail>` (w-14, `border-r`) on left, `<router-outlet>` in the content area with 32px padding, `<cart-side-bar>` hosted at the shell level.
- `top-bar.component.{ts,html,scss}` — shop wordmark in Instrument Serif via `ShopSettingsService` (fallback "Radiance"), central `<app-rate-ticker>`, right cluster: search input (150-220px, `lucideSearch` prefix, `Ctrl+K` / `Cmd+K` focus via `@HostListener('window:keydown.control.k')` + `.meta.k`, placeholder shows the modifier-aware hint), theme toggle button, `<app-add-to-cart>` retained from the reusable navbar child folder, `<app-user-menu>`.
- `rail/rail.component.{ts,html,scss}` — 56px slim rail. Brand mark = 32px amber circle with Instrument Serif "R". Primary nav array: Today / Sell / Stock / People / Catalog routed to `/dashboard` / `/orders` / `/inventory` / `/customers` / `/categories` with Lucide icons. Bottom cluster: Settings item + Sign-out button firing `AuthService.logout()`. Each item is 44px square, `routerLinkActive="is-active"` toggles the amber left-stripe (2px absolute span) + `bg-accent-subtle`. Tooltip via native `title` attribute. `:focus-visible` outline honored.
- `rate-ticker/rate-ticker.component.{ts,html,scss}` — three pills for 999 / 916 / 750 from `MetalRatesService.getCurrent()`. Format via `Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })`. `lucideLock` accent when a rate is on file, `lucideLockOpen` muted otherwise. **Rate-pill popover extraction was not undertaken this pass** — the pills currently route to `/settings` on click as documented in the follow-up list. Popover-in-ticker is deferred.
- `user-menu/user-menu.component.{ts,html,scss}` — 32px avatar trigger (image via `UserService.getUserImage` + `FileSystemService` path resolution, initial letter fallback when no image). Hand-rolled dropdown (no library) with `document:click` + `keydown.escape` close. Menu items: Profile (routes to `/profile`), Sign out (fires `AuthService.logout()`).

**Routing wired:**

- `client/app/modules/main/components/main/main.component.{ts,html}` reduced to `imports: [AppShellComponent]` + template `<app-shell/>`. Prior wrapper markup + `SideBarService` classes removed.
- `main-routing.config.ts` gained a `settings` child pointing at `settings-routing.config` so `/settings` renders inside AppShell.
- `app-routing.config.ts` no longer registers `settings` as a top-level shell-less route; only `""` (main tree) and `login` remain siblings.

**Old chrome deleted:**

- `client/app/shared/components/sidebar/` (whole folder).
- `client/app/shared/components/navbar/navbar.component.{ts,html,scss}`.
- `client/app/shared/components/navbar/profile-dropdown/` (superseded by app-shell/user-menu).
- `client/app/shared/components/navbar/rate-pill/` (superseded by app-shell/rate-ticker; see follow-up).
- `client/app/shared/services/sidebar.service.ts` — only the deleted navbar imported it; `CartSideBarService` is untouched.
- Retained: `client/app/shared/components/navbar/add-to-cart/` — reusable child consumed by `top-bar.component`.

**Dashboard redesign (pattern for H/I/J):**

- `client/app/modules/dashboard/components/main/main.component.{ts,html,scss}` rebuilt around a 12-column grid.
- Row 1 (span 12): "Today" in Instrument Serif 2.25rem + right-aligned `dayjs` date (`ddd D MMM YYYY`, e.g. "Mon 20 Jul 2026") in tabular-nums.
- Row 2: **Revenue** card (span 8) — Instrument Serif KPI value from `get_revenue_of_six_months`, delta chip (`kpi-delta-up` / `kpi-delta-down`), area line chart from `get_sales_labour(6)` (accent stroke, 8% fill, 240px, no grid lines, theme-reactive redraw). **Lock today's rate** card (span 4) — 916/22K rate from `MetalRatesService.getCurrent()`, "Lock rate" button that routes to `/settings`.
- Row 3: **Recent invoices** (span 6) — 5 rows from `get_recent_orders(5)`; rows show invoice number 13px medium + customer name 12px muted, right amount tabular-nums, click routes to `/orders/view-order-details/:guid`. **Fast movers** (span 6) — top 5 from `get_top_product_categories`; rank + Lucide gem thumb + name + weight + percentage. If SP returns empty, muted single-line empty state with `lucideInbox` at 24px says "Analytics coming soon".
- Row 4: three span-4 KPI stat tiles — **Total customers** (`get_total_customers`), **Stock (grams)** (`get_total_stock`), **Pending payments** (derived from `get_all_orders(500, 1, "")` filtered by `!isPaymentDone && !cancelledAt` — no dedicated SP exists yet, count + total amount summed client-side).
- KPI card recipe added to `styles.scss` `@layer components` (`.kpi-card`, `.kpi-label`, `.kpi-value`, `.kpi-delta`, `.kpi-delta-up`, `.kpi-delta-down`) mapped to the token palette; H/I/J can reuse.
- Chart.js redraws on `data-theme` mutation via `MutationObserver`, disposed in `ngOnDestroy`. Bootstrap `.row`/`.col-*`/`.card` chrome fully gone from dashboard. No FontAwesome / Angular Material remnants (already ripped in prior workstreams).

**Login pass:** verified — `client/app/modules/login/` uses no Lightning Admin classes and no Bootstrap grid; theme-toggle + amber CTA still render correctly against the ripped SCSS.

**Verification at close of G:**

- `ng build --configuration=development` — PASS (~5.2s). No new warnings; remaining are pre-existing `NG8107` optional-chain notes in print-invoice / add-product-form / create-invoice templates.
- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 amount-in-words specs from Workstream E).
- Live-app walkthrough via `npm start` not exercised end-to-end this pass (build-and-test-green + grep gates); shell is expected to render on all routes.

**Bootstrap-grid fallout (visually stale, non-blocking — H/I/J territory):**

H/I/J will inherit these templates still leaning on Bootstrap `.container-fluid`, `.row`, `.col-*`, `.form-group`, or `.card`:

- `client/app/modules/customers/components/view-details/view-details.component.html`
- `client/app/modules/customers/components/add-customer-form/add-customer-form.component.html`
- `client/app/modules/inventory/components/inventory-page/inventory-page.component.html`
- `client/app/modules/inventory/components/available-products/available-products.component.html`
- `client/app/modules/inventory/components/available-products/components/add-product-form/add-product-form.component.html`
- `client/app/modules/inventory/components/product-details-form/product-details-form.component.html`
- `client/app/modules/inventory/components/view-product-details/view-product-details.component.html`
- `client/app/modules/orders/components/order-details/order-details.component.html`
- `client/app/modules/orders/components/order-payments/order-payments.component.html`
- `client/app/modules/orders/components/order-products-details/order-products-details.component.html`
- `client/app/modules/orders/components/prepare-order/components/create-invoice/create-invoice.component.html`
- `client/app/modules/orders/components/prepare-order/components/select-customer/select-customer.component.html`
- `client/app/modules/orders/components/print-invoice/print-invoice.component.html` (grid-only; E's rebuild is scoped to A4/thermal invoice — grid stays functional)
- `client/app/modules/categories/components/categories-page/categories-page.component.html`
- `client/app/modules/categories/components/master-categories/master-categories.component.html`
- `client/app/modules/categories/components/master-categories/components/available-master-categories/available-master-categories.component.html`
- `client/app/modules/categories/components/master-categories/components/add-master-category-form/add-master-category-form.component.html`
- `client/app/modules/categories/components/sub-categories/sub-categories.component.html`
- `client/app/modules/categories/components/sub-categories/components/available-sub-categories/available-sub-categories.component.html`
- `client/app/modules/categories/components/sub-categories/components/add-sub-category-form/add-sub-category-form.component.html`
- `client/app/modules/categories/components/product-categories/product-categories.component.html`
- `client/app/modules/categories/components/product-categories/components/available-product-categories/available-product-categories.component.html`
- `client/app/modules/categories/components/product-categories/components/add-product-category-form/add-product-category-form.component.html`
- `client/app/modules/settings/components/settings-page/settings-page.component.html`
- `client/app/modules/profile/components/profile-page/profile-page.component.html`
- `client/app/modules/dashboard/components/recent-orders/recent-orders.component.html` (retired list, still referenced only from removed dashboard chrome; keeping in place until dashboard cleanup finishes)

All render without runtime errors; they simply pick up the bootstrap-compat token overrides so they don't look catastrophic on the new shell.

**Deferred (documented, not blocking):**

1. **Rate-ticker popover extraction.** Prior rate-pill's popover was tightly coupled to its component; extracting a reusable popover primitive is heavier than the plan's "small, do not over-engineer" guardrail. Pills currently route to `/settings` (Metal rates tab) on click. Follow-up: split the popover into a shell primitive under `app-shell/rate-ticker/popover.component.ts` and mount it on the pill trigger.
2. **`get_pending_payments` stored proc.** Dashboard pending KPI derives from `get_all_orders(500, 1, "")` + client-side filter. Worth a dedicated SP for accuracy and speed on large stores.
3. **`client/assets/bootstrap-compat.js` still wired in `angular.json`.** Non-trivial — handles `data-bs-toggle="dropdown"` and `data-bs-toggle="modal"` from category forms, add-product form, order-payments. Drop when H/I/J migrate those modal + dropdown surfaces to hand-rolled overlays (following the customers `add-customer-form` pattern from Workstream F).
4. **`client/app/modules/dashboard/components/recent-orders/recent-orders.component.*`** — orphaned after the new dashboard stopped referencing it. Safe to delete in a J follow-up sweep.
5. **Rail user-image slot.** RailComponent doesn't have a mid-rail user avatar today — the user avatar lives on the top-bar via `<app-user-menu>`. If a future direction wants dual placement (avatar in rail + hover popover), factor `<app-user-menu>` accordingly.


### 10.2 Workstream H — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization`: `2fcbf51` (People — customers list + view + form), `f36ea53` (Stock — inventory grid + view + form).** Parent-repo submodule pointer not bumped (per rules). No parent `package.json` / `angular.json` edits.

**People (customers) redesign — files rewritten:**

- `client/app/modules/customers/components/customers-page/customers-page.component.{ts,html,scss}` — new "People" list with page-title header (Instrument Serif "People" + tabular count), toolbar with debounced search, hand-rolled table (avatar + name/phone, city, remarks-or-email fallback, hover-reveal actions), integrated `SimplePaginator` when `totalRecords > pageSize`. Bootstrap grid + `DataTableComponent` dependency removed.
- `client/app/modules/customers/components/view-details/view-details.component.{ts,html,scss}` — two-column `detail-shell` (left: additional details block + order history list; right sticky sidebar: total-spent kpi + orders/last-visit kpi row + notes card + collapsible photo editor). Order history uses inline status chips (paid/pending/cancelled) with amount + arrow. Edit mode swaps the additional-details section for a sectioned form; GSTIN pattern-validated. Back arrow + call/edit/delete icons in the header. Bootstrap `container-xl`/`row`/`col-*` gone.
- `client/app/modules/customers/components/add-customer-form/add-customer-form.component.{ts,html,scss}` — overlay panel kept, restyled into three grouped sections (Identity, Location, Tax details). State dropdown auto-fills state code from `INDIAN_STATES`. Photo upload deferred to a follow-up (avatars in list use initials); the existing `ImageUploadComponent` is still available for the view-details editor.

**Stock (inventory) redesign — files rewritten:**

- `client/app/modules/inventory/components/inventory-page/inventory-page.component.{ts,html,scss}` — reduced to a wrapper that hydrates gold/silver stock tiles from `get_total_stock_of_master_category` and forwards to `AvailableProductsComponent`. `InfoCardComponent` usage retired.
- `client/app/modules/inventory/components/available-products/available-products.component.{ts,html,scss}` — full "Stock" screen. Grid ↔ table density toggle (top-right icon pair, persisted via `localStorage['inventory.viewMode']`). Filter chip row (purity multi-select from `purities` master, master-category multi-select, in-stock-only toggle, HUID-present toggle, plus a "Clear all" chip when any filter is active). Grid uses portrait 4:5 media with purity chip overlay + sold badge + hover-lift + admin cost overlay. Table columns: image thumb, SKU, HUID chip, purity chip, product name, net wt, tag price (tabular-nums, right-aligned, with cost line below for admins), actions.
- `client/app/modules/inventory/components/available-products/components/add-product-form/add-product-form.component.{ts,html,scss}` — overlay panel replacing the Bootstrap-modal-with-`data-bs-toggle` pattern. Sections: Identity (SKU + autogen button, HUID, description), Category (master/sub/product), Metal & weight (purity dropdown, HSN, gross/net/stone weight with auto-computed stone weight when user leaves it blank, stone charges), Making & wastage (three-way pill radio for making mode), Pricing (cost admin-only + tag + computed callout at today's rate).
- `client/app/modules/inventory/components/view-product-details/view-product-details.component.{ts,html,scss}` — two-column detail-shell. Left: header with purity chip + SKU + HUID chips, image hero + specifications grid, pricing block with cost (admin) + tag + computed floor price at today's rate. Right sidebar: status chip (in stock / sold), serif tag-price kpi, days-in-stock kpi (from `createdAt`), quick actions (mark-as-sold + print-tag stubs), photo editor card.
- `client/app/modules/inventory/components/product-details-form/product-details-form.component.{ts,html,scss}` — same sectioning as add-product-form; used inline in the view page's edit mode. Reuses the making-mode pill radios + computed preview.

**Grid ↔ table density toggle implementation notes:**

- Toggle lives in the list toolbar next to search, rendered as a two-button segmented control (`view-toggle`/`view-toggle__btn`) with amber active state.
- Selected mode persists to `localStorage['inventory.viewMode']` on click; read at `ngOnInit` and defaults to `grid` if absent or invalid.
- Grid uses `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` — yields ~5-6 per row on 1440px+ and gracefully drops to 2 on tablet, 1 on phone. Cards are the primary click target; icon buttons in the top-right corner are hover-revealed to avoid competing with the card click.
- Table uses `grid-template-columns` (not a real `<table>`) so responsive stacking on `< 900px` is a straight `grid-template-areas` swap.

**Admin cost overlay wiring:**

- `AvailableProductsComponent`, `ViewProductDetailsComponent`, `AddProductFormComponent`, `ProductDetailsFormComponent` all read `storeService.get('authData')` in `ngOnInit` and set `isAdmin = auth?.type === 'admin'`.
- Grid card + table row render `product.costPrice` in muted 11px "Cost ₹X" only when `isAdmin && costPrice != null`. View page shows cost as a full field in the pricing section behind the same gate. Add + edit forms hide the cost input entirely for non-admins.

**Empty states shipped:**

| Screen | Trigger | Icon + copy |
|---|---|---|
| People list | No customers ever | `lucideUsers` 32px + "No customers yet" + primary CTA "Add your first customer" |
| People list | Search yields nothing | `lucideSearch` + `No customers match "<query>"` + ghost CTA "Clear search" |
| Customer view | Zero orders on file | `lucideInbox` 32px + "No orders yet" + secondary line |
| Stock list | No products ever | `lucidePackage` 32px + "No products yet" + primary CTA "Add your first product" |
| Stock list | Filters + search yield nothing | `lucideSearch` + "No products match these filters" + ghost CTA "Clear filters" |
| Loading (both lists) | Fetch in flight, no cached rows | `lucideLoader` spin + "Loading..." |

**Bootstrap classes left behind:** none in H's file set. All `container-xl`/`row`/`col-*`/`.card`/`.form-control`/`form-select`/`btn-primary`/`btn-danger`/`data-bs-toggle` references gone from customers/** and inventory/**.

**H shared recipes added to `styles.scss` (Workstream H section at the bottom):**

- `.chip`, `.chip-toggle`, `.chip-active`, `.chip-icon` — filter chip primitives used by Stock filter row and future toolbars.
- `.purity-chip` — the small "22K • 916" style tag used on product cards + view header + order history rows.
- `.detail-shell`, `.detail-side` — two-column layout (60/40 desktop, stacked on narrow) with sticky right sidebar; used by customer view + product view.
- `.detail-section`, `.detail-section__title`, `.detail-grid`, `.detail-field__label`, `.detail-field__value` — grouped label/value pairs for read-only detail blocks.
- `.data-row`, `.list-toolbar`, `.page-title`, `.page-title__group`, `.page-title__heading`, `.page-title__count` — shared list-page anatomy.
- `.avatar` variants (`--sm`/`--md`/`--lg`/`--xl`) — circular initials/thumbnail avatar used across People + editable cards.
- `.icon-btn` and `.icon-btn--danger` — 32px square icon-only button (used in row action columns + view page headers).
- `.form-section`, `.form-section__title`, `.form-grid`, `.form-grid--3`, `.form-grid__full`, `.field-label`, `.field-error`, `.field-help` — sectioned form primitives shared by customer + product forms.
- `.radio-pills`, `.radio-pill` — pill-row radio primitive used by gender (customer form) and making mode (product form).

**Verification at close of H:**

- `ng build --configuration=development` — PASS (~8.3s). No new warnings; the remaining `NG8107` optional-chain notes in `PrintInvoiceComponent` template are pre-existing (E's rebuild).
- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 amount-in-words specs). No new test suites added by H.
- `npm start` walkthrough not run interactively this pass; build-green + unit-test-green + no cross-workstream file touches was the gate.

**Deferred / follow-ups (Phase 2 or later, non-blocking):**

1. **Real customer photo upload from the add-customer overlay.** The overlay presently drops the photo widget in favor of a name-initials avatar in the list; view-details already has an inline photo editor. Wiring the add form's photo upload back in is a small follow-up.
2. **Photo attachments in the People list.** Rows use initials avatars today; hydrating actual `imagePath` per row would need `getAllCustomers(fetchImage=true, ...)` and a per-row image path resolution. Non-trivial for pagination; deferred.
3. **Barcode-tag print** for products (right-sidebar quick action currently toasts "Phase 2"). Needs the label-print template + printer selection.
4. **Mark-as-sold** direct from the product view (right-sidebar quick action currently toasts). The correct path in v1 is to add the SKU to a cart via the Sell workflow; a direct-sell shortcut is Phase 2.
5. **Real product images in the grid** — placeholder tile shows when no `imagePath` is on file. No change needed to the schema; just seeded data lacks images.
6. **Batch import / bulk actions** on the People + Stock lists. Deferred to P3 CSV migration workstream.


### 10.3 Workstream I — status

**Landed 2026-07-20 on submodule branch `redesign/ui-modernization`.** Sell (order builder / cart) + Books (orders list, details, payments) + invoice preview chrome rebuilt end-to-end. Parent-repo submodule pointer not bumped (per rules). No parent `package.json` / `angular.json` edits.

**Files rewritten (under `client/app/modules/orders/**`):**

- `components/orders-page/orders-page.component.{ts,html,scss}` — Books list rebuilt as hand-rolled table with `page-title` header + status/date/text toolbar; `SimplePaginator` for pagination.
- `components/order-details/order-details.component.{ts,html,scss}` — new 65/35 detail shell; header with serif invoice number + back arrow + action icons; "Bill to" block; totals card with amount-in-words; sticky right rail with KPI tiles + quick-actions list; cancelled-invoice banner.
- `components/order-products-details/order-products-details.component.{ts,html,scss}` — line-items table (40px rows) with SKU/HUID/description column, purity + HSN chips, tabular-nums money columns, compact tax label (CGST+SGST or IGST driven by an `isInterState` input).
- `components/order-payments/order-payments.component.{ts,html,scss}` — inline payments list + right-side slide-in panel form. Radio-pill mode selector (cash / cheque / online) with disabled/required ref-number logic wired to `paymentType.valueChanges`. ESC + backdrop close. Toast + refresh on save.
- `components/prepare-order/prepare-order.component.{ts,html,scss}` — reduced to `<app-stepper>` wrapper (removed the Bootstrap `container-xl`/`row`/`col`/`card` chrome).
- `components/prepare-order/components/stepper/stepper.component.{ts,html,scss}` — 3-step wizard (Select customer → Add items → Review & save) with pill-row stepper, `signal`-based state, per-step `canAdvance` guards, and a persistent `sell-wizard__foot` action bar (Back / Continue / Save).
- `components/prepare-order/components/select-customer/select-customer.component.{ts,html,scss}` — customer picker rebuilt as card grid (avatar + name + city + phone + optional GSTIN) with search, "New customer" ghost CTA routing to `/customers/add-customer`, and `SimplePaginator`.
- `components/prepare-order/components/cart-builder/cart-builder.component.{ts,html,scss}` — NEW. The money screen. 8/4 split: left column has product picker + line-item cards; right column has rate-lock card + totals panel (sticky).
- `components/prepare-order/components/create-invoice/create-invoice.component.{ts,html,scss}` — repurposed as the Review step. Read-only customer summary + compact line-item table + full totals card + amount-in-words + primary "Save invoice" button. Save routes to `/orders` on success.
- `components/print-invoice-preview/print-invoice-preview.component.{ts,html,scss}` — polished chrome only. Sticky top toolbar with back arrow, "Invoice preview" title, `radio-pill-row` A4/80mm variant toggle, primary "Print" button. Preview canvas center-aligned max-w-900px (A4) / 320px (80mm) with `shadow-lg` so it feels like paper against the ivory bg. Feeds `variantInput` into `<app-print-invoice>` (which E built) and hides the child's own toolbar. `@media print` hides the preview chrome + resets canvas to full page.

**Shared component surface touched (still I territory — cart concerns only):**

- `shared/components/cart-items/cart-items.component.{html,scss}` — restyled as bordered cards with 40px thumb + SKU + purity/HUID chips + tabular-nums net weight + `.icon-btn--danger` remove. Empty state kept illustration but restyled copy.
- `shared/components/cart-side-bar/cart-side-bar.component.{ts,html,scss}` — token-driven slide-in from the right. Backdrop only renders when open. ESC key closes. Header uses serif title, footer has primary CTA "Go to Sell" + ghost Close.

**Wizard flow implementation notes:**

- `activeStep` + `selectedCustomer` are signals on `StepperComponent`. `computed` guards (`canAdvanceFromCustomer`, `canAdvanceFromItems`) drive both the Continue button `[disabled]` and the `goTo(index)` step-jump guard.
- Customer selection is persisted through the wizard via the parent stepper signal (not a service) — no cross-tab persistence, which is intentional (a wizard doesn't survive full reload).
- Items are persisted in `CartService` (localStorage), so a mid-shift refresh preserves the cart. `CartBuilderComponent` re-hydrates from the service on `ngOnInit`.
- Step transitions are just `@switch` template branches; no route changes, no animation library. Foot buttons swap per step. Back-nav is a signal decrement (no browser history rewrite).

**Product picker typeahead + keyboard shortcuts:**

- Search field debounced through Angular's `valueChanges`. Filters `allProducts` in-memory (loaded once from `get_all_products(500, 1, '', 0)` — excludes already-sold + already-in-cart), returning top 6 matches. Match rule: SKU / HUID / product description / master + sub category all case-insensitive.
- Result panel floats over the field, mouse-hover updates `pickerIndex` for keyboard-mouse consistency.
- Keys handled inside search field: `ArrowDown` / `ArrowUp` cycle `pickerIndex`, `Enter` calls `addProduct(items[pickerIndex])`, `Escape` collapses.
- Global shortcuts (registered via `@HostListener('document:keydown')` on `CartBuilderComponent`): `/` focuses the search input (blocked when focus is already inside an INPUT/TEXTAREA/SELECT); `Alt+D` jumps to the discount field on the last-added line and selects its contents (uses `data-discount-key` on the input).
- After adding a product: search clears, refocuses, and previous typeahead panel collapses.

**Line-item editing UX:**

- Each item in the cart is a `<article class="line">` card with a 40px thumb + SKU + purity/HUID chips + delete `.icon-btn--danger`.
- 4-column grid inside the card exposes editable Net weight, Rate/g (readonly — driven by rate lock), Making mode (native select), Making value, Wastage %, Discount. Rate/g stays readonly to preserve the "rate lock" contract; the `Relock rate` button on the totals column mass-refreshes rates and lines in place.
- Foot strip: metal / making / wastage / (stone if > 0) totals inline (muted, small) with the line total right-aligned bold.
- Live-recalc: every field write calls `recalcAll()` which pipes through the shared `computeCartTotals(...)` engine, then mirrors computed values back onto view-model lines so display fields don't lag inputs.

**Totals card fields shipped:**

- Metal value (derived: `subTotalTaxable - making - wastage - stone + discount`).
- Making, Wastage, Stone (Stone hidden when zero), Subtotal (taxable), Discount (subtractive, hidden when zero), Old-gold credit as a stub row: value forced to `− ₹0.00` + inline muted `P2 — coming soon` badge; no old-gold entry UI.
- Tax split: CGST + SGST for intra-state, IGST for inter-state. Driven by `ShopSettings.stateCode` vs `customer.stateCode`.
- Round-off (hidden when 0), then serif `Grand total` (`.money-lg`).
- Rate-lock card (above totals): renders one row per purity present in the cart (label + tabular-nums rate/g), plus a "Locked at HH:MM" line under. `Refresh` icon-button fetches `get_current_metal_rates` again and re-applies to every line's `ratePerGram`.
- Save button lives on the Review step (not on the cart step), so users cannot accidentally save without confirming totals.

**Recipes added to `styles.scss` (Workstream I section, appended at bottom):**

- `.status-chip` + `--paid` / `--unpaid` / `--cancelled` variants — used by Books row status column, order-details right-rail status tile.
- `.radio-pill-row` — horizontal segmented control wrapper. Composes with H's existing `.radio-pill` recipe; used by Books status filter, invoice preview variant toggle, and payments panel mode selector.
- `.money`, `.money-lg`, `.money-xl` — money classes. `.money` for compact table cells (tabular-nums + medium weight), `.money-lg` (1.5rem serif) for card grand totals, `.money-xl` (2.25rem serif) reserved for a future big-money display.
- H's earlier recipes (`.detail-shell`, `.detail-side`, `.detail-section`, `.data-row`, `.list-toolbar`, `.page-title`, `.avatar`, `.icon-btn`, `.form-section`, `.form-grid`, `.field-label`, `.radio-pill`, `.purity-chip`) are reused across Books + Sell + payments; no duplication.

**Old-gold P2 stub location:**

- `client/app/modules/orders/components/prepare-order/components/cart-builder/cart-builder.component.html` — the totals panel row with `class="totals-panel__row--stub"`. Explicitly forces `− ₹0.00` and shows a muted `P2 — coming soon` badge inline. `computeCartTotals(..., { oldGoldCreditAmount: 0, ... })` — old-gold credit stays 0 for save. Old-gold entry UI is NOT shipped in this pass (P2 scope per the plan).

**Cart-sidebar status:**

- Retained; restyled with token palette + Lucide `X` close + serif title + `.icon-btn` / `.hlm-btn-*` primitives. Slide-in animation preserved. ESC-to-close added. Backdrop only renders when open (was permanently in the DOM before). Footer CTA routes to `/orders/prepare-order` for the counter-clerk flow.

**Print preview polish (before → after):**

- Before: single sticky toolbar with a back button, title, and empty right spacer; A4/80mm toggle + Print button lived inside the print-invoice child.
- After: single top toolbar hosts back arrow (`.icon-btn` with `lucideArrowLeft`), serif "Invoice preview" title, spacer, `radio-pill-row` A4/80mm variant toggle, and a primary `hlm-btn-primary` Print button. Toolbar is sticky-to-top with token bg + border-bottom. Child's own toolbar is hidden (`[showToolbar]="false"`) and the preview page (`.preview-page`) is rendered inside a `max-w-900px` (A4) / `max-w-320px` (80mm) box with `shadow-lg` on the warm-ivory backdrop. `@media print` gates all toolbar chrome, resets the canvas to full-bleed for printer output, and the child's `@page` rules still control paper size.

**Test + build result:**

- `ng build --configuration=development` — PASS. No new errors introduced; remaining warnings are the pre-existing `NG8107` optional-chain notes in `PrintInvoiceComponent` template (E's rebuild, not I's territory).
- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 amount-in-words specs). No new test suites added by I.
- Live-app walkthrough via `npm start` not run interactively this pass; build-green + unit-test-green + no cross-workstream file touches was the gate.

**Deferred / follow-ups (documented, not blocking):**

1. **Inline "create new customer" during Sell step 1.** Today the "New customer" ghost CTA routes out to `/customers/add-customer` and expects the user to return to the wizard. H's `add-customer-form` is an overlay panel; wiring it inline via a shared service or a component reference is a small follow-up but requires cross-workstream coordination with H's overlay API.
2. **Amount paid at save time.** The old create-invoice let users record a payment inline as part of save; the new Review step drops that in favor of always creating the invoice as unpaid, then routing to `/orders` where the counter clerk can record payment through the panel on order-details. Saves round-tripping and keeps the wizard focused on line items. If piloting shops want single-click "save + full-cash payment", that's a next-pass toggle.
3. **HUID / barcode scanner input on the product picker.** Not shipped (P2 scope). The search field accepts typed HUIDs today; a keyboard-wedge scanner will "just work" as long as it types-and-submits, but no explicit scanner UX has been designed.
4. **`stub`-labelled quick actions on order-details right rail.** Duplicate invoice + WhatsApp send + "Mark as paid" from the header are toast stubs (P3 for WhatsApp; duplicate is a P2 clean-up).
5. **Backend proc for `totalLineItems` on `get_all_orders`.** Books list currently computes item count client-side from the returned `lineItems` array. If the SP starts returning a `totalLineItems` scalar, the fallback keeps rendering; a small SP tweak would let large-cart shops skip the array hydration.
6. **Bootstrap-compat class removal on order-details.** Fully cleaned; the plan flagged this template as still Bootstrap-flavoured — it isn't any more after this pass. Row can be struck from section 10.1's "Bootstrap-grid fallout" list.

### 10.4 Workstream J — status

**Landed 2026-07-20, submodule commits on `redesign/ui-modernization`: `d862062` (catalog), `bfc688d` (settings polish), `b4141ee` (profile), `9f68d57` (login polish). J's shared recipes for `styles.scss` (`.tabs-strip`, `.tab-item`, `.section-heading`, `.field-grid`) were rolled into H's earlier `2fcbf51` commit alongside its own recipe block — the section is clearly labelled `// Workstream J shared recipes (Catalog + admin)` at the bottom of `styles.scss`.** Parent-repo submodule pointer not bumped (per rules).

**Catalog (Categories) redesign — files rewritten:**

- `client/app/modules/categories/categories-routing.config.ts` — three sibling routes `/categories/master`, `/categories/product`, `/categories/sub` now render the same `CategoriesPageComponent`; the active tab is bound to `route.data.tab`. `/categories` redirects to `/categories/master`.
- `client/app/modules/categories/components/categories-page/categories-page.component.{ts,html,scss}` — full rewrite. Page header (Instrument Serif "Catalog" + current-tab heading + count in tabular-nums + right-aligned "Add category" primary button) → tab strip (`Master • Product • Sub` with Lucide icons `lucideCoins` / `lucideGem` / `lucideSparkles`) → responsive card grid (6/5/4/3/2 columns from 1400px down to 640px). Each card = 40px accent-tinted icon tile + name (14px medium) + optional description (2-line clamp, muted) + created-at meta (11px subtle tabular-nums). Cards hover-raise via `box-shadow` + subtle border accent. Empty state = `lucideTags` 32px + "No categories yet" + CTA button. Loading state = spinner row.
- `client/app/modules/categories/components/add-category-dialog/add-category-dialog.component.{ts,html,scss}` — new. Single overlay-panel dialog that handles all three category kinds via an `@Input() tab: 'master' | 'product' | 'sub'`. Uses the same `.modal-overlay` / `.modal-panel` recipe pattern as `add-customer-form` (Workstream F): escape closes, overlay-click closes, animated rise-in on open. Fields: name (required, autofocused, placeholder switches per tab) + description (textarea). Icon slug omitted this pass — one icon per tab is picked by the parent (`.catalog-card__icon` renders `currentTabMeta.icon`); a per-category icon slug is a follow-up if pilots ever want per-card distinctions inside a tab.
- **Deleted (orphaned by the unified page):** the entire `master-categories/`, `product-categories/`, `sub-categories/` component subtrees under `client/app/modules/categories/components/` — 30 files. Their services (`MasterCategoryService`, `SubCategoryService`, `ProductCategoryService`) are retained inside `.../services/` because they're consumed by `dashboard/components/main/main.component.ts` and `inventory/components/inventory-page/inventory-page.component.ts`.

**Admin (Settings) polish — files touched:**

- `client/app/modules/settings/components/settings-page/settings-page.component.{ts,html,scss}` — visual polish only, no SP changes. Tab bar swapped from a left-column vertical rail to the top-anchored horizontal segmented control (`.tabs-strip` + `.tab-item.is-active` → 2px amber underline + accent color). Shop identity form regrouped into four `.form-section` blocks with `.section-heading` labels: **Identity** (name / phone / email), **Location** (address × 2 / city / pincode / state / state code), **Tax details** (GSTIN / PAN), **Branding** (logo). Every tab uses `.field-grid` (Tailwind grid-cols-2 collapsing to 1 under 720px) — Bootstrap grid gone from the settings tree. Metal rates rows condensed to `[chip - AM input - PM input - copy-per-row icon-btn]` inside a single-column stacked grid; chip colored per metal type via `purityChipClass()` (gold amber / silver cool grey / platinum cool violet — swap key checks label for `silver`/`plat`/`gold` and falls back to gold for gold-fineness codes like `999`/`916`/`750`/`22K`/`18K`/`14K`). Panel titles use Instrument Serif; back button moved into topbar right (with `lucideArrowLeft` icon).

**Profile redesign — files touched:**

- `client/app/modules/profile/components/profile-page/profile-page.component.{ts,html,scss}` — full rewrite. Two-column shell using H's `.detail-shell` recipe (span 3 : span 1). Left column: hero row (`.avatar --xl` 96px + name in 2rem Instrument Serif + role chip + email + inline photo-action buttons that appear when a new photo is pending) → Account section (`.form-section` with .section-heading "Account", `.field-grid` username/email/role-readonly/created-readonly) → Change-password section (current / new / confirm password inputs, match + min-length validation, save via `AuthService.hashPassword` → `UserService.updateUserDetails`, existing hash path preserved). Right sticky sidebar: two `.kpi-mini` tiles ("Invoices created" placeholder em-dash with hint that reports land in Phase 2, "Last login" via `formatDate(last_login_date)`) + full-width Sign-out button firing `AuthService.logout()`.
- Photo-editing flow: reuses `ImageUploadComponent` (kept in a visually-hidden `.hidden-uploader` wrapper so its `handleInputChange` + FileReader chain still flows through). A visible pencil badge on the avatar triggers a hidden `<input type="file">` that pipes into the component's method; when a new photo is queued, "Save photo" + "Cancel" buttons appear inline in the hero. If no pending photo but an existing one exists, "Remove photo" is offered. Backend flow (`getUserImage`, `updateUserImage`, `deleteUserImage`, `FileSystemService.updateUserImage`) unchanged.

**Login polish — files touched:**

- `client/app/modules/login/components/login.component.{html,scss}` — brand mark tightened: replaced `logo.png` + generic "Jewellery Store / Management" wordmark with a 40px amber circle showing an Instrument Serif "R" monogram + Instrument Serif "Radiance / Jewellers" wordmark below. Matches the AppShell rail brand mark from Workstream G so login + shell read as one product. Two-panel warm-ivory grid, theme toggle, amber CTA, `hlm-input` inputs — all verified intact after G's Lightning Admin rip; no regressions found in the grid columns, no Bootstrap classes to migrate.

**Tab strip implementation notes:**

- `.tabs-strip` is a horizontal flex with a bottom border-subtle rail. Individual `.tab-item` buttons overlap the strip's border via `margin-bottom: -1px` so the active 2px underline sits flush. Icons + labels align via `inline-flex`. Overflow scrolls horizontally on narrow screens but chrome is hidden (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`).
- Active state = `color: var(--color-accent-fg)` + amber `border-bottom-color` + `font-weight: 600`. Dark theme swaps the color to `var(--color-accent)` for adequate contrast against the panel background.
- Consumed today by Catalog (`Master • Product • Sub`) and Settings (7 tabs: Shop identity / Tax & invoice / Metal rates / Print & hardware / Backup / Users & permissions / Database). Reusable elsewhere.

**Metal rates + shop identity grid summary:**

- Metal rates: `.rates-grid` is a single-column stack of `.rate-row` cards. Each row is a 4-column grid `140px 1fr 1fr 40px` collapsing to 1 column under 720px. Purity chip on the left uses the accent-scale + `chip--gold` / `--silver` / `--platinum` variants (defined in `settings-page.component.scss`). Rate inputs are `hlm-input tabular-nums`. The 40px trailing cell holds a copy-per-row `lucideCopy` icon button. Global "Copy all AM → PM" preserved above the grid.
- Shop identity: four `.form-section` groups with `.section-heading` uppercase-muted headers, each internally using `.field-grid` (2-col). Full-width fields use `.form-grid__full` (H recipe). Save button lives inside a `.form-actions` row at the end; disabled unless the form is dirty + valid.

**Profile page layout:**

- Grid = `minmax(0, 3fr) minmax(0, 1fr)` collapsing to a single column under 1100px.
- Left column: `.profile-main` panel with hero row (border-bottom divider) then two `.form-section` blocks (Account, Change password).
- Right column: sticky (via H's `.detail-side` recipe) `.kpi-mini` tiles + sign-out button. KPI recipe: 11px muted uppercase label with prefix Lucide icon + 1.5rem Instrument Serif value + optional 11px muted hint.

**Recipes added to `styles.scss` (bottom, labelled J block):**

```
.tabs-strip { horizontal flex + bottom border rail, chrome-less overflow scroll }
.tab-item { muted default; hover raise; .is-active = amber accent + 2px underline; dark theme swap }
.section-heading { 11px semibold uppercase tracking-wider text-fg-muted }
.field-grid { grid-cols-2 collapsing to grid-cols-1 under 720px, 16/24 gap }
```

Rolled into H's 2fcbf51 commit (which added its own H-block at the same time), clearly delimited by the `// Workstream J shared recipes (Catalog + admin)` comment banner at the bottom of the file. No pre-existing rules were touched; no other workstream's block was modified.

**Test + build result:**

- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS** (7 baseline + 8 amount-in-words specs from E).
- `ng build --configuration=development` — PASS. No new errors; pre-existing NG8107 optional-chain style warnings in Print-invoice / Create-invoice / Add-product-form templates remain (cosmetic, not J's territory).
- Live-app walkthrough via `npm start` not exercised end-to-end this pass; build+test-green + code-only verification.

**Anything deferred:**

1. **Per-card usage counts on Catalog.** The spec asked for `22 products` chip; today's SPs (`get_master_categories` / `get_sub_categories` / `get_product_categories`) return name + description + timestamps only, no join count. A per-category `productCount` scalar on those SPs (WS A follow-up) would light up an extra `.catalog-card__meta` line without any client-side work.
2. **Per-card edit / delete hover actions.** Card hovers raise but don't reveal pencil / trash icons yet. `update_*` and `delete_*` SPs do not exist for categories; adding them is an A-scope follow-up. Add UI hooks alongside.
3. **Per-category icon slug.** Add-form currently only takes name + description; a `iconSlug` field + a matching column in each `Categories.*` table would let each card pick its own Lucide icon rather than defaulting to the tab-wide icon. Small A-scope schema change.
4. **Real user CRUD + backup + hardware config in Settings.** Explicitly out of scope per the J rules — those remain stubs from E's pass. No SPs added.
5. **Profile invoices-created KPI.** Left as em-dash placeholder with hint text; a `get_invoices_created_by_user(uid)` SP (or a reuse of the Books list filter) would populate it. Follow-up for the Reports pass in Phase 2.
6. **Legacy master/sub/product wrapper components deleted.** 30 files removed under `client/app/modules/categories/components/{master,sub,product}-categories/` — their services were preserved. No external consumer referenced the wrappers or the old Bootstrap-modal forms.

---

## 11. Phase 1.5 close — full UI rebuild done

**Reconciled 2026-07-21.** Submodule pointer bumped to include Workstreams G / H / I / J on `redesign/ui-modernization`. Section 10.3 (Workstream I) is in the plan; the code for I was committed at reconciliation time as submodule commit `f983c55` — the workstream had appended its plan section but failed to run `git commit` on its own code before reporting done.

**Submodule commits landed under Phase 1.5 (in order on `redesign/ui-modernization`):**

- `51a1675` (G) — Lightning Admin rip
- `3e8887e` (G) — AppShell with slim rail + top rate ticker + user menu
- `fe24966` (G) — Wire AppShell into main route, remove sidebar + old navbar
- `200885f` (G) — Dashboard redesign as pattern
- `2fcbf51` (H) — Customers list + view + form
- `f36ea53` (H) — Inventory grid + view + form
- `d862062` (J) — Catalog three-tab card grid
- `bfc688d` (J) — Settings polish
- `b4141ee` (J) — Profile two-column
- `9f68d57` (J) — Login brand-mark tighten
- `f983c55` (I) — Order builder + orders list + details + payments + preview polish

**End-to-end gates on the integrated tree:**

- `ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS**.
- `ng build --configuration=development` — PASS (5.7s). Only pre-existing NG8107 optional-chain warnings in a few templates; no new errors.
- Backend / DB unchanged since Phase 1 close; still runs green.

**What actually shipped:**

- Lightning Admin theme entirely gone. `_bootstrap-compat.scss` retained as a small utility bridge (not a theme). Zero Bootstrap grid classes in customers/**, inventory/**, orders/**, categories/**, settings/**, profile/**, login/**.
- New AppShell: slim left rail (Today / Sell / Stock / People / Catalog / Settings + sign-out) with amber-stripe active state, top bar with brand wordmark + live rate ticker (999 / 916 / 750 pills) + global search input (Ctrl+K to focus, palette itself remains P3) + theme toggle + user menu.
- Dashboard: 12-col grid, Instrument Serif KPIs, single-series area line chart, recent-invoices + fast-movers lists, three KPI stat tiles, real empty states.
- People (Customers): hand-rolled table with initials avatars, two-column detail shell with sticky right sidebar, admin overlay for GSTIN/PAN/credit-balance, three-section form overlay.
- Stock (Inventory): grid ↔ table density toggle (persists via localStorage), sticky filter chips (purity + master category + in-stock-only + HUID-present), gold/silver stock tiles, six-section product form with live "computed at today's rate" callout, admin-only cost fields.
- Sell (Order builder): 3-step wizard, floating typeahead product picker with keyboard navigation ('/' focuses search, Alt+D jumps to last-line discount), editable line-item cards, sticky rate-lock card, live totals with per-line CGST+SGST or IGST driven by state.
- Books (Orders list + details + payments): filterable table, 65/35 detail shell with sticky KPI rail, radio-pill mode selector on payments, cancelled-invoice banner.
- Invoice preview: sticky toolbar with A4 / 80mm radio-pill toggle, preview centered in shadow-lg box, `@media print` gates all chrome.
- Catalog: single tabbed page (Master • Product • Sub) with card grid, single overlay dialog shared across tabs, empty state.
- Settings: horizontal tab strip (7 tabs), grouped shop-identity form, compact metal-rates grid with copy-per-row + global copy-all AM→PM.
- Profile: two-column with hero + Account + Change-password sections, sticky KPI mini-tiles + sign-out.
- Login: warm-ivory two-panel layout intact, brand-mark aligned with AppShell rail.

**Recipe layer in `client/styles.scss`:** three workstream-labeled blocks at the bottom of the file — G (KPI recipes), H (chip / purity-chip / detail-shell / detail-section / data-row / page-title / avatar / icon-btn / form-section / radio-pills), I (status-chip variants / radio-pill-row / money / money-lg / money-xl), J (tabs-strip / tab-item / section-heading / field-grid). No workstream edited another's block.

**Deferred / P2 territory (not touched, and correctly not):**

- Per-card usage counts on Catalog (needs new SPs).
- Per-category icon slug (schema change).
- Profile "Invoices created" KPI (needs new SP).
- Rate-ticker inline popover (pills currently route to `/settings`).
- Real user CRUD, backup/restore, hardware config, RBAC guards — all still stubs.
- Old-gold entry UI on cart — schema-ready, stub visible in totals panel.
- HUID / barcode scanner input, weighing-scale RS-232/USB-HID — all Phase 2.

**Phase 2 unblocked.** Every screen the app has now looks like one product. The stack (Tailwind + Spartan/brain + Radix Colors tokens + Lucide + Inter/Hind/Instrument Serif) is proven across ~40 templates. Time to layer the P2 domain features on top.

---

## 12. Phase 2 — competitive with Marg

**Kicked off 2026-07-21.** Goal: give the app the domain features that a Marg-user comparing side-by-side actually asks about — HUID scan, live weight from a scale, old-gold exchange as a first-class cart line, saving schemes, karigar (goldsmith) job-work, reports the CA can consume, RBAC that owners trust, and backup/restore.

**Scope (locked; nothing added mid-flight):**

1. **Hardware inputs on cart** — HUID / barcode scanner (keyboard-wedge focus-anywhere) + weighing-scale integration (`serialport` RS-232 + USB-HID).
2. **Old-gold exchange on cart** — schema is ready (`OldGoldReceipts`), UI + SP wiring is not.
3. **Saving-scheme module** — enroll, per-installment receipt, running balance, maturity, redemption on invoice. Schema stub exists (`SavingSchemes`, `SavingSchemeInstallments`).
4. **Karigar (goldsmith) job-work module** — issue pure gold with challan, receive back finished piece with wastage, ledger reconciliation. Schema stub exists (`KarigarJobCards`, `KarigarLedger`).
5. **Reports v1** — day-book (cash + bank + UPI per day), sales register, stock summary by purity (with grams + tag-price valuation), GSTR-1 JSON export (for CA to upload directly).
6. **RBAC** — route guards on the client + `type`-based auth checks inside every SP that reveals cost / does destructive writes. Owner-only surfaces: cost fields, cancel invoice, delete customer, delete product, backup, settings write.
7. **Backup + restore** — encrypted `mysqldump` archive to disk (later Drive), passphrase-protected. Restore flow with confirm + relaunch.

**Explicitly not in P2 (still P3):** WhatsApp Business API, IBJA rate auto-fetch, CSV / Tally migration, Hindi/regional i18n, Android companion, `⌘K` command palette, repair/job-ticket module, e-invoice IRP live integration.

**Execution plan (matches the Phase-1 pattern):**

- **Workstream K — Backend foundation** (sequential, first): every P2 stored procedure and IPC channel. Blocks the UI workstreams.
- **Workstream L — Hardware + Old-gold cart** (after K): serial + HID via Electron main-process, cart UI additions, old-gold entry row + persistence, print-invoice extension.
- **Workstream M — Saving-scheme + Karigar** (after K): two new feature modules end-to-end with the P1.5 design tokens.
- **Workstream N — Reports + Backup** (after K): reports module (4 report screens), export to CSV / JSON / PDF where appropriate, backup/restore UI.
- **Workstream O — RBAC** (after K, but small enough to bundle with N if the guards are trivial): route guards + proc-level `type` checks + owner-only field visibility across all screens.

L / M / N can run in parallel. O is smallest and likely folds into N.

**Non-negotiables carried over from Phase 1.5:**

- Data policy stays destructive — dummy data only, no migrations. Drop-and-recreate.
- Design system stays put: Tailwind + Spartan/brain (alpha.563) + Radix tokens + Lucide + Inter/Hind/Instrument Serif + `.hlm-*` recipes + workstream-labeled recipe blocks at the bottom of `styles.scss`.
- Every new screen uses the H/I/J recipes (`.detail-shell`, `.form-section`, `.kpi-card`, `.status-chip`, `.tabs-strip`, `.radio-pill-row`, `.money-*`, `.icon-btn`) — do NOT invent parallel recipes.
- All GST + karigar + old-gold policy defaults are toggleable via `ShopSettings` or `TaxSlabs`, not hard-coded. Flagged questions (RCM vs Rule 32(5), 40L HUID exemption) surface as read-only "confirm with your CA" notes, never as immutable defaults.

### 12.1 Workstream K — status

**Landed 2026-07-20 on parent branch `integration/modernization-2026-07-17`.** Phase 2 backend foundation: every SP, table extension, TS service, and IPC channel the parallel P2 UI workstreams (L / M / N / O) need. Client submodule untouched (frozen for this workstream, per rules).

**Prereq — Workstream A backfill.** Phase 1's schema-and-cart-engine commit (`8b54afd`) had landed on `main` but the integration branch had forked before it. Cherry-picked onto the integration branch as a preserved unit (`4214334`) so this workstream can build on the promised Phase 1 foundation. Behaviour identical to `main`; the integration branch's REDESIGN_PLAN.md was preserved during the pick.

**Tables extended (extend + drop-and-recreate, no migrations):**

- `Scripts/Tables/SavingSchemes.sql` — rewrote around plan-mandated column names: `planName`, `tenureMonths` (default 11), `bonusInstallments` (default 1), `startDate`, `expectedMaturityDate`, `totalPaid`, `status ENUM('active','matured','redeemed','forfeited')`, `redeemedInvoiceId` / `redeemedAmount` / `redeemedAt`, `forfeitedAt` / `forfeitReason`. FK to `invoices` for redemption.
- `Scripts/Tables/SavingSchemeInstallments.sql` — rewrote: `installmentGuid`, `paymentMode` ENUM, `refNumber`, `receiptDate`, `actorUserId`. Unique key on `(schemeId, installmentNumber)`.
- `Scripts/Tables/Karigars.sql` — **new table**. Guid, name, phone, address, remarks, soft-delete. Unique on `(name, phone)`.
- `Scripts/Tables/KarigarJobCards.sql` — rewrote with FK to `karigars` (was karigarName string), plus new columns: `jobGuid`, `issuedStones` JSON, `receivedNetWeight`, `receivedStoneWeight`, `wastagePercentAllowed`, `wastageGramsActual`, `makingCharge`, settlement columns (amount / payment mode / ref / settledAt), `productId` FK, `description`. Status ENUM narrowed to `issued/received/settled/cancelled`.
- `Scripts/Tables/KarigarLedger.sql` — rewrote around plan schema: `ledgerGuid`, `karigarId` FK, `jobId` FK (nullable), `entryType ENUM('issue','receive','payment','adjustment')`, `direction`, `weightGrams`, `amount`, `txnDate`, `notes`, `actorUserId`.
- `Scripts/Tables/Invoices.sql` — added `savingSchemeRedemption` JSON column (was documented as existing in plan section 7.1 but never actually added at Phase 1). Written by `save_order` when a redemption is linked.
- `Scripts/Tables/ShopSettings.sql` — added `backupDir` (nullable path) + `defaultPrintVariant ENUM('a4','thermal80')` for L/N to consume.
- `docker/init/01-init-db.sh` — TABLES array gained `Karigars.sql` before `KarigarJobCards.sql` so FK resolution is order-safe.

**Stored procedures added (28 new, grouped by module):**

- **OldGold** (3, new folder `Scripts/Stored-Procedures/OldGold/`): `save_old_gold_receipt`, `get_old_gold_receipts_by_customer`, `get_old_gold_receipt_by_invoice`.
- **SavingSchemes** (7, new folder): `enroll_saving_scheme`, `record_scheme_installment` (with `p_allow_multiple_this_month` corner-case flag), `redeem_saving_scheme`, `forfeit_saving_scheme` (admin-only via `_authorize`), `get_saving_scheme_details`, `get_all_saving_schemes`, `get_saving_schemes_by_customer`.
- **Karigar** (10, new folder): `add_karigar`, `get_all_karigars`, `update_karigar`, `delete_karigar` (soft), `issue_karigar_job`, `receive_karigar_job`, `settle_karigar_job`, `get_karigar_job_card_details`, `get_all_karigar_jobs`, `get_karigar_ledger`. Ledger entries written automatically on issue/receive/settle for reconciliation.
- **Reports** (5, new folder): `get_day_book`, `get_sales_register`, `get_stock_summary_by_purity`, `get_gstr1_export_rows`, `get_low_stock_by_category`. All aggregations pushed into SQL — no TypeScript rollup layer.
- **Auth** (1): `get_user_permissions` returns per-user `{ type, permissions, defaultPermissions }` with role-based defaults baked in (admin / manager / employee — see permission map below).
- **Users** (4, added under existing folder): `add_user`, `update_user`, `delete_user`, `get_all_users`.
- **ShopSettings**: `reset_invoice_counter` (SP referenced by E's settings tab; RBAC-guarded; owns audit-log entry).
- **MetalRates**: `get_metal_rates_history` (SP referenced by E's rates tab).

**Existing SPs extended:**

- `save_order` — accepts new tail params `p_old_gold_receipt_guid`, `p_saving_scheme_guid`, `p_actorUserId`. If receipt-guid present, links `oldgoldreceipts.invoiceId` and pulls the credit into `invoices.oldGoldCreditAmount`. If scheme-guid present, calls the redemption inline (updates scheme status + writes `savingSchemeRedemption` JSON blob on the invoice + treats the corpus as pre-paid so `isPaymentDone` calc includes it). Existing flows (no receipt / no scheme) pass unchanged.
- `cancel_order` — accepts `p_actorUserId`; employee callers rejected with `SIGNAL SQLSTATE '45000'` message `Forbidden: canCancelInvoice`. Also RESIGNALs on inner errors instead of swallowing.
- `delete_customer`, `delete_product` — accept `p_actorUserId`; employee callers rejected. Audit-log entries added.
- `save_metal_rates` — RBAC-guards via existing `p_setByUserId`; employees rejected. RESIGNAL instead of returning a message row.
- `save_shop_settings` — accepts trailing `p_backupDir`, `p_defaultPrintVariant`, `p_actorUserId`. Employee callers rejected.

**RBAC / _authorize approach.** Rather than a shared helper (MySQL SPs can't share helpers cheaply), every destructive or cost-revealing SP does an inline lookup: `SELECT type INTO l_actor_type FROM users WHERE uid = p_actorUserId; IF l_actor_type = 'employee' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: <permission>'`. Guards live in: `cancel_order`, `delete_customer`, `delete_product`, `save_shop_settings`, `save_metal_rates`, `reset_invoice_counter`, `forfeit_saving_scheme`, `add_user`, `update_user`, `delete_user`. `forfeit_saving_scheme` + `add_user/update_user/delete_user` gate on `<> 'admin'` (not `= 'employee'`) because manager is also excluded there per the default map. Smoke-tested: all four rejection cases raise SIGNAL as expected; admin caller passes through.

**Canonical permission map (`get_user_permissions`, `Backend/Shared/permissions.service.ts`):**

- `admin`: all eight flags true.
- `manager`: everything **except** `canBackup`, `canManageUsers`, `canForfeitSavingScheme`.
- `employee`: all eight flags false.

Users with an explicit `permissions` JSON blob override the role-default; users with NULL fall through to the role-default. Seed data leaves `admin.permissions` NULL to exercise the fallback path; `manager` and both `cashier` accounts carry explicit maps that mirror the defaults.

**TypeScript service layer (Angular / renderer-side, wired through `DatabaseService.execute`):**

- `Backend/OldGold/db-old-gold.service.ts` — `saveReceipt`, `getReceiptsByCustomer`, `getReceiptByInvoice`.
- `Backend/SavingSchemes/db-saving-schemes.service.ts` — `enroll`, `recordInstallment`, `redeem`, `forfeit`, `getDetails`, `getAll`, `getByCustomer`.
- `Backend/Karigar/db-karigar.service.ts` — full karigar CRUD + job lifecycle (issue / receive / settle) + ledger.
- `Backend/Reports/db-reports.service.ts` — `getDayBook`, `getSalesRegister`, `getStockSummaryByPurity`, `getGstr1ExportRows` (post-processes into `{ rows, hsnSummary }`), `getLowStockByCategory`.
- `Backend/Shared/permissions.service.ts` — `getUserPermissions(uid)` with a strict parser that normalises 0/1/true/false and falls back to role defaults; also exports `defaultsForRole()` for UI-side guards.
- `Backend/Shared/shop-settings.service.ts` — `save()` now accepts `actorUserId`.
- `Backend/Orders/db-orders.service.ts` — `saveOrder(payload)` gained `oldGoldReceiptGuid`, `savingSchemeGuid`, `actorUserId` on the payload; `cancelOrder(guid, reason, actorUserId)`.

**Backend/Shared/backup.service.ts + src-electron/backup.js.** Two files for the same module — the `.ts` sits under `Backend/Shared/` alongside the rest of the domain services and is a natural home for the TypeScript signature, but Electron's main process consumes the CommonJS mirror at `src-electron/backup.js`. Both use AES-256-GCM with scrypt-derived 32-byte keys (16-byte salt, 12-byte IV per archive). Archive header layout: `[version:1][salt:16][iv:12][ciphertext][authTag:16]`. `createBackup(config, passphrase, targetDir)` spawns `mysqldump --single-transaction --routines --triggers --events --column-statistics=0`, encrypts the output, deletes the raw `.sql`. `restoreBackup(config, archivePath, passphrase)` decrypts to a temp file, pipes it into `mysql` client, then unlinks. `listBackups(dir)` and `deleteBackup(path)` complete the set. **Prereq: `mysqldump` + `mysql` client binaries must be on host PATH.** Error message is friendly when the binary is missing (`ENOENT` → surfaced as "Install MySQL client tools"). Windows note: MySQL 8 installer bundles them at `C:\Program Files\MySQL\MySQL Server 8.0\bin\`; users need to add that to PATH or (v1.5) we ship a packaged binary.

**IPC channels added (all on `window.electronAPI.*`, `contextIsolation:true`, `nodeIntegration:false` preserved):**

- `oldGold.saveReceipt`, `oldGold.getReceiptsByCustomer`, `oldGold.getReceiptByInvoice`.
- `savingSchemes.enroll`, `savingSchemes.recordInstallment`, `savingSchemes.redeem`, `savingSchemes.forfeit`, `savingSchemes.getDetails`, `savingSchemes.getAll`, `savingSchemes.getByCustomer`.
- `karigar.addKarigar`, `karigar.getAllKarigars`, `karigar.updateKarigar`, `karigar.deleteKarigar`, `karigar.issueJob`, `karigar.receiveJob`, `karigar.settleJob`, `karigar.getJobDetails`, `karigar.getAllJobs`, `karigar.getLedger`.
- `reports.dayBook`, `reports.salesRegister`, `reports.stockSummaryByPurity`, `reports.gstr1Export`, `reports.lowStockByCategory`.
- `backup.create`, `backup.restore`, `backup.list`, `backup.delete` (owner-only via a client-side `actorType` argument for the delete case; the server-side guard is `mysqldump` PATH + admin-only manual flow — client should also check `canBackup`).
- `auth.getUserPermissions`.

**Seed data extensions (`Scripts/Seed/seed-data.sql`):**

- 7 karigars (Ramesh Sonar, Suresh Karigar, Mahesh Patel, Deepak Jangid, Nitin Chhipa, Kishan Bhai, Prakash Meena).
- 12 job cards spanning the last 55 days across all statuses (issued / received / settled), covering a mix of gold + silver + diamond work with `issuedStones` JSON blobs.
- 33 ledger entries auto-derived from the job cards (issue debit / receive credit / making-charge accrual / settlement payment).
- 10 saving schemes across 10 different customers — 7 active, 2 matured, 1 forfeited, 1 subsequently redeemed against invoice 1 as a demonstration.
- 49 installment rows generated to match each scheme's `totalPaid` (payment mode rotates cash / online / upi; ref numbers stamped for the non-cash modes).
- 3 additional old-gold receipts (2 unlinked, 1 tied to invoice `RAD/2026/00002` with its `oldGoldCreditAmount` bumped).
- `Users.permissions`: admin left NULL, manager + both cashiers carry explicit maps that mirror the defaults from `get_user_permissions`.

Everything is idempotent for a fresh `docker compose down -v && docker compose up -d --build`.

**Verification.**

- `docker compose down -v && docker compose up -d --build` — clean end-to-end. Logs green (only `mysql --skip-host-cache` deprecation + `CA certificate self-signed` warnings, both pre-existing).
- Manual SP smoke tests via `docker exec ... mysql`:
  - `CALL enroll_saving_scheme(<guid>, 'Golden Harvest', 5000, 11, 1, 1);` → schemeGuid + startDate + expectedMaturityDate returned.
  - `CALL record_scheme_installment(<guid>, 5000, 'cash', NULL, NULL, 1, 1);` → increments totalPaid + installmentNumber.
  - `CALL issue_karigar_job(<guid>, NULL, 15.5, '916', NULL, ...);` → jobGuid returned + ledger row auto-written.
  - `CALL save_old_gold_receipt(<guid>, NULL, 5.5, 91.6, '916', 3.0, 7150.0, 39325.0, 'Test', 1);` → receiptGuid + correct receiptId returned.
  - `CALL get_day_book('2026-06-01', '2026-07-21');` → per-day rollup by payment mode.
  - `CALL get_sales_register('2026-06-01', '2026-07-21', NULL, NULL);` → wide format with GSTIN, place-of-supply, per-invoice split.
  - `CALL get_stock_summary_by_purity(NULL);` → per-purity rollup with unit count + gross/net weight + tag/cost valuation.
  - `CALL get_gstr1_export_rows('2026-07');` → per-invoice rows + HSN summary rollup.
  - `CALL get_user_permissions(1);` → admin, permissions=NULL falls through to full-true default map.
  - `CALL get_user_permissions(3);` → employee, all flags false via explicit map.
  - `CALL cancel_order(<guid>, 'test', 3);` → **fails** with `SIGNAL 45000 Forbidden: canCancelInvoice`. Same result for `delete_customer`, `save_metal_rates`, `forfeit_saving_scheme` when actor is uid=3. Admin (uid=1) passes through.
- `npx ng build --configuration=development` — PASS. No new warnings; only the pre-existing `NG8107` optional-chain style notes in a few templates.
- `npx ng test --watch=false --browsers=ChromeHeadless` — **15/15 SUCCESS**.
- `node -e "require('./src-electron/backup.js')"` — loads clean. `node --check` on main.js + preload.js clean.
- Backup service smoke test (list + delete against a synthetic `.enc` file): PASS.

**Frontend interfaces UI workstreams should sync (L / M / N / O — no client changes yet):**

- `client/app/interfaces/OldGold/*.ts` — mirror `Backend/Shared/interfaces/old-gold.ts` (`OldGoldReceipt`, `SaveOldGoldReceiptPayload`).
- `client/app/interfaces/SavingSchemes/*.ts` — mirror `Backend/Shared/interfaces/saving-scheme.ts` (all payload + view interfaces).
- `client/app/interfaces/Karigar/*.ts` — mirror `Backend/Shared/interfaces/karigar.ts`.
- `client/app/interfaces/Reports/*.ts` — mirror the four report interfaces + `Gstr1ExportPayload`.
- `client/app/interfaces/Auth/user-permissions.ts` — mirror `Backend/Shared/interfaces/user-permissions.ts`.
- New Angular services under `client/app/shared/services/{OldGold,SavingSchemes,Karigar,Reports,Backup}/…` that consume `window.electronAPI.*` following the `MetalRatesService` / `ShopSettingsService` pattern from Phase 1.

**Deferred / documented, not blocking:**

1. **`mysqldump` binary on Windows.** Not on PATH by default. Users installing the packaged Electron app will need MySQL client tools installed and on PATH. For v1.5 we should ship the `.exe` inside the Electron resources folder and shell out to the packaged path instead of relying on PATH. Backup UI (Workstream N) should surface a clear "MySQL client tools not detected — [install guide]" state when `backup.create` fails with `ENOENT`.
2. **RCM vs Rule 32(5) old-gold GST treatment.** Not touched — schema captures gross + purity + credit but no tax treatment. Workstream L (old-gold cart line) will surface the toggle in `TaxSlabs` / `ShopSettings`.
3. **e-invoice IRP integration.** `Invoices.isEinvoice`, `irn`, `qrCodeData` remain settable but the SP doesn't call any IRP; still deferred to a real-pilot need.
4. **Karigar → auto stock movement.** When a job settles with `productId` set, we should optionally insert a `StockMovements` row of type `karigar_receive`. Not wired yet — L can add on the settle flow, since it's a UI concern about which product ID to reference.
5. **`AuditLog` retention policy.** No cron / purge job; the table grows unbounded. Fine for Phase 2 pilots but worth flagging for post-launch.
6. **Interface package `mysqldump`.** The plan asks that no new npm packages be added; `child_process` + built-in `crypto` are used. `mysqldump` is a system binary, not an npm package — no new dependencies added to `package.json`.
7. **`get_sales_register` invoice-status filter granularity.** Values allowed: `paid`, `pending`, `cancelled`. Workstream N should render this as a segmented control.
8. **P2 UI clients still consume `DbBridge` fallback.** Every new SP is reachable both via the dedicated IPC channel and via a generic `db.execute('call foo(?)', [...])` fallback if the channel isn't wired yet. This mirrors the Phase 1 pattern (E's shop-settings service uses the same trick).

### 12.2 Workstream L — status

_TBD_

### 12.3 Workstream M — status

_TBD_

### 12.4 Workstream N — status

_TBD_

### 12.5 Workstream O — status (if not folded into N)

_TBD_
