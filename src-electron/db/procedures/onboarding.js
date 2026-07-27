/**
 * Onboarding-state procedures. Singleton row (id = 1) in `onboarding_state`
 * (see schema/005_onboarding_state.sql). This is the authoritative record of
 * whether the first-run setup wizard has been completed; it lives in the DB so
 * it survives electron-store / appdata resets and rides along with backups.
 *
 * Returns arrays of result sets; the router wraps them in the mysql2-compatible
 * envelope. hydrateRows() is a pass-through here (no money/weight columns).
 */

const { hydrateRows } = require('../money');

/** get_onboarding_state() — the singleton flags. Single result set. */
function get_onboarding_state(db) {
  const rows = db.prepare(
    'SELECT completed, passwordChanged FROM onboarding_state WHERE id = 1'
  ).all();
  return [hydrateRows(rows)];
}

/**
 * set_onboarding_state(completed, passwordChanged)
 * Upsert on the singleton row; values are coerced to 0/1. Returns the stored
 * row so callers can read back the persisted state.
 */
function set_onboarding_state(db, params) {
  const [completed, passwordChanged] = params;

  db.prepare(
    `INSERT INTO onboarding_state (id, completed, passwordChanged, updatedAt)
        VALUES (1, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
        completed       = excluded.completed,
        passwordChanged = excluded.passwordChanged,
        updatedAt       = CURRENT_TIMESTAMP`
  ).run(completed ? 1 : 0, passwordChanged ? 1 : 0);

  const rows = db.prepare(
    'SELECT completed, passwordChanged FROM onboarding_state WHERE id = 1'
  ).all();
  return [hydrateRows(rows)];
}

module.exports = {
  get_onboarding_state,
  set_onboarding_state,
};
