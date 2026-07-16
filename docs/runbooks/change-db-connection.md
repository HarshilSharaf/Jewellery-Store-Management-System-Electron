# Runbook: change the database connection

Every install stores its MySQL credentials in `electron-store`. Two keys:

- `defaultDbInfo` - seeded from `.env` on first launch; the fallback used when
  no user override exists.
- `currentDbInfo` - the user-supplied override that takes precedence.

The **Settings** page (`/settings` in the app) is the primary way to change the
connection. If the app can't connect at all it auto-navigates you to that page.

## Via the UI

1. Open the app. If startup fails, you land on Settings automatically. Otherwise
   click the gear icon in the sidebar or navbar.
2. Fill in host, port, database name, username, password.
3. Click **Save**. The renderer writes the new values under `currentDbInfo` and
   requests an app relaunch via `electronAPI.app.relaunch`.
4. Electron closes and restarts. On restart, `DatabaseService.initializeDbConnection`
   picks up `currentDbInfo` and opens the pool.

If the new credentials also fail, you'll be routed back to Settings with an
error banner. Fix and retry.

## Via `.env` (before first launch only)

If you have never launched the app yet, editing `.env` before starting is
enough - the first-launch code copies `.env` values into `defaultDbInfo`.

Once `defaultDbInfo` is written, subsequent `.env` edits are **ignored** by the
running app (they still matter for Docker). To force a reload from `.env`, wipe
the `electron-store` file (see below).

## Manual: wipe `electron-store`

The `electron-store` file is a plain JSON blob at:

| Platform | Path                                                            |
| -------- | --------------------------------------------------------------- |
| Windows  | `%APPDATA%\com.jewellery.store.management.system\config.json`   |
| macOS    | `~/Library/Application Support/com.jewellery.store.management.system/config.json` |
| Linux    | `~/.config/com.jewellery.store.management.system/config.json`   |

Delete the file, restart the app, and it will re-seed `defaultDbInfo` from
`.env`.

## What's stored where

```
electron-store config.json
+-- defaultDbInfo:                (seeded from .env)
|     DATABASE_HOST, PORT, NAME, USERNAME, PASSWORD, LAST_UPDATED_ON
+-- currentDbInfo:                (user override, may be absent)
|     ...same shape as above
+-- authData:                     (present only when logged in)
      uid, userName, email, type, lastLogin, expiration
```

## Common pitfalls

- **Localhost vs 127.0.0.1.** MySQL treats these differently for users bound to
  `'@localhost'` vs `'@%'`. The seeded `zeus_user` is bound to `'@%'` so either
  works.
- **Docker port conflict.** If MySQL is already running on the host on 3306,
  the container will fail to bind. Change `MYSQL_PORT` in `.env` (e.g. `3307`)
  and update the connection in Settings to match.
- **Windows Defender firewall.** First launch may prompt for network permission
  for the MySQL client. Allow "Private networks" only.
