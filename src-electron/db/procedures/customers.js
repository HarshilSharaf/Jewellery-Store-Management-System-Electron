/**
 * Customers procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Customers). Returns arrays of result sets.
 */

const { hydrateRow, hydrateRows } = require('../money');
const { newGuid, buildImageName, likePattern, pageBounds, truthy } = require('../helpers');

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
  const pattern = likePattern(searchQuery);
  const withImage = truthy(fetchImage);

  const where =
    `WHERE A.deletedAt IS NULL
       AND (A.firstName LIKE @p OR A.lastName LIKE @p OR A.phoneNumber LIKE @p
            OR A.email LIKE @p OR A.gstin LIKE @p)`;

  const selectCols =
    `A.id, A.customerGuid, A.firstName, A.lastName, A.email, A.gender,
     A.city, A.state, A.stateCode, A.phoneNumber, A.gstin, A.pan, A.creditBalance,
     ${withImage ? 'A.imagePath' : 'NULL'} AS imagePath`;

  if (!truthy(fetchAll)) {
    const { limit, offset } = pageBounds(itemsPerPage, pageNumber);
    const count = db.prepare(
      `SELECT COUNT(A.id) AS totalRecords FROM customers A ${where}`
    ).get({ p: pattern });

    const rows = db.prepare(
      `SELECT ${selectCols} FROM customers A ${where}
        ORDER BY A.createdAt DESC LIMIT @limit OFFSET @offset`
    ).all({ p: pattern, limit, offset });

    return [[count], hydrateRows(rows)];
  }

  const rows = db.prepare(
    `SELECT ${selectCols} FROM customers A ${where} ORDER BY A.createdAt DESC`
  ).all({ p: pattern });
  return [hydrateRows(rows)];
}

module.exports = { add_customer, get_all_customers };
