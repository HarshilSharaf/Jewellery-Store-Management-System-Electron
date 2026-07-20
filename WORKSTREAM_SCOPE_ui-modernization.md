# UI Modernization workstream scope

**Branch (parent):** `redesign/ui-modernization` @ base `1d1fc50`
**Branch (submodule `client/`):** `redesign/ui-modernization` @ base `4add432`
**Worktree root:** `c:/My Files/My REPOS/project-ui-modernization`
**Baseline validation status:** build passes; tests FAIL with pre-existing TS6053 for missing `client/polyfills.ts` (deleted in WIP standalone-components migration but still referenced by `tsconfig.spec.json:12`).

## In scope

1. **Fix baseline failure**: drop the `client/polyfills.ts` line from `tsconfig.spec.json`. Standalone bootstrap already puts polyfills in `angular.json` `build.polyfills`; specs also need `zone.js`, `zone.js/testing`, `@angular/localize/init` — the `angular.json` `test.polyfills` array already has these.
2. **Consolidate design system to Angular Material M3 only.** Drop the Bootstrap-compat CSS/JS shim entirely. Every `data-bs-toggle` modal template rewrites to `MatDialog`. Every `.btn`, `.card`, `.form-control`, `.table` custom class either goes away in favor of Material equivalents OR gets scoped/renamed to make it clear it's app-specific. Palette lives ONLY in `_variables.scss` — no duplicated `$primary-color` at the top of `data-table.component.scss` or `login.component.scss`.
3. **Fix all 25 high/medium UI bugs** from the discovery report (list below).
4. **Accessibility pass**: aria-labels on all icon buttons, roles on interactive `<a>` without `href`, focus management on drawer/dialog, keyboard navigation, ESC-to-close, correct label `for=` targets.
5. **Responsive fixes**: kill `min-width: 800px` in data-table; add sensible breakpoints for login card; make dashboard cards wrap.
6. **Perf pass**: add `ChangeDetectionStrategy.OnPush` to all shared and page-level components; add `trackBy` to every `@for` loop.
7. **Deduplicate the 4 image-upload components** into one `SharedImageUploadComponent` under `client/app/shared/components/`.
8. **Consolidate 3+ `formatDate` helpers** into one shared pipe or utility.
9. **Fix state bugs**: rename `CartSideBarService.toggleCartSideBar` to actually toggle; make `CartService.setProduct` persist to localStorage; make navbar's `userDisplayName` reactive (use `computed`/`effect`, not a one-shot read).
10. **Add ~10 unit tests** covering: `AuthGuard`, `DatabaseService.prepareResponseData` (empty result, single set, paginated multi-set), `CartService` (empty localStorage, malformed JSON, add/remove), `data-table` filter debounce, `AuthService.login` happy path, `SidebarService` toggle, `PageHeader` back button, `InfoCard` render.
11. Update `sidebar.component.ts:51-54` to remove the dead `/employees` menu item OR add a placeholder route.

## Out of scope

- **DO NOT touch** `Backend/**/*.ts` (Backend workstream owns).
- **DO NOT touch** `client/app/shared/services/Auth/auth.service.ts` — Backend workstream is moving `bcrypt.compare` off the renderer to an IPC handler and owns that file this phase. Leave the file exactly as-is even if you notice smells in it.
- **DO NOT touch** `src-electron/main.js` — Backend workstream owns (adding IPC bridge + hardening).
- **DO NOT touch** `Scripts/**/*.sql` — Backend workstream owns.
- **DO NOT touch** `docker-compose.yml`, `docker/**` — Backend workstream owns.
- **DO NOT bump** any package version in `package.json` — Dependency workstream owns.
- **DO NOT rewrite** `client/app/app.config.ts` bootstrap contract (the two APP_INITIALIZERs must still call `storeService.initializeStore()` then `dbService.initializeDbConnection()` in that order). You may add router/animation providers around them.
- **You MAY touch** `angular.json` styles/scripts arrays to drop unused entries when consolidating design system (drop `animate.css`, drop `fontawesome-free`, drop `bootstrap-compat.js` script). Deps workstream may also touch `angular.json` polyfills; conflict resolution is my responsibility (lead) at Phase 6.

## Priority-ordered UI bug list (from discovery)

**Highest priority — likely runtime crashes / correctness**
1. `client/app/modules/orders/components/prepare-order/components/stepper/stepper.component.ts:49-55` — `effect()` called inside `ngOnInit`; wrong injection context.
2. `client/app/shared/services/cart.service.ts:8-10` — `JSON.parse(getItem('cart_items') ?? '')` throws on empty-string value; also `setProduct()` at :18-20 does not persist to storage.
3. `tsconfig.spec.json:12` — references deleted `client/polyfills.ts`.
4. `client/app/modules/customers/components/view-details/view-details.component.ts:120-123` — `AfterViewChecked` + `changeRef.detectChanges()` = perf loop hazard. Same in `profile-page.component.ts:49-52` and `view-product-details.component.ts:55-58`.
5. `client/app/modules/customers/components/view-details/view-details.component.ts:113-118` — constructor subscribes to `route.params`, never unsubscribes; same pattern in `order-details.component.ts:49-52` and `view-product-details.component.ts:50-52`.

