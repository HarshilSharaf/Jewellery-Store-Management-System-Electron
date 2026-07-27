/**
 * WhatsApp procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/WhatsApp). Returns arrays of result sets in the
 * SAME order the SP SELECTs; the router appends the mysql2 sentinel.
 *
 * No money/weight columns live on whatsappsendlog, but rows are still passed
 * through hydrateRows (harmless — no matching column names). templateVariables
 * is JSON-as-TEXT: the JSON param is stored verbatim and the column passes
 * through as text on read (mirrors the "JSON columns pass through as text" rule
 * for this table; no JSON.parse on the way out).
 *
 * MySQL idioms mapped:
 *   UUID()             -> newGuid()
 *   LAST_INSERT_ID()   -> info.lastInsertRowid, then re-derive the return row
 *   SELECT id INTO @x  -> resolveId()/.get()
 *   SIGNAL 45000       -> throw new Error(...) (router lets it propagate)
 *   COALESCE           -> JS ?? / explicit null checks
 *   NOW() (sent/deliv/read) -> datetime('now') set conditionally by status
 *   CONCAT_WS(' ', ..) -> concatWs()
 *   DATE(col) >= d     -> date(col) >= ?  (TEXT compare)
 */

const { hydrateRows } = require('../money');
const { newGuid, pageBounds, resolveId } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** Replaces CONCAT_WS(sep, ...): joins non-null/non-undefined parts with sep. */
function concatWs(sep, ...parts) {
  return parts.filter((p) => p !== null && p !== undefined).join(sep);
}

/** Treats null/undefined/'' as "absent" (mirrors `x IS NOT NULL AND x <> ''`). */
function present(v) { return v !== null && v !== undefined && v !== ''; }

/**
 * queue_whatsapp_send(p_invoiceGuid, p_customerGuid, p_templateName,
 *   p_templateLanguage, p_templateVariablesJson, p_attachmentUrl,
 *   p_phoneNumber, p_sentByUserId)
 *
 * Resolves the customer (SIGNAL -> throw if absent) and, when an invoiceGuid is
 * supplied, the invoice; inserts a 'queued' row (templateVariables stored as-is)
 * and returns {sendId, sendGuid} (was SELECT ... AS sendId, ... AS sendGuid).
 */
function queue_whatsapp_send(db, params) {
  const [
    invoiceGuid, customerGuid, templateName, templateLanguage,
    templateVariablesJson, attachmentUrl, phoneNumber, sentByUserId,
  ] = params;

  const run = db.transaction(() => {
    const customerId = resolveId(db, 'customers', 'customerGuid', nz(customerGuid));
    if (customerId == null) {
      throw new Error('queue_whatsapp_send: customer not found');
    }

    let invoiceId = null;
    if (present(invoiceGuid)) {
      invoiceId = resolveId(db, 'invoices', 'invoiceGuid', invoiceGuid);
    }

    const sendGuid = newGuid();
    const info = db.prepare(
      `INSERT INTO whatsappsendlog
         (sendGuid, invoiceId, customerId, templateName, templateLanguage,
          templateVariables, attachmentUrl, phoneNumber, status, sentByUserId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`
    ).run(
      sendGuid, invoiceId, customerId, nz(templateName),
      templateLanguage == null ? 'en' : templateLanguage,
      nz(templateVariablesJson), nz(attachmentUrl), nz(phoneNumber), nz(sentByUserId),
    );

    return { sendId: info.lastInsertRowid, sendGuid };
  });

  return [[run()]];
}

/**
 * update_whatsapp_status(p_sendGuid, p_newStatus, p_metaMessageId,
 *   p_errorMessage, p_actorUserId)
 *
 * Looks up the row (throw if absent), validates the status (throw), then updates
 * status + COALESCEd metaMessageId/errorMessage and conditionally stamps the
 * matching timestamp (sentAt/deliveredAt/readAt) with datetime('now') only when
 * the new status matches and the column is still NULL. p_actorUserId is accepted
 * for parity with the SP signature (the SP does not persist it). Returns
 * {sendId, status}.
 */
