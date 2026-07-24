/**
 * Stored-procedure registry: MySQL proc name -> SQLite JS implementation.
 *
 * The renderer still sends `call <proc>(?)` strings through db:execute; the
 * router (../router.js) looks the name up here. Procs absent from this map
 * fall through to the legacy mysql2 path during the incremental Phase 1
 * migration, so porting one domain at a time is safe.
 */

const purities = require('./purities');
const customers = require('./customers');

module.exports = {
  ...purities,   // get_purities
  ...customers,  // add_customer, get_all_customers
};
