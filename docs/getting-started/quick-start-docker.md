# Quick start (Docker)

The fastest way to get a working environment. MySQL runs in a container that
auto-provisions the schema, stored procedures, and seed data on first start.

## 1. Clone (including the submodule)

```bash
git clone --recurse-submodules https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
cd Jewellery-Store-Management-System-Electron
```

If you already cloned without `--recurse-submodules`, fetch the submodule now:

```bash
git submodule update --init --recursive
```

## 2. Configure environment

Copy the sample `.env` and adjust if you want non-default credentials:

```bash
cp .env.example .env
```

Defaults:

```
MYSQL_ROOT_PASSWORD=root@123
MYSQL_DATABASE=jewellery
MYSQL_USER=zeus_user
MYSQL_PASSWORD=zeus@123
MYSQL_HOST=localhost
MYSQL_PORT=3306
```

`.env` is `.gitignore`d - never commit it. `docker-compose.yml` picks the values
up automatically.

## 3. Start MySQL

```bash
docker compose up -d
```

The first start runs `docker/init/01-init-db.sh`, which:

1. Creates all tables from `Scripts/Tables/*.sql`.
2. Applies migrations from `Scripts/Migrations/*.sql` (indexes, GUID uniqueness,
   etc.).
3. Creates all stored procedures from `Scripts/Stored-Procedures/**/*.sql`.
4. Runs `Scripts/Seed/seed-data.sql`.
5. Grants `EXECUTE` on the database to the app user.

Verify the container is healthy:

```bash
docker compose ps
docker compose logs mysql | tail -20
```

You should see `=== Database initialization complete ===` in the log.

## 4. Install Node dependencies

```bash
npm install
```

## 5. Run the app

In one terminal, start the Angular dev server:

```bash
npm start
```

Wait until the console reports `Angular Live Development Server is listening on
localhost:4200`.

In a second terminal, launch Electron pointing at the dev server:

```bash
npm run electron
```

The splash screen appears, then the login page. Sign in with any seeded account -
see [`first-run.md`](./first-run.md).

## Stopping

- Close the Electron window (or `Ctrl+C` the terminal).
- `Ctrl+C` the `npm start` terminal.
- Stop MySQL: `docker compose down`.

To wipe the database and re-seed on the next start: `docker compose down -v` (the
`-v` flag drops the named volume). See
[`runbooks/reset-database.md`](../runbooks/reset-database.md).
