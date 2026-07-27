/**
 * TaxSlabs procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/TaxSlabs). Returns arrays of result sets.
 */

const { hydrateRows } = require('../money');

/**
 * get_tax_slabs() — active GST slabs for the tax lookup.
 * cgstRate/sgstRate/igstRate are REAL rates (not MONEY_COLUMNS), so they pass
 * through hydrateRows unchanged.
 */
function get_tax_slabs(db) {
  const rows = db.prepare(
    `SELECT id, hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom
       FROM taxslabs
      WHERE active = 1
      ORDER BY hsnCode, effectiveFrom DESC`
  ).all();
  return [hydrateRows(rows)];
}

module.exports = { get_tax_slabs };
