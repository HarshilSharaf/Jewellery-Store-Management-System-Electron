# Runbook: troubleshooting

Common failures and where to look first.

## Log locations

The application uses `electron-log`. Default file locations:

| Platform | Path                                                                  |
| -------- | --------------------------------------------------------------------- |
| Windows  | `%USERPROFILE%\AppData\Roaming\com.jewellery.store.management.system\logs\main.log` |
| macOS    | `~/Library/Logs/com.jewellery.store.management.system/main.log`       |
| Linux    | `~/.config/com.jewellery.store.management.system/logs/main.log`       |

The log file is plain text and rotates automatically. Lines the app writes have
prefixes:

- `[INFO FROM CLIENT] ...` - `LoggerService.LogInfo` calls from the renderer,
  forwarded to main via `logger:info` IPC.
- `[ERROR FROM CLIENT] ...` - `LoggerService.LogError` calls, ditto via
  `logger:error`. Error objects are serialized with the message / code / errno /
  sqlState / stack fields explicitly (bare `JSON.stringify(new Error())` yields
  `{}` because Error properties are non-enumerable).

Chromium renderer console lives in the Electron devtools window (`Ctrl+Shift+I`
in dev mode). Chromium DevTools are disabled in the production build.

## Symptom: splash appears but the main window never shows

Usual cause: the renderer's `APP_INITIALIZER` chain never resolved.

1. Open devtools (`Ctrl+Shift+I`) and look at the console.
2. Common errors:
   - `ECONNREFUSED 127.0.0.1:3306` - MySQL isn't running or is on the wrong port.
   - `Access denied for user 'zeus_user'` - wrong credentials in
     `defaultDbInfo` / `currentDbInfo`.
   - `Unknown database 'jewellery'` - init script didn't run; see
     [`docker-mysql.md`](./docker-mysql.md).

Fix the underlying MySQL problem, then either close the app and rerun
`npm run electron`, or navigate to Settings from the auto-redirected page.

## Symptom: `ng serve` fails with `Cannot find module`

You probably didn't run `npm install`, or your `client/` submodule is empty.
Check:

```bash
ls client/app                # should list modules, shared, etc.
git submodule status         # should be non-empty
```

Re-run `npm install` and `git submodule update --init --recursive`.

## Symptom: `npm test` errors about missing polyfills.ts

`tsconfig.spec.json` may still reference `client/polyfills.ts`, which was
deleted during the standalone-components migration. The UI workstream fixes
this - if you're on a branch predating the fix, remove the offending line from
`tsconfig.spec.json` or pull `main`.

## Symptom: images fail to save

Check three things:

1. `app.getPath('pictures')` resolves - on Windows this is
   `C:\Users\<you>\Pictures`. If your user profile is on a non-standard drive
   this can be different.
2. The `Jewellery-Store-Management-System/` directory tree exists and is
   writable. First save auto-creates each subdirectory.
3. The renderer log line "File successfully saved:" appears - if it does, the
   write succeeded and the failure is elsewhere.

## Symptom: dashboard cards show "duplicated" values on route revisit

Known bug (see UI workstream findings). Some card lists are `push`ed onto
without being reset. Refresh the page or navigate away and back once the UI
workstream lands its fix.

## Symptom: "PROTOCOL_CONNECTION_LOST" appears in the log

The MySQL server dropped the connection. The pool auto-reconnects on the next
query. If it recurs, check MySQL's `wait_timeout` variable - the connection
pool sends keepalive pings every 10 seconds (`enableKeepAlive: true`,
`keepAliveInitialDelay: 10000`), which should be inside any reasonable server
timeout.

## Symptom: `docker compose up` fails with "port is already allocated"

Something on the host is bound to 3306. Options:

1. Stop the other service.
2. Change `MYSQL_PORT` in `.env` to a free port (e.g. 3307) and update the
   connection in the Settings page after first launch.

## Symptom: bcrypt compare always returns false

Usually a stale `authData` in `electron-store` referencing a `uid` that no
longer exists after a database reseed. Log out (or delete the `electron-store`
config file, see [`change-db-connection.md`](./change-db-connection.md)) and log
back in.

## Getting more logging out of the app

The `LoggerService` calls have no level configuration - everything is either
`info` or `error`. To see additional detail:

- Run `npm run electron` from a terminal (not the packaged binary) - Electron's
  stdout / stderr becomes visible.
- Open devtools in the main window.
- Uncomment / add temporary `console.debug` lines locally; the UI workstream
  has a policy to remove stray `console.log` before merge.

## Escalation

If a problem persists after the checks above, capture:

1. The last 200 lines of the electron-log file.
2. The renderer devtools console output.
3. `docker compose logs mysql | tail -100` (if using Docker).
4. `docker compose exec mysql mysql -uroot -p -e "SHOW ENGINE INNODB STATUS\G"`.

Attach those to a bug report before pinging maintainers.
