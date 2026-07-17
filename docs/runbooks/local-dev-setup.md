# Runbook: local dev setup

Step-by-step for someone who has just cloned the repo and wants a running local
environment.

## 1. Verify prerequisites

- Node 20.11 LTS + npm 10+
- Git 2.30+
- Docker Desktop (recommended) OR MySQL 8.0

See [`../getting-started/prerequisites.md`](../getting-started/prerequisites.md).

## 2. Clone with submodules

```bash
git clone --recurse-submodules https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
cd Jewellery-Store-Management-System-Electron
```

If you cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

The `client/` directory should now contain the Angular app. If it is empty,
resolve submodule issues before continuing.

## 3. Create `.env`

```bash
cp .env.example .env
```

Adjust the values if you want non-default credentials. `.env` is `.gitignore`d.

## 4. Start MySQL

**Docker (recommended):**

```bash
docker compose up -d
docker compose logs -f mysql   # wait for '=== Database initialization complete ===' then Ctrl+C
```

**Manual:** follow [`../getting-started/quick-start-manual.md`](../getting-started/quick-start-manual.md).

## 5. Install Node deps

```bash
npm install
```

If you see `EPERM` errors on Windows, close any running Electron / Node process
and retry.

## 6. Run

Two terminals:

```bash
# terminal A
npm start
```

Wait for `Angular Live Development Server is listening on localhost:4200`.

```bash
# terminal B
npm run electron
```

## 7. Verify

- Splash shows, then the login page renders.
- Sign in as `admin` / `admin123`.
- Dashboard loads without errors.

If any step fails, jump to [`troubleshooting.md`](./troubleshooting.md).

## Working on the client submodule

The Angular app is a Git submodule at `client/`. To make changes to it:

1. `cd client`
2. Check out the desired branch: `git checkout <branch>`
3. Make edits, commit, push inside the submodule.
4. Back in the parent repo, `git add client && git commit -m "chore: bump client
   submodule to <sha>"` to record the new submodule pointer.

Details: [`../contributing/submodule-workflow.md`](../contributing/submodule-workflow.md).

## Convenience scripts

| Command                   | Effect                                       |
| ------------------------- | -------------------------------------------- |
| `npm start`               | `ng serve` on `:4200`                        |
| `npm run electron`        | Launches Electron pointing at `:4200`        |
| `npm run electron-dev`    | Both, via `concurrently`                     |
| `npm run build`           | Production Angular build to `dist/`          |
| `npm run electron-build`  | Build then launch Electron against `dist/`   |
| `npm test`                | Runs the unit test suite (headless)          |
