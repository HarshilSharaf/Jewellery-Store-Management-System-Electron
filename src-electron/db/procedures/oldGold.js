/**
 * Old-gold receipt procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/OldGold). Returns arrays of result sets in the
 * same order the MySQL SPs SELECT; the router appends the mysql2 sentinel.
 *
 * MONEY / WEIGHT boundary (see money.js): storage is INTEGER paise / mg.
 *   - ON WRITE  gram weights -> toMg(); rupee amounts -> toPaise().
 *   - ON READ   every row passes through hydrateRow/hydrateRows, which converts
 *               the money/weight columns (grossWeight, ratePerGram, creditAmount)
 *               back to fixed-precision DECIMAL strings for the renderer.
 *   testedPurityPercent / deductionPercent are REAL percentages (schema REAL),
 *   NOT money — they pass through unconverted.
 *
 * ERROR CONTRACT (normalises the SP's inconsistent EXIT HANDLER): the MySQL
 * save_old_gold_receipt handler SELECTs an error row instead of RESIGNAL, so on
 * a *validation* failure (customer not found) we return
 * [[{ message: 'Error: ...' }]] to match that returned-error-row behaviour (so
 * callers probing r.message keep working). Real SQL errors (constraint/CHECK
 * violations) are left to throw, so they surface as genuine failures.
 */

const { hydrateRow, hydrateRows, toPaise, toMg } = require('../money');
const { newGuid, writeAudit, resolveId } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** number|string|null -> Number or null (REAL percent columns). */
function num(v) { return v == null || v === '' ? null : Number(v); }

/**
 * Builds `customerName` from first/last name in JS (replaces the SP's
 * CONCAT(firstName,' ',lastName)) and drops the raw name columns, so the row
 * shape matches the SP's projection exactly. MySQL CONCAT yields NULL when any
 * argument is NULL — mirrored here.
 */
function withCustomerName(row) {
  const { firstName, lastName, ...rest } = row;
  const customerName = (firstName == null || lastName == null)
    ? null : `${firstName} ${lastName}`;
  return { ...rest, customerName };
}

/**
 * save_old_gold_receipt(
 *   p_customerGuid, p_invoiceGuid, p_grossWeight, p_testedPurityPercent,
 *   p_testedPurityCode, p_deductionPercent, p_ratePerGram, p_creditAmount,
 *   p_remarks, p_actorUserId)
 *
 * Resolves customer (and optional invoice) by GUID, inserts the receipt
 * (weight->mg, rate/credit->paise), audits, then returns the SP's success
 * projection { receiptGuid, receiptId, invoiceId, customerId }. Replaces
 * UUID()/LAST_INSERT_ID()/SELECT..INTO/JSON_OBJECT with JS idioms.
 */
function save_old_gold_receipt(db, params) {
  const [
    p_customerGuid, p_invoiceGuid, p_grossWeight, p_testedPurityPercent,
    p_testedPurityCode, p_deductionPercent, p_ratePerGram, p_creditAmount,
    p_remarks, p_actorUserId,
  ] = params;

  // Validation failure -> error row (mirrors the SP EXIT HANDLER's SELECT).
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));
  if (customerId == null) {
    return [[{ message: 'Error: save_old_gold_receipt: customer not found' }]];
  }

  const invoiceId = (p_invoiceGuid != null && p_invoiceGuid !== '')
    ? resolveId(db, 'invoices', 'invoiceGuid', p_invoiceGuid)
    : null;

  const receiptGuid = newGuid();

  const run = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO oldgoldreceipts
         (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
          testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
       VALUES (?,?,?,?,?, ?,?,?,?,?)`
    ).run(
      receiptGuid, invoiceId, customerId,
      toMg(nz(p_grossWeight)), nz(p_testedPurityCode),
      num(p_testedPurityPercent),
      p_deductionPercent == null ? 0 : Number(p_deductionPercent), // COALESCE(...,0)
      toPaise(nz(p_ratePerGram)), toPaise(nz(p_creditAmount)), nz(p_remarks),
    );
    const receiptId = info.lastInsertRowid;

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'save_old_gold_receipt',
      entity: 'oldgoldreceipts',
      entityId: receiptId,
      after: {
        receiptGuid,
        customerId,
        invoiceId,
        grossWeight: nz(p_grossWeight),
        creditAmount: nz(p_creditAmount),
      },
    });

    return { receiptGuid, receiptId, invoiceId, customerId };
  });

  // No money/weight in the success projection, but hydrate for consistency.
  return [[hydrateRow(run())]];
}

/**
 * get_old_gold_receipt_by_invoice(p_invoiceGuid)
 * Receipts linked to one invoice, joined to the customer, oldest first.
 * Single SELECT -> single result set.
 */
function get_old_gold_receipt_by_invoice(db, params) {
  const [p_invoiceGuid] = params;
  const invoiceId = resolveId(db, 'invoices', 'invoiceGuid', nz(p_invoiceGuid));

  const rows = db.prepare(
    `SELECT r.id, r.receiptGuid, r.invoiceId, r.customerId,
            c.customerGuid, c.firstName, c.lastName,
            r.grossWeight, r.testedPurityCode, r.testedPurityPercent,
            r.deductionPercent, r.ratePerGram, r.creditAmount, r.remarks,
            r.createdAt, r.updatedAt
       FROM oldgoldreceipts r
       JOIN customers c ON c.id = r.customerId
      WHERE r.invoiceId = ?
      ORDER BY r.createdAt ASC`
  ).all(invoiceId);

  return [hydrateRows(rows).map(withCustomerName)];
}

/**
 * get_old_gold_receipts_by_customer(p_customerGuid)
 * All of a customer's receipts, joined to the customer and (optionally) the
 * linked invoice, newest first. Single SELECT -> single result set.
 */
function get_old_gold_receipts_by_customer(db, params) {
  const [p_customerGuid] = params;
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));

  const rows = db.prepare(
    `SELECT r.id, r.receiptGuid, r.invoiceId,
            i.invoiceGuid, i.invoiceNumber,
            r.customerId, c.customerGuid, c.firstName, c.lastName,
            r.grossWeight, r.testedPurityCode, r.testedPurityPercent,
            r.deductionPercent, r.ratePerGram, r.creditAmount, r.remarks,
            r.createdAt, r.updatedAt
       FROM oldgoldreceipts r
       JOIN customers c ON c.id = r.customerId
       LEFT JOIN invoices i ON i.id = r.invoiceId
      WHERE r.customerId = ?
      ORDER BY r.createdAt DESC`
  ).all(customerId);

  return [hydrateRows(rows).map(withCustomerName)];
}

module.exports = {
  save_old_gold_receipt,
  get_old_gold_receipt_by_invoice,
  get_old_gold_receipts_by_customer,
};
