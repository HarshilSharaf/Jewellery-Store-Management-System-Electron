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
