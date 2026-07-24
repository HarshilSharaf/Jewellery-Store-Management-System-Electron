/**
 * Inventory (products) proc tests. Run: node --test (via `npm run test:db`).
 * Verifies rupee/gram -> integer paise/mg on write, integer -> DECIMAL/weight
 * string on read, pagination, RBAC on delete, and the stock aggregates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const inv = require('./inventory');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function flatten(raw) {
  if (!raw) { return []; }
  if (!Array.isArray(raw)) { return raw; }
  let out = [];
  for (const s of raw.slice(0, -1)) { if (Array.isArray(s)) { out = out.concat(s); } }
  return out;
}
// The procs return result-set arrays without the router sentinel; append one
// so flatten() (which drops the last element) behaves like the live path.
function envelope(sets) { return [...sets, { __sqliteOk: true }]; }

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-inv-${process.pid}-${process.hrtime()[1]}.db`);
  const db = new Database(p);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // category fixtures for the products FK (purities '916' are seeded by schema)
  db.prepare(`INSERT INTO mastercategories (id, masterCategoryName) VALUES (1,'Gold')`).run();
  db.prepare(`INSERT INTO subcategories (id, subCategoryName) VALUES (1,'Chain')`).run();
  db.prepare(`INSERT INTO productcategories (id, productCategoryName) VALUES (1,'Necklace')`).run();
  db.prepare(`INSERT INTO users (uid, userName, email, password, type) VALUES (1,'boss','b@x','h','admin'),(2,'emp','e@x','h','employee')`).run();
  db._path = p;
  return db;
}
function cleanup(db) { const p = db._path; db.close(); for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} } }

// grossWeight, netWeight, stoneWeight, stoneCharges, makingMode, makingValue, wastagePercent, costPrice, tagPrice
function addSample(db, over = {}) {
  const p = {
    sku: 'SKU1', huid: null, purityCode: '916', desc: 'Gold chain',
    grossWeight: 10, netWeight: 9.5, stoneWeight: 0.5, stoneCharges: 1200,
    makingMode: 'perGram', makingValue: 500, wastagePercent: 8, costPrice: 40000,
    tagPrice: 50000, hsn: '7113', mid: 1, sid: 1, pid: 1, image: null, ...over,
  };
  return inv.add_product(db, [
    p.sku, p.huid, p.purityCode, p.desc, p.grossWeight, p.netWeight, p.stoneWeight,
    p.stoneCharges, p.makingMode, p.makingValue, p.wastagePercent, p.costPrice,
    p.tagPrice, p.hsn, p.mid, p.sid, p.pid, p.image,
  ]);
}

test('add_product: rupees/grams stored as integer paise/mg, returned as strings', () => {
  const db = freshDb();
  try {
    const added = flatten(envelope(addSample(db)));
    assert.equal(added.length, 1);
    assert.equal(added[0].productGuid.length, 36);
    // returned row hydrated to strings
    assert.equal(added[0].tagPrice, '50000.00');
    assert.equal(added[0].grossWeight, '10.000');
    assert.equal(added[0].netWeight, '9.500');
    // raw storage is integers
    const raw = db.prepare('SELECT tagPrice, grossWeight, stoneCharges FROM products WHERE id=?').get(added[0].id);
    assert.equal(raw.tagPrice, 5000000, 'paise');
    assert.equal(raw.grossWeight, 10000, 'mg');
    assert.equal(raw.stoneCharges, 120000, 'paise');
  } finally { cleanup(db); }
});

test('get_all_products: 2 result sets, hydration, pagination', () => {
  const db = freshDb();
  try {
    addSample(db, { sku: 'SKU1' });
    addSample(db, { sku: 'SKU2', tagPrice: 12345 });
    const raw = inv.get_all_products(db, [1, 10, 1, '']); // fetchSold=1 -> all
    assert.equal(raw.length, 2, '[count],[rows]');
    const rows = flatten(envelope(raw));
    assert.equal(rows.find(r => typeof r.totalRecords === 'number').totalRecords, 2);
    const products = rows.filter(r => r.productGuid);
    assert.equal(products.length, 2);
    assert.equal(products.find(r => r.sku === 'SKU2').tagPrice, '12345.00');
  } finally { cleanup(db); }
});

test('get_product_details: joined single row, hydrated', () => {
  const db = freshDb();
  try {
    const guid = flatten(envelope(addSample(db)))[0].productGuid;
    const row = flatten(envelope(inv.get_product_details(db, [guid])))[0];
    assert.equal(row.purityLabel, '22K Gold (916)');
    assert.equal(row.masterCategoryName, 'Gold');
    assert.equal(row.tagPrice, '50000.00');
  } finally { cleanup(db); }
});

test('delete_product: RBAC blocks employee; admin soft-deletes + audits', () => {
  const db = freshDb();
  try {
    const guid = flatten(envelope(addSample(db)))[0].productGuid;
    assert.throws(() => inv.delete_product(db, [0, guid, 2]), /Forbidden/);
    inv.delete_product(db, [0, guid, 1]); // admin soft delete
    const row = db.prepare('SELECT deletedAt FROM products WHERE productGuid=?').get(guid);
    assert.ok(row.deletedAt, 'deletedAt stamped');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM auditlog').get().c, 1);
  } finally { cleanup(db); }
});

test('get_total_stock: net weight as gram string + growth number', () => {
  const db = freshDb();
  try {
    addSample(db, { netWeight: 9.5 });
    const row = flatten(envelope(inv.get_total_stock(db)))[0];
    assert.equal(row.total, '9.500');
    assert.equal(typeof row.percent_increase, 'number');
  } finally { cleanup(db); }
});
