-- =====================================================================
-- SQLite migration version 5 — onboarding state (singleton)
--
-- Persists first-run / setup-wizard completion in the DATABASE (not
-- electron-store), so it survives config/appdata resets, travels with the
-- shop's backups, and is per-shop rather than per-machine. Singleton row
-- (id = 1), same pattern as shopsettings.
--
-- ONE-TIME seed heuristic (runs once, on this migration only): an install
-- that already has a configured shop (a shopsettings row with a non-empty
-- shopName) has clearly finished setup, so it upgrades as completed = 1
-- rather than forcing existing users back through the wizard. A genuinely
-- fresh install (baseline seeds only the admin user, no shopsettings row)
-- starts at completed = 0. After this seed the row is authoritative: only the
-- wizard's own writes or the "Replay setup" action change it — nothing
-- silently re-derives it at runtime.
-- =====================================================================

CREATE TABLE onboarding_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  completed       INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  passwordChanged INTEGER NOT NULL DEFAULT 0 CHECK (passwordChanged IN (0, 1)),
  updatedAt       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO onboarding_state (id, completed, passwordChanged)
SELECT
  1,
  CASE WHEN cfg > 0 THEN 1 ELSE 0 END,
  CASE WHEN cfg > 0 THEN 1 ELSE 0 END
FROM (
  SELECT COUNT(*) AS cfg
    FROM shopsettings
   WHERE shopName IS NOT NULL AND TRIM(shopName) <> ''
);
