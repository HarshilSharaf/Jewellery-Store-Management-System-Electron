/**
 * Categories proc tests. Run with:
 *   node --test src-electron/db/procedures/categories.test.js
 *
 * Uses a temp SQLite DB built from the baseline schema, inserts fixtures,
 * and calls the ported proc functions directly (not via the router, though
 * the flatten() concat behaviour that the router+renderer rely on is also
 * asserted for the 3-result-set get_all_categories).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const cats = require('./categories');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

/** Replicates the renderer's DbBridgeService.flatten() over a full envelope. */
function flatten(raw) {
  if (!raw) { return []; }
  if (!Array.isArray(raw)) { return raw; }
  const sets = raw.slice(0, -1);
  let out = [];
  for (const s of sets) { if (Array.isArray(s)) { out = out.concat(s); } }
  return out;
}

const SENTINEL = Object.freeze({ __sqliteOk: true });

/** Wrap proc result sets in the router's mysql2-style envelope. */
function envelope(sets) { return [...sets, SENTINEL]; }

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-cats-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
  const db = new Database(p);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  db._path = p;
  return db;
}

function cleanup(db) {
  const p = db._path;
  db.close();
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} }
}

/** Seeds a master (id 1) + sub (id 1) so products' FK constraints are satisfied. */
function seedMasterAndSub(db) {
  cats.add_master_category(db, ['M', null]);
  cats.add_sub_category(db, ['S', null]);
}

/** Inserts a sold product in a given product category with a net weight (mg). */
function seedProduct(db, { pid, netWeightMg, isSold = 1, deleted = false }) {
  db.prepare(
    `INSERT INTO products
       (productGuid, sku, purityCode, grossWeight, netWeight, mid, sid, pid, isSold, deletedAt)
     VALUES (?, ?, '916', ?, ?, 1, 1, ?, ?, ?)`
  ).run(
    `pg-${Math.random().toString(36).slice(2)}`,
    `sku-${Math.random().toString(36).slice(2)}`,
    netWeightMg, netWeightMg, pid, isSold, deleted ? '2024-01-01' : null,
  );
}

test('add_master_category + get_master_categories round-trip', () => {
  const db = freshDb();
  try {
    assert.deepEqual(cats.add_master_category(db, ['Gold', 'Yellow gold items']), []);
    cats.add_master_category(db, ['Silver', undefined]); // undefined -> null

    const sets = cats.get_master_categories(db);
    assert.equal(sets.length, 1, 'single result set');
    const rows = sets[0];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].masterCategoryName, 'Gold');
    assert.equal(rows[0].masterCategoryDescription, 'Yellow gold items');
    assert.equal(rows[1].masterCategoryDescription, null, 'undefined bound as null');
  } finally { cleanup(db); }
});

test('add_sub_category + get_sub_categories round-trip', () => {
  const db = freshDb();
  try {
    cats.add_sub_category(db, ['Rings', 'Finger rings']);
    const rows = cats.get_sub_categories(db)[0];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subCategoryName, 'Rings');
  } finally { cleanup(db); }
});

test('add_product_category + get_product_categories round-trip', () => {
  const db = freshDb();
  try {
    cats.add_product_category(db, ['Necklace', null]);
    const rows = cats.get_product_categories(db)[0];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].productCategoryName, 'Necklace');
  } finally { cleanup(db); }
});

test('get_all_categories returns THREE result sets in order (master, sub, product)', () => {
  const db = freshDb();
  try {
    cats.add_master_category(db, ['MasterA', null]);
    cats.add_sub_category(db, ['SubA', null]);
    cats.add_sub_category(db, ['SubB', null]);
    cats.add_product_category(db, ['ProdA', null]);

    const sets = cats.get_all_categories(db);
    assert.equal(sets.length, 3, 'exactly three result sets');

    const [master, sub, product] = sets;
    assert.equal(master.length, 1);
    assert.equal(sub.length, 2);
    assert.equal(product.length, 1);

    // Column selection kept exact so the renderer can discriminate by name.
    assert.deepEqual(Object.keys(master[0]).sort(), ['id', 'masterCategoryName']);
    assert.deepEqual(Object.keys(sub[0]).sort(), ['id', 'subCategoryName']);
    assert.deepEqual(Object.keys(product[0]).sort(), ['id', 'productCategoryName']);
  } finally { cleanup(db); }
});

