# First run

This page covers what to expect the very first time you launch the app.

## Launch order

1. `npm start` (Angular dev server) - waits until Webpack reports the bundle is
   compiled.
2. `npm run electron` - opens the Electron main process, which:
   - Creates a **hidden** main window pointing at `http://localhost:4200/` (dev) or
     `dist/browser/index.html` (production).
   - Creates a **splash window** loading
     `assets/splashscreens/splashscreen-1/index.html`.
   - Once the Angular app boots and finishes its `APP_INITIALIZER` chain, the
     renderer calls the `app:closeSplashscreen` IPC channel - the splash is
     destroyed and the main window is shown.

## What the `APP_INITIALIZER` chain does

Defined in
[`client/app/app.config.ts`](../../client/app/app.config.ts):

1. **`storeService.initializeStore()`**
   - Opens the `electron-store` file (JSON on disk, under the user's Electron
     userData directory).
   - Reads `authData` and expires it if past its 24-hour window.
   - Reads `defaultDbInfo`. If missing, seeds it from `.env` values (falling back
     to the documented defaults with a warning).
2. **`dbService.initializeDbConnection()`**
   - Reads `currentDbInfo` (user-overridden) or falls back to `defaultDbInfo`.
   - Asks the main process to open the MySQL pool with those credentials.
   - On failure: shows a SweetAlert2 error dialog and routes to `/settings` so the
     user can fix the connection info without editing files.

## Default seeded users

`Scripts/Seed/seed-data.sql` creates three users. All share the same password:

| Username  | Email                          | Role       | Password  |
| --------- | ------------------------------ | ---------- | --------- |
| `admin`   | `admin@jewellerystore.com`     | `admin`    | `admin123` |
| `manager` | `manager@jewellerystore.com`   | `manager`  | `admin123` |
| `cashier` | `cashier@jewellerystore.com`   | `employee` | `admin123` |

The stored password hash is a bcrypt(10) of the string `admin123`. See
[`security/default-credentials.md`](../security/default-credentials.md) for how to
rotate them before shipping to a real shop.

## First-launch checklist

- [ ] Splash appears, then main window appears within a few seconds.
- [ ] Login page renders with the two "Sign In" / "Continue" controls.
- [ ] Log in as `admin` / `admin123` - lands on the dashboard.
- [ ] Dashboard cards populate (revenue, sales/labour, top categories, master
      category stock, recent orders).
- [ ] Sidebar navigation to **Customers**, **Inventory**, **Orders**,
      **Categories**, **Settings**, **Profile** works.
- [ ] `Pictures/Jewellery-Store-Management-System/` directory appears when you
      add a customer or product image.

If any step fails, jump to [`runbooks/troubleshooting.md`](../runbooks/troubleshooting.md).
