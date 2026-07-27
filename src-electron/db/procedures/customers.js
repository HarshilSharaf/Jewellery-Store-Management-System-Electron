/**
 * Customers procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Customers). Returns arrays of result sets.
 */

const { hydrateRow, hydrateRows, fromPaise } = require('../money');
const {
  newGuid, buildImageName, likePattern, pageBounds, truthy,
  writeAudit, resolveId, getUserType,
} = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * add_customer(fName, lName, dob, gender, address, city, state, stateCode,
 *              email, phoneNumber, gstin, pan, remarks, imageFileName)
 * Generates the GUID + image filename in JS (was UUID()/CONCAT in SQL),
 * inserts, then re-selects the new row (was SELECT * WHERE id=LAST_INSERT_ID()).
 */
function add_customer(db, params) {
  const [
    fName, lName, dob, gender, address, city, state, stateCode,
    email, phoneNumber, gstin, pan, remarks, imageFileName,
  ] = params;

  const guid = newGuid();
  const imagePath = buildImageName(guid, 'customer', imageFileName);

  const info = db.prepare(
    `INSERT INTO customers (
        customerGuid, firstName, lastName, dateOfBirth, gender,
        address, city, state, stateCode, email, phoneNumber,
        gstin, pan, remarks, imagePath
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    guid, nz(fName), nz(lName), nz(dob), nz(gender),
    nz(address), nz(city), nz(state), nz(stateCode), nz(email), nz(phoneNumber),
    nz(gstin), nz(pan), nz(remarks), imagePath,
  );

  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  return [[hydrateRow(row)]];
}

/**
 * get_all_customers(fetchImage, itemsPerPage, pageNumber, fetchAll, searchQuery)
 * Paged branch returns 2 result sets ([{totalRecords}], [rows]); fetchAll
 * branch returns 1. Matches the original SP's flattened shape.
 */
function get_all_customers(db, params) {
  const [fetchImage, itemsPerPage, pageNumber, fetchAll, searchQuery] = params;
  const withImage = truthy(fetchImage);
  const hasSearch = searchQuery != null && String(searchQuery).trim() !== '';
  const pattern = likePattern(searchQuery);

  // Skip the 5-column LIKE when there is no search term. The default (no-search)
  // list is the common load, and an unconditional `LIKE '%%'` forces a full-table
  // COUNT instead of a covering-index count over (deletedAt, createdAt).
  const searchClause = hasSearch
    ? ` AND (A.firstName LIKE @p OR A.lastName LIKE @p OR A.phoneNumber LIKE @p
             OR A.email LIKE @p OR A.gstin LIKE @p)`
    : '';
  const where = `WHERE A.deletedAt IS NULL${searchClause}`;

  const selectCols =
    `A.id, A.customerGuid, A.firstName, A.lastName, A.email, A.gender,
     A.city, A.state, A.stateCode, A.phoneNumber, A.gstin, A.pan, A.creditBalance,
     ${withImage ? 'A.imagePath' : 'NULL'} AS imagePath`;

  if (!truthy(fetchAll)) {
    const { limit, offset } = pageBounds(itemsPerPage, pageNumber);
    const countStmt = db.prepare(`SELECT COUNT(A.id) AS totalRecords FROM customers A ${where}`);
    const count = hasSearch ? countStmt.get({ p: pattern }) : countStmt.get();

    const rows = db.prepare(
      `SELECT ${selectCols} FROM customers A ${where}
        ORDER BY A.createdAt DESC LIMIT @limit OFFSET @offset`
    ).all(hasSearch ? { p: pattern, limit, offset } : { limit, offset });

    return [[count], hydrateRows(rows)];
  }

  const rowsStmt = db.prepare(
    `SELECT ${selectCols} FROM customers A ${where} ORDER BY A.createdAt DESC`
  );
  const rows = hasSearch ? rowsStmt.all({ p: pattern }) : rowsStmt.all();
  return [hydrateRows(rows)];
}

/**
 * get_customer_details(p_customerGuid)
 * Single SELECT of the editable/display fields for one non-deleted customer.
 * creditBalance (paise) hydrates to a rupee string.
 */
function get_customer_details(db, params) {
  const [customerGuid] = params;
  const rows = db.prepare(
    `SELECT id, customerGuid, firstName, lastName, dateOfBirth, gender,
            address, city, state, stateCode, email, phoneNumber,
            gstin, pan, remarks, creditBalance
       FROM customers
      WHERE customerGuid = ? AND deletedAt IS NULL`
  ).all(nz(customerGuid));
  return [hydrateRows(rows)];
}

/**
 * get_customer_image(p_customerGuid)
 * Returns the imagePath for a non-deleted customer (single SELECT).
 */
function get_customer_image(db, params) {
  const [customerGuid] = params;
  const rows = db.prepare(
    `SELECT imagePath FROM customers
      WHERE customerGuid = ? AND deletedAt IS NULL`
  ).all(nz(customerGuid));
  return [rows];
}

/**
 * get_customer_orders(p_getCancelledOrders, p_customerGuid, itemsPerPage,
 *                     pageNumber, searchQuery)
 * Count + page of a customer's invoices. Two branches: with-cancelled (adds
 * cancelReason) vs active-only (cancelledAt IS NULL). grandTotal hydrates.
 * NOTE: the original SP LIKEs against grandTotal (was a DECIMAL string in
 * MySQL); here it is INTEGER paise, so numeric search matches the paise
 * representation, not the rupee decimal. Preserved as-is; see risks.
 */
function get_customer_orders(db, params) {
  const [getCancelledOrders, customerGuid, itemsPerPage, pageNumber, searchQuery] = params;
  const pattern = likePattern(searchQuery);
  const { limit, offset } = pageBounds(itemsPerPage, pageNumber);
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(customerGuid));

  const numItemsSub =
    '(SELECT COUNT(*) FROM invoicelineitems B WHERE B.invoiceId = A.id) AS numberOfLineItems';
  const search =
    '(A.invoiceNumber LIKE @p OR A.grandTotal LIKE @p OR A.remarks LIKE @p)';

  if (truthy(getCancelledOrders)) {
    const where = `WHERE A.soldToCustomer = @cid AND ${search}`;
    const count = db.prepare(
      `SELECT COUNT(A.id) AS totalRecords FROM invoices A ${where}`
    ).get({ p: pattern, cid: customerId });

    const rows = db.prepare(
      `SELECT A.id AS orderId, A.invoiceGuid, A.invoiceNumber, ${numItemsSub},
              A.grandTotal, A.createdAt AS orderDate, A.remarks,
              A.cancelledAt, A.cancelReason, A.isPaymentDone AS paymentStatus
         FROM invoices A ${where}
        ORDER BY A.createdAt DESC LIMIT @limit OFFSET @offset`
    ).all({ p: pattern, cid: customerId, limit, offset });

    return [[count], hydrateRows(rows)];
  }

  const where = `WHERE A.soldToCustomer = @cid AND A.cancelledAt IS NULL AND ${search}`;
  const count = db.prepare(
    `SELECT COUNT(A.id) AS totalRecords FROM invoices A ${where}`
  ).get({ p: pattern, cid: customerId });

  const rows = db.prepare(
    `SELECT A.id AS orderId, A.invoiceGuid, A.invoiceNumber, ${numItemsSub},
            A.grandTotal, A.createdAt AS orderDate, A.remarks,
            A.cancelledAt, A.isPaymentDone AS paymentStatus
       FROM invoices A ${where}
      ORDER BY A.createdAt DESC LIMIT @limit OFFSET @offset`
  ).all({ p: pattern, cid: customerId, limit, offset });

  return [[count], hydrateRows(rows)];
}

/**
 * get_total_amount_of_products_bought_for_customer(p_customerGuid)
 * SUM(grandTotal) of the customer's non-cancelled invoices.
 * `totalAmount` is not a recognised money column name, so it is converted
 * from paise to a rupee string manually with fromPaise() (money.js is not
 * edited per the task rules).
 */
function get_total_amount_of_products_bought_for_customer(db, params) {
  const [customerGuid] = params;
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(customerGuid));
  const row = db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS totalAmount
       FROM invoices
      WHERE soldToCustomer = ? AND cancelledAt IS NULL`
  ).get(customerId);
  return [[{ totalAmount: fromPaise(row.totalAmount) }]];
}

