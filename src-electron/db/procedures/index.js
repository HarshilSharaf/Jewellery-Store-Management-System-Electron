/**
 * Stored-procedure registry: MySQL proc name -> SQLite JS implementation.
 *
 * The renderer still sends `call <proc>(?)` strings through db:execute; the
 * router (../router.js) looks the name up here. Named IPC channels
 * (metalRates:*, shopSettings:*, auth:getUserPermissions) resolve their procs
 * via router.runProc(name, ...). Procs absent from this map fall through to
 * the legacy mysql2 path, so porting one domain at a time stays safe.
 */

const purities = require('./purities');
const customers = require('./customers');
const inventory = require('./inventory');
const categories = require('./categories');
const users = require('./users');
const auth = require('./auth');
const taxslabs = require('./taxslabs');
const metalRates = require('./metalRates');
const shopSettings = require('./shopSettings');
const orders = require('./orders');
// P2 domains
const oldGold = require('./oldGold');
const whatsapp = require('./whatsapp');
const ibja = require('./ibja');
const repair = require('./repair');
const reports = require('./reports');
const savingSchemes = require('./savingSchemes');
const karigar = require('./karigar');
const onboarding = require('./onboarding');

module.exports = {
  ...purities,
  ...customers,
  ...inventory,
  ...categories,
  ...users,
  ...auth,
  ...taxslabs,
  ...metalRates,
  ...shopSettings,
  ...orders,
  ...oldGold,
  ...whatsapp,
  ...ibja,
  ...repair,
  ...reports,
  ...savingSchemes,
  ...karigar,
  ...onboarding,
};
