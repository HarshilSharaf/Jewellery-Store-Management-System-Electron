# Releases: build and package

Current release story is minimal. This document captures what exists today and
the recommended path forward.

## Current state

The `package.json` scripts are:

| Script                   | Effect                                                    |
| ------------------------ | --------------------------------------------------------- |
| `npm run build`          | `ng build --base-href ./ --configuration=production` -> `dist/browser/` |
| `npm run electron`       | Launches Electron pointing at the current `dist/` build OR the dev server, depending on `ELECTRON_IS_DEV`. |
| `npm run electron-build` | `npm run build` followed by `set ELECTRON_IS_DEV=0 && electron .` (Windows-cmd syntax). |

There is **no packaging step**. `npm run electron-build` just runs the Angular
build then launches Electron pointing at the built assets. It does not produce
a `.exe`, `.dmg`, `.AppImage`, or any redistributable artifact.

## What "release" looks like today

If you want to hand someone a working copy right now, you have two options:

1. **Clone + install.** Give them the repo URL and this documentation.
2. **Zip the built directory.** Run `npm run build`, then zip
   `dist/browser/`, `src-electron/`, `package.json`, `package-lock.json`, and
   `Scripts/`. The recipient runs `npm install --production` and
   `npm run electron-build`. Still requires Node + Electron on the target.

Neither is a real installer.

## Recommended: electron-builder

The intended future path is to add
[`electron-builder`](https://www.electron.build/) as a dev dependency and
configure it to produce:

- Windows: `.exe` NSIS installer + portable `.exe`.
- macOS: `.dmg` (unsigned unless a Developer ID cert is added).
- Linux: `.AppImage`.

Skeleton `package.json` block (illustrative - not yet applied):

```json
{
  "scripts": {
    "dist": "electron-builder --publish never",
    "dist:win": "electron-builder --win --publish never"
  },
  "build": {
    "appId": "com.jewellery.store.management.system",
    "productName": "Jewellery Store Management",
    "directories": { "output": "release" },
    "files": [
      "dist/browser/**/*",
      "src-electron/**/*",
      "package.json"
    ],
    "asar": true,
    "win": { "target": ["nsis", "portable"] },
    "mac": { "target": ["dmg"] },
    "linux": { "target": ["AppImage"] }
  }
}
```

Gaps to close before this can ship:

- **Icon assets.** Need `.ico`, `.icns`, and `.png` at multiple sizes.
- **Auto-update.** Not needed for a single-shop offline install; can be left
  out.
- **Signing.** Windows code-signing certificate + macOS Developer ID +
  notarization are required for anything that won't trigger SmartScreen / Gatekeeper
  warnings.
- **`env` in production.** The current renderer reads DB credentials via
  `electron-store` (seeded from `.env` on first launch). A packaged binary
  cannot ship `.env` - either bundle a default `defaultDbInfo` in the source or
  prompt the user via the Settings page on first launch and store the result.
- **MySQL server.** The app has no bundled MySQL; the deployment story must
  document either "install MySQL 8" or "run the Docker compose stack" before
  first launch.

## Version numbers

`package.json` version is currently `0.0.0`. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for release entries; bump `version`
in `package.json` in the same commit that adds a new changelog entry.

Suggested SemVer-lite policy:

- `0.x.y` while the app has no signed installer or upgrade path.
- Bump `x` when a stored-procedure signature or a database column changes in a
  way that breaks existing installs.
- Bump `y` for UI, bug-fix, and dependency-hygiene releases.
