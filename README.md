# Jewellery Store Management System

Offline-first desktop app for jewellery retail operations - customers,
inventory, orders, invoicing, and payments. Angular renderer inside an
Electron 40 shell, backed by an embedded SQLite database (`better-sqlite3`).
No database server to install: the app creates and migrates its own SQLite
file under the OS user-data directory on first launch.

The Angular UI lives in the [`client/`](./client) Git submodule; the parent
repo holds Electron main-process code, backend services, the SQLite schema
migrations, and documentation.

## Quick start

```bash
git clone --recurse-submodules https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
cd Jewellery-Store-Management-System-Electron
npm ci --ignore-scripts
npm start          # terminal A: Angular dev server on :4200
npm run electron   # terminal B: Electron shell
```

Log in with the seeded `admin` / `admin` (change it before shipping).

### Installing dependencies (native modules)

The data layer uses embedded SQLite (`better-sqlite3`).
`better-sqlite3` v13 ships **N-API prebuilt binaries** (one binary works for
both Node and Electron), so no compilation is needed. However, npm will still
try to auto-compile any package that has a `binding.gyp`, which requires
Python + VS Build Tools. To use the bundled prebuild instead, install with
scripts skipped:

```bash
npm ci --ignore-scripts
```

Use this for local installs and in CI. Only install a full native toolchain
(Python 3 + Visual Studio Build Tools) if you specifically need to compile
native modules from source.

## Documentation

Full docs live under [`docs/`](./docs). Highlights:

- [Overview](./docs/overview.md) - what the app does.
- [Architecture](./docs/architecture/high-level.md)
- [Database schema and ERD](./docs/database/schema.md)
- [Runbooks](./docs/runbooks/) - local dev, reset DB, troubleshooting.
- [Security](./docs/security/hardening-checklist.md)
- [Contributing](./CONTRIBUTING.md)

> Note: parts of `docs/` still describe the previous MySQL/stored-procedure
> architecture and are being updated to reflect the SQLite migration.

## Requirements

- Node 20.19+ (Node 24 supported)
- No database server — SQLite is embedded via `better-sqlite3`.
- Windows is the primary supported platform; other OSes are best-effort.

See [`docs/getting-started/prerequisites.md`](./docs/getting-started/prerequisites.md)
for details.

## License

Not yet chosen. Do not redistribute without permission from the maintainers.
