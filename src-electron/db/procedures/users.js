/**
 * Users procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Users). Each function returns an array of result
 * sets (same order/shape as the original SP's SELECTs); the router appends the
 * mysql2-compatible sentinel.
 *
 * Notes specific to this domain:
 *   * The users PK column is `uid` (not `id`); LAST_INSERT_ID re-selects use it.
 *   * `permissions` is JSON-as-TEXT — returned as-is (string); the SPs never
 *     parse it, so neither do we.
 *   * No money/weight columns here, but rows still pass through hydrateRows to
 *     keep the read-path convention uniform (harmless no-op).
 *   * Password hashing happens elsewhere (auth:generateHash IPC); these procs
 *     store exactly what the caller passes.
 */

const { hydrateRow, hydrateRows } = require('../money');
const { buildImageName, writeAudit, getUserType } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** Replaces MySQL NOW() for the audit payloads (ISO-8601, matches TEXT cols). */
function nowIso() { return new Date().toISOString(); }

/**
 * RBAC guard shared by add_user/update_user/delete_user. Mirrors the SP:
 * only enforced when an actor is supplied, and a non-admin actor is forbidden.
 * An unknown actor (no row / null type) is NOT blocked, exactly like the SP.
 */
function assertCanManageUsers(db, actorUserId) {
  if (actorUserId == null) { return; }
  const actorType = getUserType(db, actorUserId);
  if (actorType != null && actorType !== 'admin') {
    throw new Error('Error: Forbidden: canManageUsers');
  }
}

/**
 * add_user(userName, email, password, type, permissions, actorUserId)
 * Admin-only when an actor is supplied. Inserts the user + an audit row in one
 * transaction, then re-selects the new uid (was SELECT LAST_INSERT_ID()).
 * Returns one result set: [{ userId }].
 */
function add_user(db, params) {
  const [userName, email, password, type, permissions, actorUserId] = params;

  assertCanManageUsers(db, actorUserId);

  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO users (userName, email, password, type, permissions)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      nz(userName), nz(email), nz(password),
      type == null ? 'employee' : type,   // COALESCE(p_type, 'employee')
      nz(permissions),
    );
    const newId = info.lastInsertRowid;

    writeAudit(db, {
      actorUserId: nz(actorUserId),
      action: 'add_user',
      entity: 'users',
      entityId: newId,
      after: { userName: nz(userName), email: nz(email), type: nz(type) },
    });

    return newId;
  });

  const newId = tx();
  const row = db.prepare('SELECT uid AS userId FROM users WHERE uid = ?').get(newId);
  return [[hydrateRow(row)]];
}

/**
 * delete_user(userId, actorUserId)
 * Admin-only (when actor supplied) and blocks self-delete. Deletes + audits in
 * one transaction. No result set (SP has no SELECT).
 */
function delete_user(db, params) {
  const [userId, actorUserId] = params;

  assertCanManageUsers(db, actorUserId);

  if (actorUserId != null && Number(userId) === Number(actorUserId)) {
    throw new Error('Error: delete_user: cannot delete self');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM users WHERE uid = ?').run(nz(userId));
    writeAudit(db, {
      actorUserId: nz(actorUserId),
      action: 'delete_user',
      entity: 'users',
      entityId: userId,
      after: { deletedAt: nowIso() },
    });
  });
  tx();

  return [];
}

/**
 * delete_user_image(uid)
 * Clears imagePath, returning the previous filename so the caller can unlink it.
 * Returns one result set: [{ oldFileName }].
 */
function delete_user_image(db, params) {
  const [uid] = params;

  const prev = db.prepare('SELECT imagePath FROM users WHERE uid = ?').get(nz(uid));
  const oldFileName = prev ? prev.imagePath : null;

  db.prepare('UPDATE users SET imagePath = NULL WHERE uid = ?').run(nz(uid));

  return [[hydrateRow({ oldFileName })]];
}

/**
 * get_all_users() — list ordered by uid. permissions returned as raw JSON text.
 */
function get_all_users(db) {
  const rows = db.prepare(
    `SELECT uid, userName, email, type, permissions, imagePath,
            created_on, lastLoginAt, last_login_date
       FROM users
      ORDER BY uid ASC`
  ).all();
  return [hydrateRows(rows)];
}

/**
 * get_user_details(userId) — SELECT * for a single user (includes password hash
 * and raw permissions text, matching the SP).
 */
function get_user_details(db, params) {
  const [userId] = params;
  const rows = db.prepare('SELECT * FROM users WHERE uid = ?').all(nz(userId));
  return [hydrateRows(rows)];
}

/** get_user_image(uid) — just the imagePath column. */
function get_user_image(db, params) {
  const [uid] = params;
  const rows = db.prepare('SELECT imagePath FROM users WHERE uid = ?').all(nz(uid));
  return [hydrateRows(rows)];
}

/**
 * update_user(userId, userName, email, type, permissions, actorUserId)
 * Admin-only when an actor is supplied. COALESCEs userName/email/type (null =
 * keep existing) but assigns permissions directly (null clears it), matching
 * the SP. Updates + audits in one transaction. No result set.
 */
function update_user(db, params) {
  const [userId, userName, email, type, permissions, actorUserId] = params;

  assertCanManageUsers(db, actorUserId);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users
          SET userName    = COALESCE(?, userName),
              email       = COALESCE(?, email),
              type        = COALESCE(?, type),
              permissions = ?
        WHERE uid = ?`
    ).run(nz(userName), nz(email), nz(type), nz(permissions), nz(userId));

    writeAudit(db, {
      actorUserId: nz(actorUserId),
      action: 'update_user',
      entity: 'users',
      entityId: userId,
      after: { userName: nz(userName), email: nz(email), type: nz(type) },
    });
  });
  tx();

  return [];
}

/**
 * update_user_details(userId, userName, password, email)
 * No RBAC (self-service profile edit). userName/email assigned directly;
 * password kept when null (IFNULL -> COALESCE). No result set.
 */
function update_user_details(db, params) {
  const [userId, userName, password, email] = params;

  db.prepare(
    `UPDATE users
        SET userName = ?,
            password = COALESCE(?, password),
            email    = ?
      WHERE uid = ?`
  ).run(nz(userName), nz(password), nz(email), nz(userId));

  return [];
}

/**
 * update_user_image(uid, imageFileName)
 * Derives the stored filename `user-<uid>-<original>` (was CONCAT; buildImageName
 * yields the same string and returns null when no upload). Returns one result
 * set: [{ imagePath, oldFileName }].
 */
function update_user_image(db, params) {
  const [uid, imageFileName] = params;

  const prev = db.prepare('SELECT imagePath FROM users WHERE uid = ?').get(nz(uid));
  const oldFileName = prev ? prev.imagePath : null;

  // buildImageName(guid, tag, original) => `${guid}-${tag}-${original}`; passing
  // ('user', uid, imageFileName) reproduces the SP's `user-<uid>-<file>` exactly.
  const newName = buildImageName('user', uid, imageFileName);

  db.prepare('UPDATE users SET imagePath = ? WHERE uid = ?').run(newName, nz(uid));

  const row = db.prepare('SELECT imagePath FROM users WHERE uid = ?').get(nz(uid));
  const imagePath = row ? row.imagePath : null;

  return [[hydrateRow({ imagePath, oldFileName })]];
}

module.exports = {
  add_user,
  delete_user,
  delete_user_image,
  get_all_users,
  get_user_details,
  get_user_image,
  update_user,
  update_user_details,
  update_user_image,
};
