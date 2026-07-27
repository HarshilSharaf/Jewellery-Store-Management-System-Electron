/**
 * Runtime sample-data load/clear, driven from the app (onboarding wizard's
 * "Explore with sample data" and Settings "Remove sample data").
 *
 * Load is only allowed into an EMPTY shop (no customers/products/invoices) so
 * it can never interleave with a merchant's real data. Clear performs a
 * GUARDED WIPE of the business tables (seeded rows are not individually
 * tagged), preserving reference/config data: users, shopsettings,
 * onboarding_state, purities, taxslabs.
 */

const procs = require('./procedures');
const { seedDemoData } = require('./seed-demo');

/**
 * Business tables emptied by clearSampleData, children-before-parents. FK
 * enforcement is disabled for the wipe transaction, so order is not strictly
 * required, but the ordering is kept sensible for clarity.
 */
const SAMPLE_TABLES = [
  'invoicelineitems',
  'payments',
  'oldgoldreceipts',
  'whatsappsendlog',
  'savingschemeinstallments',
  'savingschemes',
  'karigarledger',
  'karigarjobcards',
  'repairtickets',
  'karigars',
  'stockmovements',
  'invoices',
  'products',
  'metalrates',
  'ibjaratesnapshots',
  'subcategories',
  'productcategories',
  'mastercategories',
  'customers',
  'auditlog',
];

/** Preserved on clear — reference and shop-config data. */
// (users, shopsettings, onboarding_state, purities, taxslabs)

function tableCount(db, t) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
}

/** True when the shop has no customer/product/invoice rows. */
function isShopEmpty(db) {
  return tableCount(db, 'customers') === 0
    && tableCount(db, 'products') === 0
    && tableCount(db, 'invoices') === 0;
}

/** Reads the current onboarding flags (0/1) so writes can preserve them. */
function currentFlags(db) {
  const row = (procs.get_onboarding_state(db)[0] || [])[0] || {};
  return {
    completed: row.completed ? 1 : 0,
    passwordChanged: row.passwordChanged ? 1 : 0,
  };
}

/**
 * Seeds sample data into an empty shop and sets the sampleDataLoaded flag.
 * Throws if the shop already has business data.
 * @returns {object} seed summary
 */
function loadSampleData(db, opts = {}) {
  if (!isShopEmpty(db)) {
    throw new Error('Sample data can only be loaded into an empty shop.');
  }
  const summary = seedDemoData(db, { size: opts.size || 'small', log: opts.log });
  const f = currentFlags(db);
  procs.set_onboarding_state(db, [f.completed, f.passwordChanged, 1]);
  return summary;
}

/**
 * Wipes all business tables and clears the sampleDataLoaded flag. Preserves
 * users, shop settings, onboarding flags (completed/passwordChanged), and
 * reference tables. Resets the invoice/repair counters so numbering restarts.
 */
function clearSampleData(db) {
  const f = currentFlags(db);
  const fkWasOn = db.pragma('foreign_keys', { simple: true });
  // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it outside.
  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      for (const t of SAMPLE_TABLES) {
        db.prepare(`DELETE FROM ${t}`).run();
      }
      // Restart invoice/repair sequences (owned by shopsettings).
      db.prepare(
        `UPDATE shopsettings
            SET currentInvoiceCounter = invoiceStartFrom,
                currentRepairCounter  = 1
          WHERE id = 1`
      ).run();
      procs.set_onboarding_state(db, [f.completed, f.passwordChanged, 0]);
    });
    tx();
  } finally {
    db.pragma(`foreign_keys = ${fkWasOn ? 'ON' : 'OFF'}`);
  }
}

module.exports = { loadSampleData, clearSampleData, isShopEmpty, SAMPLE_TABLES };
