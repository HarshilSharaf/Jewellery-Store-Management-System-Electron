# Testing

## How to run tests

```bash
npm test
```

`npm test` is the canonical entry point. Everything CI runs, everything a
reviewer will run, everything a contributor should run before pushing.

The command is a thin wrapper: it invokes the Angular CLI test runner
configured in `angular.json`. Do not rely on the underlying tool (Karma, Web
Test Runner, or whatever it is next) directly - always go through
`npm test` so the config stays authoritative in one place.

### Headless / CI

The default configuration launches a headless Chromium. If your local
`ng test` still opens a real browser window, run:

```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

CI does this automatically.

### One-off filter

Run only the specs matching a pattern (Jasmine's `fdescribe`/`fit` also works
inline):

```bash
npm test -- --include='**/customer-data.service.spec.ts'
```

## Where tests live

Unit tests live **alongside** the code they test - `foo.ts` next to `foo.spec.ts`.
There is no `tests/` folder.

Coverage is currently sparse. The UI workstream is adding ~10 tests around the
riskiest areas:

- `AuthGuard.canActivate`
- `DatabaseService.prepareResponseData` (empty, single-set, multi-set)
- `CartService` (empty storage, malformed JSON, add/remove)
- `AuthService.login` happy path
- `data-table` filter debounce
- `SidebarService.toggle`
- `PageHeader` back button behavior
- `InfoCard` render

## Writing tests

- **Framework**: Jasmine + Angular TestBed.
- **File name**: match source, add `.spec.ts` suffix.
- **Scope**: unit tests only. There is no integration or E2E harness in the
  repo. Playwright / Cypress is a Phase 6+ conversation.

Skeleton:

```ts
import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [CartService] });
    service = TestBed.inject(CartService);
  });

  it('returns empty cart when storage is untouched', () => {
    expect(service.getProducts()).toEqual([]);
  });

  it('gracefully handles malformed cart_items', () => {
    localStorage.setItem('cart_items', 'not json');
    expect(service.getProducts()).toEqual([]);
  });
});
```

## Mocking the IPC bridge

Renderer code depends on `window.electronAPI`. In tests, stub it before
`TestBed` gets a chance to inject the real service:

```ts
beforeEach(() => {
  (window as any).electronAPI = {
    db: { execute: jasmine.createSpy().and.resolveTo([]) },
    store: { get: jasmine.createSpy().and.resolveTo(null),
             set: jasmine.createSpy().and.resolveTo(true),
             delete: jasmine.createSpy().and.resolveTo(true) },
    auth: { compareHash: jasmine.createSpy().and.resolveTo(true) },
    // ... other groups as needed
  };
});
```

For services that hold a reference to `electronAPI` at construction time
(currently none - they call through it at method invocation time), inject a
factory / provider.

## Testing stored procedures

Stored procedures are **not** exercised by the JS test suite. Verification is
manual and lives in the runbooks:

1. Reset the database (see [`../runbooks/reset-database.md`](../runbooks/reset-database.md)).
2. Exercise the workflow through the UI or via a MySQL client:
   ```sql
   CALL get_all_customers(true, 10, 1, false, '');
   CALL save_order(...);
   ```
3. Confirm the returned rows and side effects match expectations.

A future workstream may introduce a `docker compose exec mysql` based
integration test harness; there is no such harness today.

## Known caveats

- **Baseline currently fails** on some branches because
  `tsconfig.spec.json` still references `client/polyfills.ts`, which was
  deleted during the standalone-components migration. The UI workstream owns
  the fix. After it lands, `npm test` should be green on `main`.
- **No coverage gate.** Nothing enforces test coverage today; adding one is a
  Phase 6+ conversation.
- **Renderer-only.** The main process (`src-electron/main.js`) has no unit
  tests; it's driven manually via the app lifecycle.