function update_whatsapp_status(db, params) {
  const [sendGuid, newStatus, metaMessageId, errorMessage /* , actorUserId */] = params;

  const run = db.transaction(() => {
    const row = db.prepare(
      'SELECT id FROM whatsappsendlog WHERE sendGuid = ?'
    ).get(nz(sendGuid));
    if (!row) {
      throw new Error('update_whatsapp_status: send log row not found');
    }
    const sendId = row.id;

    const valid = ['queued', 'sent', 'delivered', 'read', 'failed'];
    if (!valid.includes(newStatus)) {
      throw new Error('update_whatsapp_status: invalid status');
    }

    db.prepare(
      `UPDATE whatsappsendlog
          SET status        = ?,
              metaMessageId = COALESCE(?, metaMessageId),
              errorMessage  = COALESCE(?, errorMessage),
              sentAt        = CASE WHEN ? = 'sent'      AND sentAt      IS NULL THEN datetime('now') ELSE sentAt      END,
              deliveredAt   = CASE WHEN ? = 'delivered' AND deliveredAt IS NULL THEN datetime('now') ELSE deliveredAt END,
              readAt        = CASE WHEN ? = 'read'      AND readAt      IS NULL THEN datetime('now') ELSE readAt      END
        WHERE id = ?`
    ).run(
      newStatus, nz(metaMessageId), nz(errorMessage),
      newStatus, newStatus, newStatus, sendId,
    );

    return { sendId, status: newStatus };
  });

  return [[run()]];
}

/**
 * get_whatsapp_send_log(p_customerGuid, p_status, p_dateFrom, p_dateTo,
 *   p_pageSize, p_page)
 *
 * The SP SELECTs the PAGE first, then the COUNT, so this returns
 * [rows, [countRow]] (SP order, not the usual count-first shape). Optional
 * filters: customer (by guid->id), status, and queuedAt date range. customerName
 * is CONCAT_WS(' ', firstName, lastName) built in JS.
 */
