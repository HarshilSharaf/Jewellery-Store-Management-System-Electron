# Runbook: MySQL via Docker

Everything about the dockerized MySQL that ships with the repo.

## Overview

- `docker-compose.yml` defines one service, `mysql`.
- Image: `mysql:8.0`.
- Container name: `jewellery-store-db`.
- Data lives in a named volume: `jewellery-db-data`.
- Init scripts (`Scripts/`) are mounted read-only at `/scripts`.
- `docker/init/01-init-db.sh` is mounted at `/docker-entrypoint-initdb.d/` and
  runs once on first container start against an empty data volume.

## Configuration

Values come from `.env` at the repo root. Copy the template:

```bash
cp .env.example .env
```

Variables:

| Var | Default | Used by |
| --- | ------- | ------- |
| `MYSQL_ROOT_PASSWORD` | `root@123` | container root password |
| `MYSQL_DATABASE`      | `jewellery` | database that gets created |
| `MYSQL_USER`          | `zeus_user` | app user granted EXECUTE |
| `MYSQL_PASSWORD`      | `zeus@123` | password for `zeus_user` |
| `MYSQL_HOST`          | `localhost` | used by the Electron app; unused by the container |
| `MYSQL_PORT`          | `3306`      | host port mapped to the container |

## Common commands

Start / stop:

```bash
docker compose up -d          # start in the background
docker compose ps             # status
docker compose stop           # stop but keep data
docker compose down           # stop + remove container (data volume preserved)
docker compose down -v        # stop + remove container + wipe data volume
```

Logs:

```bash
docker compose logs -f mysql
```

Shell into the container:

```bash
docker compose exec mysql bash
```

Open a MySQL client inside the container:

```bash
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" jewellery
```

Or from your host, if the port is mapped:

```bash
mysql -h 127.0.0.1 -P 3306 -uzeus_user -p jewellery
```

## First-start behavior

When the container boots against an **empty data volume**, MySQL:

1. Creates the database named by `MYSQL_DATABASE`.
2. Creates the user named by `MYSQL_USER` with password `MYSQL_PASSWORD`.
3. Runs everything under `/docker-entrypoint-initdb.d/` in alphabetical order.
   In this repo that means our `01-init-db.sh`, which:
   - Loads every table from `/scripts/Tables/*.sql`.
   - Applies every file under `/scripts/Migrations/*.sql`.
   - Creates every procedure under `/scripts/Stored-Procedures/**/*.sql`,
     stripping `DEFINER=...` clauses that would otherwise fail on the container.
   - Loads seed data from `/scripts/Seed/seed-data.sql`.
   - `GRANT EXECUTE ON jewellery.* TO 'zeus_user'@'%'`.

If the data volume is non-empty, the init script **does not run again**. To
re-run it you must wipe the volume (see [`reset-database.md`](./reset-database.md)).

## Health check

`docker-compose.yml` runs `mysqladmin ping` on a 10-second interval:

```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s
  timeout: 5s
  retries: 5
```

`docker compose ps` shows the health status. The application can poll this
externally, but it also has its own connection-failure handling that routes the
user to `/settings` on failure.

## Files reference

- Compose file: [`../../docker-compose.yml`](../../docker-compose.yml)
- Init script: [`../../docker/init/01-init-db.sh`](../../docker/init/01-init-db.sh)
- SQL sources: [`../../Scripts/`](../../Scripts/)
