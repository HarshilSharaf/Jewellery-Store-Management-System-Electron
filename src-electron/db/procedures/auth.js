/**
 * Auth procedures (SQLite reimplementation of Scripts/Stored-Procedures/Auth).
 * Each function returns an array of result sets (array-of-arrays of row objects);
 * the router wraps it in the mysql2-compatible envelope.
 */

const { hydrateRows } = require('../money');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * Role -> default permission map. Replaces the IF/ELSEIF + JSON_OBJECT logic in
 * get_user_permissions. Any unknown role falls back to the all-false object.
 */
function defaultPermissions(type) {
  if (type === 'admin') {
    return {
      costsVisible: true,
      canCancelInvoice: true,
      canBackup: true,
      canDeleteCustomer: true,
      canDeleteProduct: true,
      canEditShopSettings: true,
      canManageUsers: true,
      canForfeitSavingScheme: true,
    };
  }
  if (type === 'manager') {
    return {
      costsVisible: true,
      canCancelInvoice: true,
      canBackup: false,
      canDeleteCustomer: true,
      canDeleteProduct: true,
      canEditShopSettings: true,
      canManageUsers: false,
      canForfeitSavingScheme: false,
    };
  }
  return {
    costsVisible: false,
    canCancelInvoice: false,
    canBackup: false,
    canDeleteCustomer: false,
    canDeleteProduct: false,
    canEditShopSettings: false,
    canManageUsers: false,
    canForfeitSavingScheme: false,
  };
}

/**
 * loginUser(uName)
 * If a user with that userName exists, stamps both last-login columns
 * (was CURRENT_TIMESTAMP() -> datetime('now')) and returns the user row.
 * If no such user exists the SP produced no result set, so we return none
 * (router still appends the sentinel; flatten() yields []).
 */
function loginUser(db, params) {
  const [uName] = params;

  const exists = db.prepare('SELECT 1 FROM users WHERE userName = ?').get(nz(uName));
  if (!exists) { return []; }

  db.prepare(
    `UPDATE users
        SET last_login_date = datetime('now'),
            lastLoginAt     = datetime('now')
      WHERE userName = ?`
  ).run(nz(uName));

  const row = db.prepare(
    `SELECT uid, userName, email, type, permissions, password, lastLoginAt, last_login_date
       FROM users
      WHERE userName = ?`
  ).get(nz(uName));

  return [hydrateRows([row])];
}

/**
 * get_user_permissions(userId)
 * Returns a single row: { userId, type, permissions, defaultPermissions }.
 * `permissions` is the stored JSON parsed to an object, or the role default
 * when the column is NULL (was COALESCE(l_permissions, l_default)).
 * Throws when the user does not exist (was SIGNAL SQLSTATE '45000').
 */
function get_user_permissions(db, params) {
  const [userId] = params;

  const user = db.prepare(
    'SELECT type, permissions FROM users WHERE uid = ? LIMIT 1'
  ).get(nz(userId));

  if (!user) {
    throw new Error('get_user_permissions: user not found');
  }

  const def = defaultPermissions(user.type);
  const stored = user.permissions == null ? null : JSON.parse(user.permissions);

  const row = {
    userId: nz(userId),
    type: user.type,
    permissions: stored == null ? def : stored,
    defaultPermissions: def,
  };

  return [hydrateRows([row])];
}

module.exports = { loginUser, get_user_permissions, defaultPermissions };
