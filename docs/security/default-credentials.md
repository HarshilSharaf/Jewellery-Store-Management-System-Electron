# Security: default credentials

Every fresh install starts with well-known credentials. **These are dev
defaults, not shipping defaults.** Rotate them before deploying to any real
shop.

## Passwords baked into the codebase

| Credential | Where | Default value |
| ---------- | ----- | ------------- |
| MySQL `root` password | `.env` (`MYSQL_ROOT_PASSWORD`), `docker-compose.yml` | `root@123` |
| MySQL app user + password | `.env` (`MYSQL_USER`, `MYSQL_PASSWORD`) | `zeus_user` / `zeus@123` |
| App user `admin` / `manager` / `cashier` password | Seed hash in `Scripts/Seed/seed-data.sql` | `admin123` |
| electron-store fallback (`defaultDbInfo`) | `Backend/Shared/store.service.ts` (falls back only when `.env` is empty; logs a warning) | matches the MySQL app user |

## Rotating the MySQL root password

Docker path (before first `docker compose up`):

1. Edit `.env`, change `MYSQL_ROOT_PASSWORD`.
2. `docker compose down -v` (only needed if the container was already created
   with the old password - the password is set on first init).
3. `docker compose up -d`.

Existing running MySQL:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY '<new-strong-password>';
FLUSH PRIVILEGES;
```

## Rotating the application MySQL user

Preferred: change credentials via the Settings page in the app (writes
`currentDbInfo`). See [`../runbooks/change-db-connection.md`](../runbooks/change-db-connection.md).

Underlying MySQL change:

```sql
ALTER USER 'zeus_user'@'%' IDENTIFIED BY '<new-strong-password>';
FLUSH PRIVILEGES;
```

Update `.env` so future container rebuilds and manual starts pick up the new
value.

## Rotating the seeded app users' passwords

The seed hash is a bcrypt(10) of `admin123`. To ship a different default:

1. Generate a new hash:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('<newPassword>', 10))"
   ```
2. Replace the `$2a$10$...` string in `Scripts/Seed/seed-data.sql`.
3. Re-seed (see [`../runbooks/reset-database.md`](../runbooks/reset-database.md)).

Even better: on the first admin login in production, immediately open the
Profile page and change the password. This flows through `update_user_details`
and writes a fresh bcrypt hash. Repeat for every seeded user, or delete the
`manager` and `cashier` seed rows before shipping.

## Hardening the DB user

The seeded `zeus_user` only has `EXECUTE` on the schema. It cannot `SELECT`
directly on a table. This is intentional: the entire app talks to stored
procedures. If you have to expand privileges, keep the grant surface narrow:

```sql
-- Bad: full access
GRANT ALL PRIVILEGES ON jewellery.* TO 'zeus_user'@'%';

-- Good: explicit routines only, no direct table access
GRANT EXECUTE ON jewellery.* TO 'zeus_user'@'%';
```

## Follow-ups

- Enforce a password-change flow on the first admin login. Currently there is
  none - the app happily runs with the seeded `admin123` indefinitely.
- Add an audit column (e.g. `users.password_changed_at`) so operators can spot
  seeded accounts that have never rotated.
- Consider dropping the seeded `manager` and `cashier` users from the shipped
  seed and requiring the admin to create them post-install.

See [`hardening-checklist.md`](./hardening-checklist.md) for the wider security
posture.