test('get_all_categories: flatten() concatenates the 3 sets, discriminable by columns', () => {
  const db = freshDb();
  try {
    cats.add_master_category(db, ['MasterA', null]);
    cats.add_sub_category(db, ['SubA', null]);
    cats.add_product_category(db, ['ProdA', null]);
    cats.add_product_category(db, ['ProdB', null]);

    const flat = flatten(envelope(cats.get_all_categories(db)));
    assert.equal(flat.length, 4, '1 master + 1 sub + 2 product');

    const masters = flat.filter(r => 'masterCategoryName' in r);
    const subs = flat.filter(r => 'subCategoryName' in r);
    const products = flat.filter(r => 'productCategoryName' in r);
    assert.equal(masters.length, 1);
    assert.equal(subs.length, 1);
    assert.equal(products.length, 2);
  } finally { cleanup(db); }
});

test('get_top_product_categories: weight hydrated to grams string, percentages sum to 100, ordering + limit', () => {
  const db = freshDb();
  try {
    seedMasterAndSub(db);
    // Three product categories, ids 1..3 (AUTOINCREMENT from empty table).
    cats.add_product_category(db, ['Rings', null]);   // id 1
    cats.add_product_category(db, ['Chains', null]);   // id 2
    cats.add_product_category(db, ['Bangles', null]);  // id 3

    // Net weights (mg): cat1=6000, cat2=3000, cat3=1000 -> total 10000 mg.
    seedProduct(db, { pid: 1, netWeightMg: 4000 });
    seedProduct(db, { pid: 1, netWeightMg: 2000 });
    seedProduct(db, { pid: 2, netWeightMg: 3000 });
    seedProduct(db, { pid: 3, netWeightMg: 1000 });
    // Noise that must be excluded:
    seedProduct(db, { pid: 3, netWeightMg: 9999, isSold: 0 });        // not sold
    seedProduct(db, { pid: 3, netWeightMg: 9999, deleted: true });    // soft-deleted

    const rows = cats.get_top_product_categories(db, [2])[0];
    assert.equal(rows.length, 2, 'LIMIT 2 applied');

    // Ordered by weight DESC: Rings (6000) then Chains (3000).
    assert.equal(rows[0].productCategoryName, 'Rings');
    assert.equal(rows[0].total_weight, '6.000', 'mg -> grams DECIMAL(_,3) string');
    assert.equal(rows[0].percentage, 60, '6000/10000 * 100');
    assert.equal(rows[1].productCategoryName, 'Chains');
    assert.equal(rows[1].total_weight, '3.000');
    assert.equal(rows[1].percentage, 30);
  } finally { cleanup(db); }
});

test('get_top_product_categories: no sold products -> empty set, div-by-zero guarded', () => {
  const db = freshDb();
  try {
    seedMasterAndSub(db);
    cats.add_product_category(db, ['Rings', null]);
    // Only an unsold product exists.
    seedProduct(db, { pid: 1, netWeightMg: 5000, isSold: 0 });

    const rows = cats.get_top_product_categories(db, [5])[0];
    assert.equal(rows.length, 0, 'no sold rows; total guarded to 1, no throw');
  } finally { cleanup(db); }
});

test('get_top_product_categories: percentage rounds to 2 decimals', () => {
  const db = freshDb();
  try {
    seedMasterAndSub(db);
    cats.add_product_category(db, ['A', null]); // id 1
    cats.add_product_category(db, ['B', null]); // id 2
    // total 3000mg; A=1000 -> 33.333... -> 33.33
    seedProduct(db, { pid: 1, netWeightMg: 1000 });
    seedProduct(db, { pid: 2, netWeightMg: 2000 });

    const rows = cats.get_top_product_categories(db, [5])[0];
    const a = rows.find(r => r.productCategoryName === 'A');
    assert.equal(a.percentage, 33.33);
  } finally { cleanup(db); }
});
