/**
 * Purities procedures (SQLite reimplementation of Scripts/Stored-Procedures/Purities).
 * Each function returns an array of result sets (array-of-arrays of row objects);
 * the router wraps it in the mysql2-compatible envelope.
 */

const { hydrateRows } = require('../money');

/** get_purities() — active purities ordered for the rate/cart UIs. */
function get_purities(db) {
  const rows = db.prepare(
    `SELECT code, label, metalType, fineness, sortOrder, active
       FROM purities
      WHERE active = 1
      ORDER BY metalType, sortOrder`
  ).all();
  return [hydrateRows(rows)];
}

module.exports = { get_purities };
