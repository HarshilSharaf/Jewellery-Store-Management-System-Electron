# Coding standards

House rules for contributing to this codebase. These are conventions in use
today plus the direction the modernization sweep is pushing toward - follow
them for new code.

## TypeScript

- **`strict: true`** in `tsconfig.json`. Do not weaken.
- **`noImplicitOverride`, `noPropertyAccessFromIndexSignature`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`** are on. Fix violations,
  do not `// @ts-ignore` around them.
- **Prefer explicit return types** on all exported functions and Angular
  service methods.
- **No `any`** unless bridging an untyped native module. When you do, name it
  (`WindowWithElectronAPI`) or narrow immediately.

## Angular

- **Standalone components everywhere.** Do not add `NgModule` declarations for
  new code.
- **`ChangeDetectionStrategy.OnPush`** on every component. Wire inputs with
  signals or observables so `OnPush` is meaningful.
- **`trackBy` on every `@for`** (Angular 17+ new template syntax) or `*ngFor`.
- **Signals over subjects** for local component state. Use RxJS only where you
  actually consume it as a stream (route params, HTTP, form value changes).
- **Never call `changeDetectorRef.detectChanges()` inside `AfterViewChecked`.**
  That produces a loop hazard. If you find you need `detectChanges`, redesign.
- **Subscriptions must be cleaned up.** Prefer `takeUntilDestroyed()` (Angular
  17+) or an `async` pipe. Do not `subscribe(...)` in a constructor.

## Backend service layer (`Backend/**/*.ts`)

- Every method starts with a call to `dbService.execute('call <procName>(?, ...);', values)`.
- Do not construct SQL by string concatenation. Parameters go into the second
  argument.
- Wrap multi-step flows (image write + DB call) so partial failure is surfaced
  to the caller, not swallowed.
- The public method signature stays stable across the IPC-bridge move -
  callers do not need to change.

## IPC channels

- One channel per verb: `db:execute`, `db:query`, `store:get`, etc.
- Every channel is registered via `ipcMain.handle` and consumed via
  `ipcRenderer.invoke` - **never** `ipcRenderer.send`/`on` for new code. `invoke`
  gives you a promise per call and clean error propagation.
- The renderer only reaches `ipcMain` via `window.electronAPI.<group>.<method>`.
  Adding a new channel means: (1) add the handler in `main.js`, (2) expose it
  from `preload.js` via `contextBridge`, (3) call the exposed wrapper from
  renderer code.

## Stored procedures

- Filename in `Scripts/Stored-Procedures/<Module>/` matches the procedure name
  in `snake_case.sql` -> `snake_case`.
- Every file starts with `DROP PROCEDURE IF EXISTS \`<name>\`;` so the container
  init re-runs safely.
- Prefer typed parameters (`INT`, `DECIMAL`, `VARCHAR(N)`) over `TEXT` when the
  domain is known.
- Prefer `RESIGNAL` over the "return a `message` column" pattern for
  transactional error paths. New procs should raise; older ones will be migrated
  incrementally.
- Paged queries emit two SELECTs: `totalRecords` then the page.
- Filter soft-deletes with `deletedAt IS NULL`. Watch operator precedence when
  you also filter `isSold`.

## Schema changes

- Never edit an existing file in `Scripts/Tables/`. Ship a new migration under
  `Scripts/Migrations/V<NNN>__<description>.sql`. See
  [`../database/migrations.md`](../database/migrations.md).
- Always ship a `V<NNN>__rollback.sql` next to it - required documentation
  even though nothing auto-runs it.
- Never edit a shipped migration file. Ship V(NNN+1) to fix.

## Logging

- Use `LoggerService.LogInfo(msg)` / `LoggerService.LogError(err, from)`. Both
  flow through IPC to `electron-log` in the main process.
- Prefix info messages with the calling function name so the log stays greppable.
- No stray `console.log` in committed code. `console.error` is fine for
  truly-exceptional cases that the logger can't reach yet.

## Testing

- Unit tests live alongside the code they test (`foo.spec.ts` beside `foo.ts`).
- Run `npm test` locally; it must pass headless (see
  [`testing.md`](./testing.md)).
- Every new AuthGuard / interceptor / service method should ship with at least
  a happy-path and one failure-path test.

## Commits and PRs

- Small, logical commits. One bug fix = one commit.
- Message pattern: `<area>: <what changed>`. Examples:
  - `fix(customers): unsubscribe from route params in view-details`
  - `docs: add migrations runbook`
  - `feat(backend): pool with keep-alive`
- PRs stay under ~400 lines of diff where possible. Split otherwise.
- Never merge a red build. The `npm run build` and `npm test` gates are the
  minimum bar.

## Style

- Prettier / ESLint config is intentionally light. Follow the surrounding file
  style. Two-space indent. Single quotes in TS. Trailing commas where valid.
- SCSS variables live in `client/app/shared/styles/_variables.scss`. Do not
  redeclare `$primary-color` in a component; import the shared value.

## Reviewing

Reviewers look for:

- IPC surface changes (a new `preload.js` method is a public API bump).
- Stored-procedure diff coherence with renderer models.
- Missing `trackBy` and missing `OnPush`.
- Subscription leaks.
- Direct `window.require` (should never appear in new code).
