# Documentation

Welcome to the Jewellery Store Management System documentation. This directory is the
canonical reference for architecture, database schema, runbooks, security posture, and
contribution workflow. Content here describes the intended post-modernization state of
the codebase; drift from the running app should be treated as a bug in either the code
or these docs.

> **⚠️ Data layer changed: MySQL → embedded SQLite.** The app now uses
> [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3); mysql2 is fully
> removed. See [`database/sqlite-migration.md`](./database/sqlite-migration.md) for
> the canonical summary. Pages below that still describe MySQL, `docker compose`,
> stored procedures, or the DB connection settings page are **superseded** by that
> document and are pending rewrite (Docker/manual quick-starts, `docker-mysql` and
> `change-db-connection` runbooks, and the `stored-procedures`/`schema`/`seed-data`
> database pages).

## Contents

- [`overview.md`](./overview.md) - What the app does, who it's for, and the high-level
  capabilities.

### Getting started

- [`getting-started/prerequisites.md`](./getting-started/prerequisites.md) - Required
  tooling and versions.
- [`getting-started/quick-start-docker.md`](./getting-started/quick-start-docker.md) -
  Recommended path. Uses `docker compose` for MySQL.
- [`getting-started/quick-start-manual.md`](./getting-started/quick-start-manual.md) -
  Manual MySQL setup for developers who prefer a local server.
- [`getting-started/first-run.md`](./getting-started/first-run.md) - First launch,
  default credentials, and the splash / settings flow.

### Architecture

- [`architecture/high-level.md`](./architecture/high-level.md) - System context.
- [`architecture/process-model.md`](./architecture/process-model.md) - Electron main
  vs. renderer boundary and IPC surface.
- [`architecture/data-flow.md`](./architecture/data-flow.md) - Renderer -> preload ->
  main -> MySQL pool.
- [`architecture/auth-flow.md`](./architecture/auth-flow.md) - Login, session storage
  in `electron-store`, and expiration.
- [`architecture/file-storage.md`](./architecture/file-storage.md) - Where customer /
  product / user images live on disk.
- [`architecture/module-map.md`](./architecture/module-map.md) - Angular feature
  module -> Backend service wiring.

### Database

- [`database/sqlite-migration.md`](./database/sqlite-migration.md) - **Current.**
  MySQL → SQLite (better-sqlite3) migration: architecture, schema/migrations,
  procs-as-JS, PRAGMAs & indexing, backup, packaging, and dev workflow.
- [`database/schema.md`](./database/schema.md) - Tables and ERD.
- [`database/stored-procedures.md`](./database/stored-procedures.md) - Every stored
  procedure, grouped by module.
- [`database/migrations.md`](./database/migrations.md) - How schema changes ship.
- [`database/seed-data.md`](./database/seed-data.md) - What the seed script inserts.

### Runbooks

- [`runbooks/local-dev-setup.md`](./runbooks/local-dev-setup.md)
- [`runbooks/docker-mysql.md`](./runbooks/docker-mysql.md)
- [`runbooks/reset-database.md`](./runbooks/reset-database.md)
- [`runbooks/change-db-connection.md`](./runbooks/change-db-connection.md)
- [`runbooks/troubleshooting.md`](./runbooks/troubleshooting.md)

### Security

- [`security/default-credentials.md`](./security/default-credentials.md)
- [`security/hardening-checklist.md`](./security/hardening-checklist.md)

### Releases

- [`releases/build-and-package.md`](./releases/build-and-package.md)

### Contributing

- [`contributing/coding-standards.md`](./contributing/coding-standards.md)
- [`contributing/submodule-workflow.md`](./contributing/submodule-workflow.md)
- [`contributing/testing.md`](./contributing/testing.md)
