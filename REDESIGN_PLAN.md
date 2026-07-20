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

**Schema rebuild** (destructive — dummy data only)

New / modified tables:

- **`ShopSettings`** — single-row keyed table: shopName, gstin, address, city, state, phone, email, logoPath, invoicePrefix, invoiceStartFrom, currentInvoiceCounter, defaultCurrency (`INR`), timezone.
- **`MetalRates`** — daily rate per purity: id, effectiveDate, session (`AM`/`PM`), purity (`999`/`995`/`916`/`875`/`750`/`585`/silver_999`), ratePerGram, source (`manual`/`ibja`), setBy (user), createdAt. Composite unique on (effectiveDate, session, purity).
- **`TaxSlabs`** — hsnCode (`7113`, `7114`, `7118`), name, cgstRate, sgstRate, igstRate, active, effectiveFrom.
- **`Products`** (rebuilt) — productGuid, sku (unique), huid (nullable, 6-char), purityCode (FK to purities enum table), grossWeight, netWeight, stoneWeight, stoneCharges, makingMode (`flat`/`perGram`/`percent`), makingValue, wastagePercent, costPrice, tagPrice, mid/sid/pid FKs, imagePath, isSold, createdAt, deletedAt.
- **`Purities`** — code (`916`, `750`, `585`, ...), label ("22K Gold"), metalType (`gold`/`silver`/`platinum`), fineness (numeric 0-1000). Static seed.
- **`Customers`** (extend) — add gstin, pan, remarks, credit balance (running).
- **`Invoices`** (extend) — add rateSnapshot (JSON of purity→rate at bill lock), oldGoldCreditAmount, roundOffAmount, hsn (default 7113), placeOfSupply, invoiceNumber (formatted string), isEinvoice, irn, qrCodeData, savingSchemeRedemption (JSON), cancelledAt (already exists), cancelReason.
- **`InvoiceLineItems`** (rewrite of Invoice_Products_Mapping) — id, invoiceId, productId (nullable — allow ad-hoc lines), lineType (`product`/`oldGold`/`stone`/`labour`), description, purityCode, grossWeight, netWeight, stoneWeight, ratePerGram, metalValue, makingCharge, stoneCharge, wastageCharge, discountAmount, taxableAmount, cgst, sgst, igst, lineTotal.
- **`OldGoldReceipts`** — id, invoiceId, customerId, grossWeight, testedPurity, deductionPercent, ratePerGram, creditAmount, remarks, createdAt.
- **`Users`** (extend) — permissions JSON, lastLoginAt.
- **`AuditLog`** — id, actorUserId, action, entity, entityId, before (JSON), after (JSON), createdAt. Populated by SPs on critical writes (rate lock, invoice cancel, product delete).
- **`Payments`** — extend with refNumber (UPI ref / cheque no), reconciledAt.

Deferred to P2 (schema stubs OK, feature not built): `SavingSchemes`, `SavingSchemeInstallments`, `KarigarJobCards`, `KarigarLedger`, `StockMovements`.

**Stored procedures**: rewrite `save_order`, `get_order_details`, `record_payment`, `get_all_orders`, `get_recent_orders`, `get_revenue_of_six_months`, `get_sales_labour`, `getTopProductCategories`, `getTotalStock` around the new schema. Add `get_current_metal_rates`, `save_metal_rates`, `get_shop_settings`, `save_shop_settings`.

**Cart engine rewrite** — compute per-line: `metal = ratePerGram × netWeight`, `wastage = wastage% × metal`, `making = f(makingMode, makingValue, netWeight, metal)`, `stones = stoneCharges`, `taxable = metal + wastage + making + stones − discount`, then GST split. Grand total = Σ taxable × 1.03 (adjustable per tax slab).

**Print** — new 80mm thermal template. A4 template reads shop identity from `ShopSettings`.

**Design system foundation** — Tailwind + Spartan/ng + Lucide + Inter/Hind + Radix Colors installed. Global tokens in `styles.scss` (or `.css` — Tailwind era). Reskin **login** and **dashboard** end-to-end as the pattern.

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

## 7. Work-in-progress (Phase 1 execution, starting now)

Two parallel workstreams launched 2026-07-20:

- **Workstream A — Backend/schema rebuild** (parent repo): drop-and-recreate `Scripts/Tables/`, rewrite affected stored procedures, refresh `Scripts/Seed/seed-data.sql` with domain-realistic dummy data (22K/18K products with HUID, IBJA rate snapshots, shop identity, a few test invoices). Update the cart engine in TypeScript to compute from the new formula.
- **Workstream B — Design system foundation** (`client/` submodule): install Tailwind, Spartan/ng, ng-icons + Lucide pack, Inter Variable, Hind. Set up Radix Colors as CSS custom properties, define semantic tokens (bg/fg/muted/accent/border/success/warning/danger). Wire dark-mode toggle. Reskin login and dashboard as the pattern for the rest.

Progress is written back to this file as each workstream reports.

### 7.1 Workstream A — status

**2026-07-20 — Phase 1 backend/schema rebuild landed.**

**Tables (`Scripts/Tables/`)**

- Added: `ShopSettings.sql`, `Purities.sql`, `TaxSlabs.sql`, `MetalRates.sql`,
  `OldGoldReceipts.sql`, `AuditLog.sql`, `InvoiceLineItems.sql`.
- P2 stub DDL only (no SPs, no UI): `SavingSchemes.sql`,
  `SavingSchemeInstallments.sql`, `KarigarJobCards.sql`, `KarigarLedger.sql`,
  `StockMovements.sql`.
- Rebuilt: `Products.sql` (sku, huid, purityCode FK, gross/net/stone weights,
  stoneCharges, makingMode/makingValue, wastagePercent, costPrice, tagPrice,
  hsnCode; kept GUID + soft-delete pattern).
- Extended: `Customers.sql` (state/stateCode, gstin, pan, remarks,
  creditBalance), `Invoices.sql` (invoiceNumber, hsn, placeOfSupply,
  rateSnapshot JSON, per-tax totals, oldGoldCreditAmount, roundOffAmount,
  grandTotal, isEinvoice/irn/qrCodeData, cancelReason),
  `Payments.sql` (refNumber, reconciledAt, extended paymentType enum),
  `Users.sql` (permissions JSON, lastLoginAt).
- Removed: `Invoice_Products_Mapping.sql` (replaced by `InvoiceLineItems.sql`).
- Baked all previously-planned V001 indexes into new DDL (GUID uniqueness on
  customers/invoices/payments/products; soft-delete + createdAt composites on
  customers/products; cancelledAt + createdAt on invoices).
- Deleted `Scripts/Migrations/V001__*.sql`; added
  `Scripts/Migrations/README.md` documenting Migrations as post-launch only.

**Docker (`docker/init/01-init-db.sh`)**

- Rewrote the `TABLES` array in dependency-safe order: ShopSettings,
  Purities, TaxSlabs, MasterCategories, ProductCategories, SubCategories,
  Users, Customers, Products, MetalRates, Invoices, InvoiceLineItems,
  Payments, OldGoldReceipts, AuditLog, then the five P2 stubs.

**Stored procedures (`Scripts/Stored-Procedures/`)**

- Rewrote 12: `save_order`, `get_order_details`, `get_all_orders`,
  `get_recent_orders`, `get_revenue_of_six_months`, `get_sales_labour`,
  `record_payment`, `cancel_order`, `get_all_products`, `add_product`,
  `update_product_details`, `get_product_details`, `get_total_stock`,
  `get_total_stock_of_master_category`, `get_top_product_categories`,
  `get_all_customers`, `get_customer_details`, `get_customer_orders`,
  `add_customer`, `update_customer_details`,
  `get_total_amount_of_products_bought_for_customer`, `loginUser`.
  The OR/AND precedence bug in the search WHERE clauses is fixed as part
  of the rewrite.
- Added 6 new: `get_current_metal_rates`, `save_metal_rates`,
  `get_shop_settings`, `save_shop_settings`, `get_purities`, `get_tax_slabs`
  (in new `MetalRates/`, `ShopSettings/`, `Purities/`, `TaxSlabs/` subdirs).
- Deleted: none (existing image / user image / category CRUD SPs still fit
  the schema).

**Seed data (`Scripts/Seed/seed-data.sql`)**

- ShopSettings: 1 row (Radiance Jewellers, Mumbai, GSTIN 27ABCDE1234F1Z5,
  invoicePrefix `RAD/2026/`, counter 1).
- Purities: 6 (999, 916, 875, 750, 585 gold + S999 silver).
- TaxSlabs: 3 (HSN 7113, 7114, 7118 all at 3% split).
- Users: 4 (admin, manager, 2 employees; all password `admin123`).
- Master/Product/Sub categories: original 4 / 6 / 5 kept.
- Customers: 20 (18 B2C + 2 B2B with valid-format GSTIN/PAN).
- MetalRates: 360 rows (30 days × 2 sessions × 6 purities) with
  deterministic ±3% wobble around 2026-era base rates
  (999 ≈ ₹7,800/g, 916 ≈ ₹7,150/g, 875 ≈ ₹6,825/g, 750 ≈ ₹5,850/g,
  585 ≈ ₹4,560/g, silver 999 ≈ ₹95/g).
- Products: 43 across gold + silver, with SKU like `G-NEC-001`, 6-char HUIDs
  on hallmarked gold, weights that sum correctly, cost/tag prices.
- Invoices: 8 test invoices spanning the last month, with matching
  `invoicelineitems` (10 rows), `payments` (8 rows), and one
  `oldgoldreceipts` row on invoice 8.
- Post-seed counter fast-forwarded on shopsettings to 9.

**Backend TS (`Backend/`)**

- Added `Backend/Shared/interfaces/{cart.ts,metal-rate.ts,shop-settings.ts,product.ts}`
  (Workstream B must sync frontend types — see below).
- Added `Backend/Orders/cart-totals.ts` — the new per-line +
  per-cart computation: metal = rate × netWeight, wastage = %×metal,
  making = f(flat|perGram|percent), stones = line-level charges,
  taxable = metal + wastage + making + stones − discount, GST split by
  ShopSettings.stateCode vs invoice placeOfSupply stateCode, grand total
  with optional round-off.
- Rewrote `Backend/Orders/db-orders.service.ts`,
  `Backend/Inventory/db-inventory.service.ts`,
  `Backend/Customers/db-customers.service.ts` to bind the new SP signatures.
- Added `Backend/Shared/metal-rates.service.ts` (get current / save today's
  rates / build snapshot JSON for invoice lock).
- Added `Backend/Shared/shop-settings.service.ts` (get / save the single-row
  shop identity).
- `Backend/Shared/database.service.ts` `prepareResponseData` unchanged; the
  new SPs return the standard mysql2 CALL shape (result sets + trailing
  OkPacket) that the existing slice logic already handles.

**IPC (`src-electron/`)**

- Added handlers in `main.js`: `metalRates:getCurrent`, `metalRates:save`,
  `shopSettings:get`, `shopSettings:save`. Same pool + timeout wrapper as
  existing `db:*` handlers.
- Exposed via `preload.js` on `window.electronAPI.metalRates.*` and
  `window.electronAPI.shopSettings.*`. `contextIsolation: true`,
  `nodeIntegration: false` posture preserved.

**Docker rebuild verification**

- `docker compose down -v && docker compose up -d` completes clean:
  all 20 tables created, all 40 SPs installed, seed data lands without
  errors. Row-count sanity: shopsettings=1, purities=6, taxslabs=3,
  users=4, customers=20, products=43, metalrates=360, invoices=8,
  invoicelineitems=10, payments=8, oldgoldreceipts=1.
- Smoke-tested end-to-end: `save_order` writes the invoice, increments the
  shopsettings counter, sets `isSold` on referenced products, and returns
  `invoiceId / invoiceGuid / invoiceNumber`; `record_payment` flips
  `isPaymentDone` when cumulative payments cover the grand total;
  `cancel_order` unwinds line items and stamps `cancelledAt` +
  `cancelReason`; `save_metal_rates` upserts per (date, session, purity).

**Frontend interfaces Workstream B must sync**

The parent-repo Backend services above assume matching client-side types.
The following files under `client/` need to be updated by Workstream B to
match the new Backend interfaces (do NOT touch from Workstream A — they
live in the submodule):

- `client/app/interfaces/Inventory/inventory-service-interface.ts` —
  `addProduct` / `updateProductDetails` signatures gain sku, huid,
  purityCode, gross/net/stone weights, stoneCharges, makingMode,
  makingValue, wastagePercent, costPrice, tagPrice, hsnCode. The old
  `productWeight` / `productDescription`-only surface is gone.
- `client/app/interfaces/Customers/customer-service-interface.ts` — the
  `CustomerDetails` model gains state, stateCode, gstin, pan, remarks
  (creditBalance is read-only for now).
- `client/app/interfaces/Orders/orders-service-interface.ts` — `saveOrder`
  now takes the cart-totals shape (subTotalTaxable, totalCgst/Sgst/Igst,
  totalMakingCharge, totalStoneCharge, totalWastageCharge,
  oldGoldCreditAmount, roundOffAmount, grandTotal, rateSnapshot,
  placeOfSupply, hsn, lineItems JSON, oldGoldReceipts JSON) instead of the
  old `productsData` + flat GST fields; `cancelOrder` gains
  `cancelReason`; `recordPayment` gains `refNumber`.
- `client/app/modules/customers/models/customerDetails.ts` — add state,
  stateCode, gstin, pan, remarks fields.
- `client/app/modules/inventory/models/*` (products model) — rewrite around
  the new field set.
- `client/app/modules/orders/models/*` (cart / invoice models) — rewrite
  around InvoiceLineItems.
- The renderer should also consume the new `window.electronAPI.metalRates`
  and `window.electronAPI.shopSettings` bridges (declared in preload.js);
  add corresponding Angular services in the client submodule that mirror
  `Backend/Shared/metal-rates.service.ts` and
  `Backend/Shared/shop-settings.service.ts`.
- Interfaces mirroring `Backend/Shared/interfaces/{cart,metal-rate,shop-settings,product}.ts`
  should be added under `client/app/interfaces/Shared/` (or a
  `client/app/models/` equivalent) so Angular components have typed views
  of the same shapes.

**Deferred / not verified**

- No Angular / renderer components were touched — Workstream B owns the
  client submodule.
- e-invoice IRN + QR generation is schema-ready (columns exist on
  `invoices`) but no code path yet builds them; deferred to P2 per the
  plan.
- Auto round-off is a per-line vs invoice-level policy choice. The current
  engine applies round-off ONLY at the invoice level and returns the delta
  as `roundOffAmount`; whether shops want per-line rounding is a P2 UX
  question.

### 7.2 Workstream B — status

**Update: 2026-07-20 — Phase 1 design-system foundation landed inside the `client/` submodule.**

**Scope adjustment (important — read first)**

Two of the four "install" targets in the workstream brief cannot be executed from inside the `client/` submodule alone:

- `client/` is the git submodule; it has **no** `package.json`, `angular.json`, `postcss.config.*`, or `tailwind.config.*` of its own. All npm dependencies and the Angular build wiring live in the parent repo (`Jewellery-Store-Management-System-Electron/package.json` + `angular.json`), which the brief hard-forbids editing during Workstream A's parallel run.
- Consequently, npm-package installs (**Tailwind CSS**, **@spartan-ng/\***, **@ng-icons/core + @ng-icons/lucide**) are **deferred to a follow-up pass** that touches the parent repo. Tailwind v4 is already present in `node_modules` (pulled transitively) but is not wired into `angular.json` `styles`.
- Fonts are served over the network via Google Fonts in `client/index.html` rather than self-hosted WOFF2 in `client/assets/fonts/`, because adding new asset paths would need a matching change in the parent `angular.json` `assets` array. Self-hosting is queued for the same follow-up.

The rest of the foundation was delivered end-to-end without touching parent files.

**What did land — inside `client/` submodule (branch `redesign/ui-modernization`)**

- **Semantic token layer** — `client/styles.scss` rewritten. Radix-inspired 12-step Sand + Amber + Green/Yellow/Red scales exposed as CSS variables. Semantic tokens defined: `--color-bg`, `--color-bg-subtle`, `--color-panel`, `--color-panel-hover`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-border`, `--color-border-subtle`, `--color-border-strong`, `--color-accent`, `--color-accent-hover`, `--color-accent-active`, `--color-accent-fg`, `--color-accent-subtle`, plus `--color-success`, `--color-warning`, `--color-danger` (each with `-hover`, `-fg`, `-subtle`). Shadow + radius scales too.
- **Dark theme** — swapped via `html[data-theme="dark"]`. `@media (prefers-color-scheme: dark)` fallback fires before the theme service boots so there's no light-mode flash. `<html>` gets `data-theme` set by an inline pre-hydration script in `client/index.html`.
- **ThemeService** — `client/app/shared/services/theme.service.ts`. Signal-based, persists to `localStorage` under `jsms.theme`, honors OS preference on first visit, exposes `theme()`, `isDark()`, `toggle()`, `set()`.
- **Fonts** — Inter Variable (Latin), Hind (Devanagari-compatible metric-similar match for Inter), Instrument Serif (display) — all pulled from Google Fonts with `preconnect` + `preload` on the CSS. Font stack in `styles.scss` custom properties: `--font-sans`, `--font-serif`, `--font-mono`. Tabular-nums utility class (`.tnum` / `.tabular-nums`) and serif display class (`.font-serif`) globally available. `font-feature-settings` set on `body` for Inter's cv11/ss03/tnum-off default.
- **Angular Material theme** — kept globally at a reduced surface (azure/orange palettes wired for Material components still in use). Removed pastel violet+rose gradient. Cannot fully unwire without breaking modules that lean on `mat-*` (see below).
- **Login reskin** — `client/app/modules/login/components/`. Warm-ivory background with radial accent wash, centered card, single amber submit CTA, Reactive Forms replacing template-driven, dark-mode support. Theme toggle in the top-right of the login page for pre-auth users. Hindu Devanagari sample kept as a commented reference in the SCSS for typography sanity checks.
- **Dashboard rebuild** — `client/app/modules/dashboard/components/main/`.
  - Killed the 3D pie chart cliche. The new dashboard uses **one line chart** (Chart.js v4, area-fill, token-colored, respects theme swap via a MutationObserver that redraws on `data-theme` change).
  - Three KPI tiles (Revenue / Stock / Customers) with serif totals + tabular-nums delta pills.
  - Top-products list with rank + accent-tinted thumbnail placeholder + a token-colored progress meter.
  - Live-rate card with placeholder data for 22K / 18K / Silver purities — Workstream A will wire the real feed via `get_current_metal_rates`.
  - Recent-orders table redesigned with clickable rows, muted subtext, tokenized badges.
  - Bar-chart / pie-chart / info-card / recent-orders **components remain in the codebase** because inventory still imports `InfoCardComponent`. They're just no longer used on the dashboard.
- **Navbar reskin** — `client/app/shared/components/navbar/`. Added a circular icon-only dark-mode toggle button. Brand wordmark now uses Instrument Serif at desktop widths. All colors driven from tokens.
- **Sidebar reskin** — bridged via token overrides in `styles.scss` (the sidebar's own SCSS lives in `client/assets/partials/_themes.scss` — a large legacy chunk we did not rewrite outright). Menu items now use `--color-accent-subtle` for active state, `--color-bg-subtle` for hover. Active-strip accent bar retained. Logout button re-themed to danger scale.

**Files added / modified**

- Added: `client/app/shared/services/theme.service.ts`
- Rewritten: `client/styles.scss`, `client/index.html`
- Rewritten: `client/app/modules/login/components/login.component.{ts,html,scss}`
- Rewritten: `client/app/modules/dashboard/components/main/main.component.{ts,html,scss}`
- Rewritten: `client/app/shared/components/navbar/navbar.component.{ts,html,scss}`

**Angular Material components still in use (Material theme retained globally, minimal)**

- `customers/` — mat-table, mat-paginator, mat-sort, mat-form-field, mat-select.
- `inventory/` — mat-form-field, mat-select, mat-paginator.
- `orders/` — mat-stepper, mat-table, mat-form-field, mat-select, mat-datepicker.
- `settings/` — mat-form-field, mat-select.
- `shared/components/data-table` — mat-table + mat-paginator.
- Multiple pages — mat-dialog, mat-tooltip, mat-icon.

Migrating these off Material is Phase 1 later scope (per REDESIGN_PLAN section 2). For now they still render because `mat.all-component-themes($jsms-theme)` is still applied at `html { ... }`.

**Dark-mode implementation**

- Mechanism: `<html data-theme="light|dark">` attribute controls token remapping in `styles.scss`. `[data-theme="dark"]` selector overrides the sand + amber scales and the semantic tokens.
- Bootstrap: inline script in `index.html` reads `localStorage['jsms.theme']` or `matchMedia('(prefers-color-scheme: dark)')` **before** Angular hydrates, so first paint is theme-correct.
- Runtime: `ThemeService.toggle()` flips the signal; an `effect()` writes the attribute and persists to localStorage.
- Toggle UI: navbar (all logged-in pages) and login page (pre-auth).

**Typography verification**

The commented Devanagari sample in `login.component.scss` reads `आभूषण दुकान प्रबंधन`. The Hind font family loads at weights 400/500/600/700 alongside Inter. Line-height `--lh-normal: 1.5` and `--lh-relaxed: 1.6` should keep matras from clipping; not visually verified against actual Devanagari headings in a running app because no live UI copy uses Devanagari yet (Phase 3 i18n). To be sanity-checked when the i18n workstream lands.

**Test results (`npm test`, 2026-07-20)**

```
TOTAL: 7 SUCCESS
```

All existing 7 tests pass under Karma + Chrome Headless. No new tests added — the workstream is layout-and-token-focused; visual-regression testing is a separate concern.

**Build results (`npm run build --configuration=development`)**

Application bundle generation completes cleanly. Warnings unchanged from baseline (Sass `@import` deprecations, four CommonJS-not-ESM warnings for sweetalert2/bcryptjs/base64-js/dayjs, five pre-existing NG8107 template optional-chain warnings). No new warnings introduced.

**Deferred / cannot verify inside this workstream**

- Tailwind CSS install + PostCSS wiring — requires editing parent `package.json`, `postcss.config.*`, and `angular.json`. Blocked by concurrency rule.
- @spartan-ng/ui primitives — same reason; requires npm install + Angular CLI schematics that touch `angular.json`.
- @ng-icons/core + @ng-icons/lucide — same reason.
- Self-hosted WOFF2 fonts under `client/assets/fonts/` — the files can be added but the preload strategy needs a parent `angular.json` `assets` entry to serve them. Deferred.
- Live-rate feed is placeholder data — real values wait on Workstream A's `MetalRates` table + `get_current_metal_rates` SP.
- Removing the underlying `assets/partials/_themes.scss` pastel purple layer — the token override bridge in `styles.scss` currently uses `!important` to win specificity over hard-coded colors in that partial. A full rewrite of the partial would eliminate the `!important`s but was out of scope for this pass.

**Submodule commit + pointer bump**

- Branch inside `client/` is still `redesign/ui-modernization` (confirmed with `git branch --show-current`).
- Commits landed inside the submodule; no push.
- **The parent repo's submodule pointer will need bumping separately** — Workstream A's parallel work in `Scripts/Tables/` etc. is still uncommitted on the parent as of this update, so bumping the submodule pointer here would collide. Whoever integrates the two workstreams should `git add client && git commit` on the parent branch at reconciliation time.

---

## 8. Open questions

- Confirm dummy-only data assumption once more before dropping tables in a shared branch. (Answered 2026-07-20: yes, all data is dummy — proceed destructively.)
- Confirm we do not need to preserve any hand-crafted seed data from prior work.
- Design decision on where per-purity metal rates live in the UI on the cart screen: top ticker (always visible) vs collapsible header. Default: ticker.
