# Jewellery Store Management System

Offline-first desktop app for jewellery retail operations - customers,
inventory, orders, invoicing, and payments. Angular 19 renderer inside an
Electron 40 shell, talking to a local MySQL 8.0 database via stored
procedures.

The Angular UI lives in the [`client/`](./client) Git submodule; the parent
repo holds Electron main-process code, backend services, SQL scripts,
Docker infra, and documentation.

## Quick start

```bash
git clone --recurse-submodules https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
cd Jewellery-Store-Management-System-Electron
cp .env.example .env
docker compose up -d
npm install
npm start          # terminal A: Angular dev server on :4200
npm run electron   # terminal B: Electron shell
```

Log in with the seeded `admin` / `admin123`.

### Installing dependencies (native modules)

The data layer is migrating from MySQL to embedded SQLite (`better-sqlite3`).
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
- [Getting started (Docker)](./docs/getting-started/quick-start-docker.md)
- [Getting started (manual MySQL)](./docs/getting-started/quick-start-manual.md)
- [Architecture](./docs/architecture/high-level.md)
- [Database schema and ERD](./docs/database/schema.md)
- [Stored procedure reference](./docs/database/stored-procedures.md)
- [Runbooks](./docs/runbooks/) - local dev, reset DB, troubleshooting.
- [Security](./docs/security/hardening-checklist.md)
- [Contributing](./CONTRIBUTING.md)

## Requirements

- Node 20.11 LTS
- MySQL 8.0 (Docker recommended)
- Windows is the primary supported platform; other OSes are best-effort.

See [`docs/getting-started/prerequisites.md`](./docs/getting-started/prerequisites.md)
for details.

## License

Not yet chosen. Do not redistribute without permission from the maintainers.