function get_whatsapp_send_log(db, params) {
  const [customerGuid, status, dateFrom, dateTo, pageSize, page] = params;
  const { limit, offset } = pageBounds(pageSize, page);

  let customerId = null;
  if (present(customerGuid)) {
    customerId = resolveId(db, 'customers', 'customerGuid', customerGuid);
  }

  const conds = [];
  const bind = {};
  if (customerId != null) { conds.push('w.customerId = @customerId'); bind.customerId = customerId; }
  if (present(status)) { conds.push('w.status = @status'); bind.status = status; }
  if (present(dateFrom)) { conds.push('date(w.queuedAt) >= @dateFrom'); bind.dateFrom = dateFrom; }
  if (present(dateTo)) { conds.push('date(w.queuedAt) <= @dateTo'); bind.dateTo = dateTo; }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const rawRows = db.prepare(
    `SELECT
        w.id, w.sendGuid, w.invoiceId,
        i.invoiceGuid, i.invoiceNumber,
        w.customerId, c.customerGuid,
        c.firstName, c.lastName,
        w.phoneNumber, w.templateName, w.templateLanguage, w.templateVariables,
        w.attachmentUrl, w.metaMessageId, w.status, w.errorMessage,
        w.sentByUserId, u.userName AS sentByUserName,
        w.queuedAt, w.sentAt, w.deliveredAt, w.readAt
       FROM whatsappsendlog w
       JOIN customers c     ON c.id  = w.customerId
       LEFT JOIN invoices i ON i.id  = w.invoiceId
       LEFT JOIN users u    ON u.uid = w.sentByUserId
       ${where}
      ORDER BY w.queuedAt DESC, w.id DESC
      LIMIT @limit OFFSET @offset`
  ).all({ ...bind, limit, offset });

  const rows = rawRows.map((r) => {
    const { firstName, lastName, ...rest } = r;
    return {
      ...rest,
      customerName: concatWs(' ', firstName, lastName),
    };
  });

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords FROM whatsappsendlog w ${where}`
  ).get(bind);

  return [hydrateRows(reorderLog(rows)), [count]];
}

/**
 * Restores the SP column order (customerName sits between customerGuid and
 * phoneNumber) after the destructure above appended it. Purely cosmetic; the
 * renderer keys by name, not position.
 */
function reorderLog(rows) {
  return rows.map((r) => ({
    id: r.id,
    sendGuid: r.sendGuid,
    invoiceId: r.invoiceId,
    invoiceGuid: r.invoiceGuid,
    invoiceNumber: r.invoiceNumber,
    customerId: r.customerId,
    customerGuid: r.customerGuid,
    customerName: r.customerName,
    phoneNumber: r.phoneNumber,
    templateName: r.templateName,
    templateLanguage: r.templateLanguage,
    templateVariables: r.templateVariables,
    attachmentUrl: r.attachmentUrl,
    metaMessageId: r.metaMessageId,
    status: r.status,
    errorMessage: r.errorMessage,
    sentByUserId: r.sentByUserId,
    sentByUserName: r.sentByUserName,
    queuedAt: r.queuedAt,
    sentAt: r.sentAt,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
  }));
}

/**
 * get_whatsapp_sends_by_customer(p_customerGuid)
 * Single SELECT of a customer's sends (newest first). When the guid does not
 * resolve, customerId is null and `w.customerId = NULL` matches nothing (same
 * as MySQL) -> empty set.
 */
function get_whatsapp_sends_by_customer(db, params) {
  const [customerGuid] = params;
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(customerGuid));

  const rows = db.prepare(
    `SELECT
        w.id, w.sendGuid, w.invoiceId,
        i.invoiceGuid, i.invoiceNumber,
        w.customerId, w.phoneNumber, w.templateName, w.templateLanguage,
        w.templateVariables, w.attachmentUrl, w.metaMessageId, w.status,
        w.errorMessage, w.queuedAt, w.sentAt, w.deliveredAt, w.readAt
       FROM whatsappsendlog w
       LEFT JOIN invoices i ON i.id = w.invoiceId
      WHERE w.customerId = ?
      ORDER BY w.queuedAt DESC, w.id DESC`
  ).all(customerId);

  return [hydrateRows(rows)];
}

/**
 * get_whatsapp_sends_by_invoice(p_invoiceGuid)
 * Single SELECT of an invoice's sends (newest first). customerName is
 * CONCAT_WS(' ', firstName, lastName). Unresolved guid -> empty set.
 */
function get_whatsapp_sends_by_invoice(db, params) {
  const [invoiceGuid] = params;
  const invoiceId = resolveId(db, 'invoices', 'invoiceGuid', nz(invoiceGuid));

  const rawRows = db.prepare(
    `SELECT
        w.id, w.sendGuid, w.invoiceId, w.customerId,
        c.customerGuid, c.firstName, c.lastName,
        w.phoneNumber, w.templateName, w.templateLanguage, w.templateVariables,
        w.attachmentUrl, w.metaMessageId, w.status, w.errorMessage,
        w.queuedAt, w.sentAt, w.deliveredAt, w.readAt
       FROM whatsappsendlog w
       JOIN customers c ON c.id = w.customerId
      WHERE w.invoiceId = ?
      ORDER BY w.queuedAt DESC, w.id DESC`
  ).all(invoiceId);

  const rows = rawRows.map((r) => ({
    id: r.id,
    sendGuid: r.sendGuid,
    invoiceId: r.invoiceId,
    customerId: r.customerId,
    customerGuid: r.customerGuid,
    customerName: concatWs(' ', r.firstName, r.lastName),
    phoneNumber: r.phoneNumber,
    templateName: r.templateName,
    templateLanguage: r.templateLanguage,
    templateVariables: r.templateVariables,
    attachmentUrl: r.attachmentUrl,
    metaMessageId: r.metaMessageId,
    status: r.status,
    errorMessage: r.errorMessage,
    queuedAt: r.queuedAt,
    sentAt: r.sentAt,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
  }));

  return [hydrateRows(rows)];
}

module.exports = {
  queue_whatsapp_send,
  update_whatsapp_status,
  get_whatsapp_send_log,
  get_whatsapp_sends_by_customer,
  get_whatsapp_sends_by_invoice,
};
