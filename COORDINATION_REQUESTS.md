# Coordination requests from the Documentation workstream

Filed by the docs workstream (`docs/codebase-documentation`). Route to the
appropriate workstream owner at Phase 6 reconciliation.

## To: UI workstream (submodule owner)

### Proposed: rewrite `client/README.md`

`client/README.md` is currently a stub. Because it lives inside the git
submodule and the submodule branch is owned by the UI workstream, this docs
workstream cannot edit it directly.

Suggested new content for `client/README.md`:

```markdown
# Jewellery Store Management System - Client

This is the Angular 19 renderer for the Jewellery Store Management System. It
is loaded as a Git submodule by the parent Electron shell at
[Jewellery-Store-Management-System-Electron](https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron).

It is not usable on its own - the renderer depends on `window.electronAPI`
which is only exposed inside the Electron preload script. To build and run,
work from the parent repository.

## Layout

- `app/modules/` - feature modules (customers, inventory, orders, dashboard,
  categories, profile, settings, login, main).
- `app/shared/` - shared components, services, styles.
- `app/guards/AuthGuard/` - route guard checking the `authData` session.
- `app/helpers/` - Http interceptors (legacy; slated for removal - no HTTP
  server exists).
- `app/interfaces/` - service-contract interfaces mirrored by the parent's
  `Backend/**/*.service.ts` implementations.

## Working on this submodule

See the [submodule workflow](../docs/contributing/submodule-workflow.md)
document in the parent repo for the commit-and-bump-pointer sequence.

## Coding standards

See the [coding standards](../docs/contributing/coding-standards.md)
document in the parent repo. Highlights:

- Standalone components with `ChangeDetectionStrategy.OnPush`.
- Signals for local state, RxJS for streams.
- Every `@for` / `*ngFor` uses `trackBy`.
- No `window.require(...)`. All Node access is via `window.electronAPI`.
```

Please review, edit for tone, and commit inside the submodule; then bump the
submodule pointer in the parent.

## To: Backend workstream

### Not a request, just a heads-up

The docs describe `Backend/Shared/logger.service.ts` `LogError` as serializing
Error objects with `message / code / errno / sqlState / stack`. That matches
what the Backend workstream scope has promised. If the shipped implementation
diverges (e.g. only some fields, or different names), please raise so the
docs get corrected in the same PR.

The docs also describe an IPC channel inventory
(`docs/architecture/process-model.md`). If the shipped `preload.js` uses a
different channel-name convention (e.g. `db-execute` instead of `db:execute`),
please raise before Phase 6 sign-off.

## To: Dependency workstream

### Not a request, just a heads-up

The docs describe `npm test` as the canonical entry point without naming the
underlying runner (Karma or Web Test Runner). This is deliberate - the
`docs/contributing/testing.md` doc reads correctly whichever way the runner
migration lands. No action needed unless the migration removes `npm test` as
a script.

## To: Lead

### File placement

This file lives at the docs worktree root because the parent repo's
`COORDINATION_REQUESTS.md` did not exist at start-of-phase and this workstream
cannot write outside its own worktree. If a central file exists at Phase 6,
please move / merge as appropriate.
