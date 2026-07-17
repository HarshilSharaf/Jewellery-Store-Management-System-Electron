# Contributing

Thanks for your interest in contributing.

This is a two-repo layout: the parent repository holds Electron, backend
services, SQL scripts, Docker, and docs. The Angular UI lives in the
[`client/`](./client) Git submodule.

Start here:

- [Coding standards](./docs/contributing/coding-standards.md)
- [Submodule workflow](./docs/contributing/submodule-workflow.md)
- [Testing](./docs/contributing/testing.md)
- [Local dev setup](./docs/runbooks/local-dev-setup.md)

Ground rules:

1. Small, focused pull requests. One concern per PR.
2. `npm run build` and `npm test` must be green before you ask for review.
3. Commits follow `<area>: <change>` (e.g. `fix(customers): unsubscribe from
   route params`).
4. Never commit secrets. `.env` is `.gitignore`d; do not add tracked files
   containing credentials.
5. Schema changes go through `Scripts/Migrations/V<NNN>__*.sql`; never edit
   an existing table DDL. See
   [`docs/database/migrations.md`](./docs/database/migrations.md).
6. All Node access from the renderer flows through the `window.electronAPI`
   IPC bridge. Do not add new `window.require(...)` calls.

Bug reports and feature requests are welcome via GitHub Issues. Include
reproduction steps, log excerpts (see
[`docs/runbooks/troubleshooting.md`](./docs/runbooks/troubleshooting.md)),
and screenshots for UI issues.