**High priority — data loss / bad UX**
6. `client/app/shared/components/data-table/data-table.component.ts:129-139` — 500ms setTimeout debounce without clearing prior timer; produces request storms.
7. `client/app/modules/inventory/components/inventory-page/inventory-page.component.ts:76` — `infoCardsData.push(...)` in async then-block; never resets; duplicates on route revisit.
8. `client/app/modules/dashboard/components/main/main.component.ts:37-140` — same duplicate-on-revisit pattern for dashboard cards.
9. `client/app/modules/dashboard/components/bar-chart/bar-chart.component.ts:30-63` and `pie-chart.component.ts:32-68` — `new Chart(...)` never calls `chart.destroy()` on re-render. Canvas leak.
10. `client/app/shared/services/cart-side-bar.service.ts:12-14` — `toggleCartSideBar()` only ever sets `true`. Rename or actually toggle.
11. `client/app/shared/components/navbar/add-to-cart/add-to-cart.component.ts:21-29` — 10-second setTimeout on every cart change; never fires animation as intended; leaks timeouts.
12. `client/app/modules/orders/components/orders-page/orders-page.component.ts:88` — dead `Subscription` declaration; also unused `debounceTime`/`distinctUntilChanged` import.
13. `client/app/modules/orders/components/orders-page/orders-page.component.ts:128-131` — search fires DB query per keystroke without debounce.

**Medium priority — polish / correctness**
14. `client/app/shared/components/sidebar/sidebar.component.ts:51-54` — `/employees` route doesn't exist.
15. `client/app/modules/customers/components/add-customer-form/add-customer-form.component.html:162` — validation reads `form.get('phone')` but control is named `phoneNumber`; error never displays.
16. `client/app/modules/customers/components/add-customer-form/add-customer-form.component.html:94-95` — female radio has `id="gender"` (duplicate); label `for="female-radio"` targets nothing.
17. `client/app/modules/customers/components/image-upload/image-upload.component.ts:52-54` — uses `alert()` on invalid file type.
18. `client/app/modules/orders/components/order-payments/order-payments.component.html:34` — `min="1"` in HTML but no `Validators.min` in form control; negative amounts save.
19. `client/app/shared/components/navbar/navbar.component.ts:35` — `userDisplayName` read once in ngOnInit; not reactive.
20. `client/app/modules/customers/components/customers-page/customers-page.component.ts:98-101` — `dialog.afterClosed().subscribe(...)` never unsubscribed.
21. `client/app/modules/orders/services/order.service.ts:11` — dead `apiUrl` field.
22. `client/app/modules/settings/components/settings-page/settings-page.component.ts:39,174` + `login.component.ts:28-30,48-50` — imperative `document.body.style` mutation.
23. Stray `console.log` calls in `auth.guard.ts:17`, `view-details.component.ts:193,225`, `view-product-details.component.ts:191`.
24. `client/app/shared/components/data-table/data-table.component.html:10` — `aria-describedby` points at itself.
25. `client/app/modules/orders/components/print-invoice/print-invoice.component.html:14,26,33` — hardcoded `XXXX` placeholders.

## Accessibility findings (from discovery)

- `navbar.component.html:5-13,21` — clickable `<a>` with `(click)` and no `href` / `role` / keyboard handler.
- `navbar.component.html:24` — search input with no label/aria.
- `add-customer-form.component.html:190-208` — hidden inputs styled with labels-as-buttons.
- `data-table.component.html:53-68` — icon-only action buttons without aria-label.
- `sidebar.component.html:6` — `alt=""` on profile picture.
- `settings-page.component.html:12` — back arrow as `<a>` with no href/role.
- Cart sidebar has no `role="dialog"`, no focus trap, no ESC-to-close.
- Hand-rolled Bootstrap-compat modals lack focus management.

## Responsiveness findings

- `data-table.component.scss:76-79` — `min-width: 800px` on rows forces horizontal scroll on mobile.
- `data-table.component.scss:135-171` — media query shrinks paginator range to `1px !important` (invisible).
- Login page's brand panel hides under 640px; awkward layout between 640-900px.
- Dashboard cards don't wrap.

## Coordination rules

- Commit small logical chunks with descriptive messages. Aim for one bug/one commit or one concern/one commit.
- Submodule commits go on `redesign/ui-modernization` branch inside `client/`. After a batch, push submodule branch, then bump the submodule pointer with a commit in the parent worktree.
- If you must touch a file this doc marks out-of-scope, STOP and write a note to `../COORDINATION_REQUESTS.md` in the parent worktree instead of editing.
- If build breaks, roll back the offending commit rather than piling fixes on top.
- Write `WORKSTREAM_REPORT.md` at the parent worktree root before finishing. Contents: redesigned UI summary, bug fixes with `file:line`, component inventory changes, design-system doc, a11y improvements, screens changed, test results, known limitations.

## Success criteria

- `npm run build` passes with no NEW warnings compared to baseline.
- `ng test --watch=false --browsers=ChromeHeadless` runs (may still have failures if migrating to WTR is Deps' job, but at least no TS6053 for missing polyfills.ts).
- No `data-bs-toggle` attributes remain in templates.
- No `.btn`, `.card`, `.form-control` custom-Bootstrap classes remain (or they're renamed with an `app-` prefix to make ownership clear).
- Grep for `changeRef.detectChanges()` inside `AfterViewChecked` returns nothing.
- Grep for `new Subscription` returns only actually-used subscriptions.
- Grep for `console.log` in `client/app` returns nothing (or only intentional dev-only logs).
