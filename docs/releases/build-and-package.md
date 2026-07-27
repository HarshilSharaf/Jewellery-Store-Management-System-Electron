# Releases: build and package

The app ships as a **Windows NSIS `.exe` installer** built with
[`electron-builder`](https://www.electron.build/). The data layer is embedded
SQLite (see [`../database/sqlite-migration.md`](../database/sqlite-migration.md)),
so there is **no database server, `.env`, or Docker** to deploy — the installer
is fully self-contained.

## TL;DR

```bash
# one-command local installer  ->  release\Jewellery Store Manager-<version>-x64.exe
npm run dist
```

To publish a versioned build to the GitHub **Releases** page, push a `v*` tag —
CI does the rest (see [Automated releases](#automated-releases-github)).

## Install dependencies

better-sqlite3 v13 ships **N-API prebuilt binaries** (one binary works for both
Node and Electron), so no native compilation is needed.

- **Local dev machines:** `npm ci --ignore-scripts` — npm would otherwise try to
  auto-compile better-sqlite3 via node-gyp (needs Python + VS Build Tools). The
  bundled prebuild is used instead.
- **CI (GitHub runner):** plain `npm ci` — the runner has the toolchain, and
  `electron`'s postinstall (which downloads the Electron binary) must run.

`build.npmRebuild` is `false`, so electron-builder packages the installed native
module as-is (safe because N-API binaries are ABI-portable), and `asarUnpack`
keeps `better-sqlite3` / `serialport` `.node` files outside the asar so they can
be loaded from disk.

## Local build

| Script | Effect |
| --- | --- |
| `npm run build` | Angular production build → `dist/browser/` |
| `npm run pack` | build + `electron-builder --dir` → unpacked app in `release\win-unpacked\` (fast, no installer) |
| `npm run dist` | build + `electron-builder` → **NSIS installer** in `release\` |
| `npm run release` | build + `electron-builder --win --publish always` (uploads to GitHub Releases; needs `GH_TOKEN`) |

Output: `release\Jewellery Store Manager-<version>-x64.exe` plus `latest.yml`
(the auto-update manifest).

> **Windows file-lock gotcha:** if a build fails with
> `remove release\win-unpacked\resources\app.asar: … used by another process`,
> a previous copy of the app is still running **or** a File Explorer window is
> open in `release\` (thumbnail/preview handle). Close it, or build to a clean
> dir: `npx electron-builder -c.directories.output=release-build`. Adding the
> repo to Windows Defender exclusions avoids the lock and speeds builds.

## Automated releases (GitHub)

`.github/workflows/release.yml` builds the installer on `windows-latest` and
publishes it to the repo's **Releases** page.

**Trigger:** push a tag matching `v*`, or run it manually from the Actions tab.

```bash
# 1. bump version to match the tag (electron-builder names artifacts from it)
#    package.json  "version": "1.0.0"
git commit -am "chore: release v1.0.0"
# 2. tag + push
git tag v1.0.0
git push origin main --tags
```

The workflow checks out the repo **and the `client` submodule** (`submodules:
recursive`), runs `npm ci` → `npm run build` → `electron-builder --win
--publish always`, and uploads the `.exe` + `latest.yml` to a **draft Release
`v1.0.0`**. Review it on the Releases page and click **Publish**; users then
download the `.exe` from there.

Notes:
- **Version must equal the tag** (`version: 1.0.0` ⇄ tag `v1.0.0`).
- **Workflow-from-tag:** a tag-triggered run uses the workflow as it exists in
  the tagged commit — commit the workflow before tagging.
- **Submodule access:** the default `GITHUB_TOKEN` works for a public or
  same-account `client` submodule; a *separate private* submodule needs a PAT
  passed to `actions/checkout`.

## What the installed app does at runtime

1. Installs per-user (config: `oneClick:false`, `perMachine:false`,
   `allowToChangeInstallationDirectory:true`).
2. On first launch, `initDatabase()` opens the DB at the OS per-user app-data
   dir — `%APPDATA%\Jewellery Store Manager\jewellery.db` on Windows (**not**
   the repo `demo.db`, which is dev-only). It's created if absent.
3. Migrations `001`–`004` run, seeding reference data (purities, tax slabs) and
   the default **`admin` / `admin`** user. No demo/business data.
4. The shopkeeper configures Shop Identity and enters real data.
5. That DB lives in app-data and is **never touched by installing a new
   version** (`deleteAppDataOnUninstall:false` keeps it even on uninstall), so
   updates never lose data. New versions just apply any pending migrations on
   next launch.

Backups: `db.backup()` snapshot → AES-256-GCM `.db.enc` in the configured backup
dir (or `userData\backups`); `npm run backup:decrypt` reads an archive back to a
plain `.db`.

## Configuration reference (`package.json` → `build`)

- `appId`, `productName` "Jewellery Store Manager", `artifactName`
  `${productName}-${version}-${arch}.${ext}`, `directories.output` = `release`.
- `win.target` = `nsis` (x64); `win.signAndEditExecutable:false` (see gaps).
- `publish` → GitHub provider (`HarshilSharaf/Jewellery-Store-Management-System-Electron`).

## Remaining gaps

- **Code signing.** The build is unsigned (`signAndEditExecutable:false` avoids
  the winCodeSign toolchain), so Windows SmartScreen warns "unknown publisher"
  on first run. A code-signing certificate (stored as an Actions secret) removes
  this; add it before wide distribution.
- **Icon assets.** No custom `.ico` yet — the installer/app use the default
  Electron icon. Add `build.win.icon`.
- **macOS / Linux targets.** Only Windows NSIS is configured today.
- **Auto-update.** `latest.yml` is published, so wiring `electron-updater` is a
  small follow-up if in-app updates are wanted.
- **Default credentials.** `admin`/`admin` must be changed before a real shop
  uses it (force-change-on-first-login is a TODO).

## Version numbers

`package.json` `version` drives artifact + release names. Bump it in the same
commit you tag. Suggested SemVer-lite: `0.x.y` until a signed installer exists;
bump the minor when a schema migration changes existing installs, the patch for
UI/bug-fix/dependency releases.
