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
  db.prepare(
    `INSERT INTO auditlog (actorUserId, action, entity, entityId, "before", "after")
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    actorUserId,
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

module.exports = {
  newGuid,
  buildImageName,
  likePattern,
  pageBounds,
  truthy,
  writeAudit,
  resolveId,
};
