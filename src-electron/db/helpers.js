/**
 * Shared helpers reused by the JS reimplementations of the MySQL stored
 * procedures. Each helper replaces a MySQL idiom that has no direct SQLite
 * equivalent (UUID(), CONCAT for image names, LIKE CONCAT('%',q,'%'), the
 * JSON_OBJECT audit insert, LAST_INSERT_ID re-select, etc.).
 */

const crypto = require('crypto');

/** Replaces MySQL UUID(). */
function newGuid() {
  return crypto.randomUUID();
}

/**
 * Replaces `CONCAT(guid, '-', tag, '-', originalName)` used to derive image
 * filenames in the add/update image procs. Returns null when no upload.
 */
function buildImageName(guid, tag, originalName) {
  if (!originalName) { return null; }
  return `${guid}-${tag}-${originalName}`;
}

/** Replaces `LIKE CONCAT('%', q, '%')` — builds the pattern in JS. */
function likePattern(q) {
  return `%${q == null ? '' : q}%`;
}

/** Pagination math shared by every paged proc (mirrors the SP arithmetic). */
function pageBounds(itemsPerPage, pageNumber) {
  const limit = Math.max(1, Number(itemsPerPage) || 20);
  const page = Math.max(1, Number(pageNumber) || 1);
  return { limit, offset: (page - 1) * limit };
}

/** Coerce a 0/1/boolean SP flag to a real boolean. */
function truthy(v) {
  return v === true || v === 1 || v === '1';
}

/**
 * Audit-log writer. Replaces the repeated
 * `INSERT INTO auditlog (...) VALUES (..., JSON_OBJECT(...))` in mutating
 * procs. `before`/`after` are JS objects (stored as JSON text).
 */
function writeAudit(db, { actorUserId = null, action, entity, entityId = null, before = null, after = null }) {
  // An audit row must never block the business transaction it records. If the
  // actor no longer exists (e.g. a stale authData.uid persisted across a DB
  // switch, or a deleted user), null the FK rather than tripping
  // auditlog.actorUserId -> users.uid and failing the whole write.
  let actor = actorUserId;
  if (actor != null && !db.prepare('SELECT 1 FROM users WHERE uid = ?').get(actor)) {
    actor = null;
  }
  db.prepare(
    `INSERT INTO auditlog (actorUserId, action, entity, entityId, "before", "after")
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    actor,
    action,
    entity,
    entityId == null ? null : String(entityId),
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
  );
}

/** Replaces `SELECT id INTO @x FROM t WHERE <guidCol> = ?`. */
function resolveId(db, table, guidColumn, guidValue) {
  const row = db.prepare(`SELECT id FROM ${table} WHERE ${guidColumn} = ?`).get(guidValue);
  return row ? row.id : null;
}

/** Reads a user's role for the RBAC guards embedded in mutating procs. */
function getUserType(db, uid) {
  if (uid == null) { return null; }
  const row = db.prepare('SELECT type FROM users WHERE uid = ?').get(uid);
  return row ? row.type : null;
}

/**
 * Percentage-growth idiom shared by the dashboard count procs
 * (get_revenue_of_six_months, get_total_stock, get_total_customers, ...).
 * Guards div-by-zero the way the SPs do: no prior value -> 100% if there's
 * a current value, else 0. Returns a Number rounded to 2 decimals.
 */
function computeGrowth(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev > 0) { return Math.round(((cur - prev) / prev) * 10000) / 100; }
  return cur > 0 ? 100 : 0;
}

module.exports = {
  newGuid,
  buildImageName,
  likePattern,
  pageBounds,
  truthy,
  writeAudit,
  resolveId,
  getUserType,
  computeGrowth,
};