/**
 * get_total_customers()
 * Dashboard tile: total non-deleted customers + 6-month growth percent.
 * Replicates the SP's div-by-zero branch exactly (previous_count = 0 -> 100,
 * even when current is 0), so computeGrowth() is deliberately NOT used.
 */
function get_total_customers(db) {
  const current = db.prepare(
    `SELECT COUNT(*) AS c FROM customers
      WHERE createdAt >= datetime('now','-6 months') AND deletedAt IS NULL`
  ).get().c;
  const previous = db.prepare(
    `SELECT COUNT(*) AS c FROM customers
      WHERE createdAt < datetime('now','-6 months') AND deletedAt IS NULL`
  ).get().c;

  let percent = previous === 0 ? 100.0 : ((current - previous) / previous) * 100.0;
  if (percent == null || Number.isNaN(percent)) { percent = 0; }
  percent = Math.round(percent * 100) / 100; // DOUBLE(5,2)

  const total = db.prepare(
    'SELECT COUNT(*) AS c FROM customers WHERE deletedAt IS NULL'
  ).get().c;

  return [[{ total, percent_increase: percent }]];
}

/**
 * update_customer_details(p_customerGuid, firstName, lastName, dateOfBirth,
 *   address, city, state, stateCode, email, phoneNumber, gender, gstin, pan,
 *   remarks) — positional order matches the SP (gender after phoneNumber).
 * No money/weight fields. Returns nothing meaningful.
 */
