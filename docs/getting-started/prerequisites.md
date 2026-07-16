# Prerequisites

The following tooling must be available on the machine that will build and run the
application in development mode.

## Required

| Tool         | Minimum version | Notes                                             |
| ------------ | --------------- | ------------------------------------------------- |
| Node.js      | 20.11.0 LTS     | Also provides `npm`.                              |
| npm          | 10+             | Ships with Node 20 LTS.                           |
| Git          | 2.30+           | Required for `git submodule` support.             |
| MySQL server | 8.0             | Either local install or the containerized option. |

Node version is pinned via the `engines.node` field in `package.json`. If you use a
version manager (`nvm`, `fnm`, `volta`), point it at Node 20.11.x LTS.

## Docker path (recommended)

If you plan to run MySQL from Docker (the recommended option; see
[`quick-start-docker.md`](./quick-start-docker.md)), you also need:

| Tool           | Minimum version | Notes                                     |
| -------------- | --------------- | ----------------------------------------- |
| Docker Engine  | 24.x            | Docker Desktop on Windows / macOS is fine |
| Docker Compose | v2 (`docker compose`)                                       |

The included `docker-compose.yml` provisions MySQL 8.0 and runs the SQL scripts under
`Scripts/` on the first container start.

## Manual MySQL path

If you prefer a native MySQL install, you additionally need:

- The `mysql` CLI on your `PATH` (used by the manual quick-start).
- A DBA / root user for creating the database schema and stored procedures.

## Optional but useful

- **VS Code** with the Angular Language Service and MySQL clients (e.g. HeidiSQL,
  DBeaver, MySQL Workbench).
- **electron-log viewer**: log files are plain text (see
  [`runbooks/troubleshooting.md`](../runbooks/troubleshooting.md) for locations).

## Platform notes

- **Windows** is the primary supported platform - all file paths in the codebase use
  backslashes and `app.getPath('pictures')` on Windows returns
  `C:\Users\<user>\Pictures`.
- **macOS / Linux** should work for the Angular dev server, but the file-system
  service currently builds paths with hard-coded backslashes; image save / read will
  need code changes to be portable. Treat non-Windows as best-effort until image
  path handling is normalized.
