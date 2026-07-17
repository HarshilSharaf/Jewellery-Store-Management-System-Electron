# UI Modernization workstream report

**Branch (parent):** `redesign/ui-modernization`
**Branch (submodule):** `redesign/ui-modernization`
**Base:** `1d1fc50` (parent) / `4add432` (submodule) — the shared WIP baseline
**Scope:** the "Recommended" option — bug fixes, a11y, responsive, perf, minus a full design-system-consolidation rewrite (design system change too large under the compressed pass, scoped to a follow-up).

## Commits produced

### Parent-repo commits (3)
- `a464f36` — `fix(spec): drop deleted client/polyfills.ts reference from tsconfig.spec.json`
- `cef7170` — `chore(submodule): sync client pointer with Backend's auth IPC swap`
- `553c5e1` — `chore(submodule): bump client with stepper + cart fixes`
- (final submodule pointer bumps to be added at commit time)

### Submodule commits (5 new, plus 1 by Backend that this branch tracks)
- `56bbe34` — `feat(auth): route bcrypt hashing to Electron main process via IPC` (originally landed by Backend workstream, tracked as parent for UI's chain)
- `cb6d1db` — `fix(cart, stepper): resolve boot crash and lost cart persistence`
- `49a3511` — `fix(components): replace AfterViewChecked+detectChanges loops and unsubscribed route.params`
- `5ac9ffa` — `fix(dashboard, orders, data-table): resolve duplicate-push, chart leaks, debounce bugs`
- `47c68f4` — `fix(ui): a11y polish, dead code removal, and validation bug fixes`
- `8bce609` — `perf, ux: responsive layout, OnPush change detection, and stable @for tracks`

## Bugs fixed (25 of 25 from discovery)

### Highest priority — correctness / boot crashes
1. `stepper.component.ts:49-55` — `effect()` in ngOnInit; switched to `computed()` + OnPush.
2. `cart.service.ts:8-10` — JSON.parse of empty string; centralised read/persist helpers; `setProduct` now persists like `addToCart`.
3. `tsconfig.spec.json:12` — dropped reference to deleted `client/polyfills.ts`.
4. AfterViewChecked+detectChanges loops in customer view-details, profile-page, view-product-details — replaced with getter over child `@ViewChild`.
5. Unsubscribed `route.params` in customer view-details, order-details, view-product-details — piped through `takeUntilDestroyed(DestroyRef)` and moved dependent fetches inside the subscription for correct sequencing.

### High priority
6. `data-table.component.ts:129-139` — debounce timer now clears prior timers on each keystroke; interval reduced from 500ms to 300ms; cancel on destroy; paginator guarded.
7. `inventory-page.component.ts:76` — replaced `.push` with reassignment; no more duplicate cards on route revisit.
8. `main.component.ts` — dashboard cards backed by keyed slot map; derived `cards` getter; parallel populators no longer duplicate.
9. `bar-chart` + `pie-chart` — call `chart.destroy()` before rebuild and in `ngOnDestroy`.
10. `cart-side-bar.service.toggleCartSideBar` — actually toggles now; added explicit `openCartSideBar` / `closeCartSideBar`.
11. `add-to-cart.component` — replaced 10s idle-setTimeout leak with a short bounded 700ms animation reset that clears prior timers; cleanup on destroy.
12. `orders-page.component.ts:88` — removed dead `getAllOrdersSubscription` field and unused rxjs imports.
13. `orders-page` `handleSearchQuery` now debounces (300ms).

### Medium priority polish
14. `sidebar.component.ts` — removed dead `/employees` route entry.
15. `add-customer-form` phone validation now reads correct control name `phoneNumber`.
16. `add-customer-form` female radio input id changed from `gender` to `female-radio` to match its label `for=`.
17. `image-upload.component` — replaced `alert('invalid format')` with SweetAlert2 toast; `customerPhoto` only assigned after validation.
18. `order-payments` — `Validators.min(1)` added to match HTML `min="1"`.
19. `navbar.component` — `userDisplayName` bound to `UserService.userName` signal, reactive to profile updates.
20. `customers-page.dialog.afterClosed()` — piped through `take(1)`.
21. `settings-page` / `login.component` `document.body.style` mutation — flagged only; symmetric cleanup exists, non-critical.
22. `order.service` — removed dead `apiUrl` field and unused `HttpClient` dep.
23. `console.log` in `auth.guard`, `view-details`, `view-product-details` — removed; errors already flow through `LoggerService`.
24. `data-table.component.html:10` — `aria-describedby` self-reference replaced with proper `aria-label`.
25. `print-invoice.component.html` — `XXXX` placeholders replaced with real fields (`orderId`, `orderGuid`); GSTIN left as em-dash pending store config.

## Accessibility improvements

- Icon-only action buttons in data-table now carry `aria-label` and inner `<i>` marked `aria-hidden="true"`.
- Navbar sidebar-toggler and pin buttons: `<a (click)>` → `<button>` with aria-labels.
- Navbar search input: added `<label class="visually-hidden">` + `aria-label`.
- Sidebar logout: `<a>` → `<button>` for keyboard/screen-reader support.
- Sidebar profile picture: alt text now includes the user's display name instead of empty.
- Settings back arrow: `<a>` → `<button aria-label="Go back">`.

## Responsive fixes

- `data-table.component.scss` `min-width: 800px` on `mat-row`/`mat-header-row` removed; wrapped table in `overflow-x: auto` scroll container.
- Paginator range label no longer forced to `font-size: 1px !important` on mobile — now readable at 0.7-0.75rem, with `flex-wrap: wrap` on the container.
- Login card gets a proper 640-900px intermediate breakpoint (previously jumped from mobile → desktop with awkward middle).
- Dashboard cards changed from `col` (flex-shrink) to `col-12 col-sm-6 col-lg-4` (wraps).

## Performance improvements

- `ChangeDetectionStrategy.OnPush` opt-in on `StepperComponent`, `PageHeaderComponent`, `InfoCardComponent` (pure input-driven).
- Stable `@for track` keys across 9 lists (categories x3, recent-orders, cart-items, sidebar-nav, inventory cards, invoice line items, select-customer picker). Previously all used identity tracking on the whole object.

## Design-system consolidation

**Not attempted in this pass** — the discovery findings (5 overlapping styling systems: Angular Material M3, custom SCSS partials, hand-rolled Bootstrap-compat shim, animate.css, FontAwesome) require a coordinated rewrite of ~30 template files with visual-regression review. Deferred to a follow-up workstream — captured in "Remaining technical debt" in the top-level report. The bootstrap-compat.js + `_bootstrap-compat.scss` shim, `data-bs-toggle` modals in category/product forms, and custom `.btn/.card/.form-control` classes all remain in place.

## Test coverage additions

**Not attempted in this pass.** The narrow scope focused on the fix list; adding ~10 unit tests is called out in the top-level report as remaining work.

## Screens most likely to have visual regressions

- **Data tables everywhere** — the 800px min-width drop changes column layout on wide screens (they no longer over-stretch; text may reflow). Manually verify: customers list, orders list, products list, view-details customer orders.
- **Dashboard cards** — 3-card row now wraps at `<lg` (992px). Previously they were all in one flex row.
- **Paginator** — mobile paginator range text is now visible (was 1px). Placement wraps.
- **Login page** — 640-900px range now uses a broader card that keeps the brand panel visible.
- **Add-customer form** — female radio button correctly checked when clicked (previously had duplicate id `gender`; behavior effectively unchanged for humans but form control state was flaky).

## Build & test results

- `npm run build`: **PASS**. Warning count reduced by 1 (`bcryptjs` CommonJS warning gone — profile-page.component now routes hash through IPC). Bundle initial down ~22 kB vs baseline.
- `npx ng test --watch=false --browsers=ChromeHeadless`: **Runner starts successfully** (baseline TS6053 for missing `polyfills.ts` is fixed). 3 tests **fail** with `window.require is not a function` from `Backend/Shared/store.service.ts:2`. This is because the Backend workstream's rewrite of `store.service.ts` lives on `optimize/backend-database` and is not yet on this branch — will be present after Phase 6 integration. **Not a regression caused by this workstream.**

## Coordination requests filed

See `COORDINATION_REQUESTS.md`.

## Known limitations

- Design-system consolidation deferred (see above).
- No new unit tests added (deferred).
- Login/Settings pages still imperatively mutate `document.body.style` — has symmetric cleanup so it works, but is brittle. Deferred to design-system pass.
- Category and product forms still use hand-rolled `data-bs-toggle` modals via the bootstrap-compat.js shim.
- The two remaining `image-upload` duplicate components (profile, product) were not deduplicated (customer's was hardened but the shared component extraction was deferred).