function update_customer_details(db, params) {
  const [
    customerGuid, firstName, lastName, dateOfBirth, address, city, state,
    stateCode, email, phoneNumber, gender, gstin, pan, remarks,
  ] = params;

  db.prepare(
    `UPDATE customers
        SET firstName = ?, lastName = ?, dateOfBirth = ?, address = ?,
            city = ?, state = ?, stateCode = ?, email = ?, phoneNumber = ?,
            gender = ?, gstin = ?, pan = ?, remarks = ?
      WHERE customerGuid = ?`
  ).run(
    nz(firstName), nz(lastName), nz(dateOfBirth), nz(address), nz(city),
    nz(state), nz(stateCode), nz(email), nz(phoneNumber), nz(gender),
    nz(gstin), nz(pan), nz(remarks), nz(customerGuid),
  );
  return [[]];
}

/**
 * update_customer_image(p_customerGuid, imageFileName)
 * Sets imagePath = "<guid>-customer-<file>", returning both the new imagePath
 * and the previous filename (so the caller can delete the old file).
 * Wrapped in a transaction (read-old + update + re-select).
 */
function update_customer_image(db, params) {
  const [customerGuid, imageFileName] = params;
  const guid = nz(customerGuid);
  const newName = buildImageName(guid, 'customer', imageFileName);

  const run = db.transaction(() => {
    const prev = db.prepare(
      'SELECT imagePath FROM customers WHERE customerGuid = ?'
    ).get(guid);
    const oldFileName = prev ? prev.imagePath : null;

    db.prepare('UPDATE customers SET imagePath = ? WHERE customerGuid = ?')
      .run(newName, guid);

    const row = db.prepare(
      'SELECT imagePath FROM customers WHERE customerGuid = ?'
    ).get(guid);
    if (!row) { return [[]]; }
    return [[{ imagePath: row.imagePath, oldFileName }]];
  });
  return run();
}

/**
 * delete_customer_image(p_customerGuid)
 * Clears imagePath and returns the previous filename as `oldFileName`.
 */
function delete_customer_image(db, params) {
  const [customerGuid] = params;
  const guid = nz(customerGuid);

  const run = db.transaction(() => {
    const prev = db.prepare(
      'SELECT imagePath FROM customers WHERE customerGuid = ?'
    ).get(guid);
    const oldFileName = prev ? prev.imagePath : null;

    db.prepare('UPDATE customers SET imagePath = NULL WHERE customerGuid = ?')
      .run(guid);

    return [[{ oldFileName }]];
  });
  return run();
}

/**
 * delete_customer(p_hardDelete, p_customerGuid, p_actorUserId)
 * RBAC: an 'employee' actor is forbidden (SP SIGNALs SQLSTATE 45000). Hard
 * delete removes the row; soft delete stamps deletedAt. Writes an audit row.
 * Throws to replicate the SIGNAL; returns nothing meaningful on success.
 */
function delete_customer(db, params) {
  const [hardDelete, customerGuid, actorUserId] = params;
  const guid = nz(customerGuid);
  const actor = nz(actorUserId);
  const hard = truthy(hardDelete);

  if (actor != null) {
    const actorType = getUserType(db, actor);
    if (actorType != null && actorType === 'employee') {
      throw new Error('Forbidden: canDeleteCustomer');
    }
  }

  const run = db.transaction(() => {
    if (hard) {
      db.prepare('DELETE FROM customers WHERE customerGuid = ?').run(guid);
    } else {
      db.prepare(
        "UPDATE customers SET deletedAt = datetime('now') WHERE customerGuid = ?"
      ).run(guid);
    }
    writeAudit(db, {
      actorUserId: actor,
      action: 'delete_customer',
      entity: 'customers',
      entityId: guid,
      after: { hardDelete: hard ? 1 : 0 },
    });
  });
  run();
  return [[]];
}

module.exports = {
  add_customer,
  get_all_customers,
  get_customer_details,
  get_customer_image,
  get_customer_orders,
  get_total_amount_of_products_bought_for_customer,
  get_total_customers,
  update_customer_details,
  update_customer_image,
  delete_customer_image,
  delete_customer,
};
