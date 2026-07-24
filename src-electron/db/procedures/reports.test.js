/**
 * Reports data-layer tests (read-only aggregates). Run:
 *   node --test src-electron/db/procedures/reports.test.js
 *
 * Proves: each report aggregates stored integer paise/mg correctly and hydrates
 * money to 2dp DECIMAL strings / weight to 3dp gram strings; the tender-type
 * pivot (day book) and status/type classification (sales register) work; the
 * category CROSS JOIN + low-stock HAVING works; the purity roll-up works; and
 * get_gstr1_export_rows returns TWO result sets (detail + HSN summary).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('../router');
const reports = require('./reports');

const SCHEMA_1 = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');
const SCHEMA_2 = fs.readFileSync(path.join(__dirname, '..', 'schema', '002_p2_tables.sql'), 'utf8');

/**
 * reports procs are not registered in the router registry (index.js) yet — the
 * strict scope of this task is reports.js/reports.test.js only. We call the proc
 * directly and append the router's SENTINEL so the envelope + flatten() behave
 * exactly as they would once the proc is wired into ./index.js.
 */
function callProc(db, name, params) {
  const sets = reports[name](db, Array.isArray(params) ? params : []);
  return [...sets, router.SENTINEL];
}

/** Replicates the renderer's DbBridgeService.flatten() exactly. */
function flatten(raw) {
  if (!raw) { return []; }
  if (!Array.isArray(raw)) { return raw; }
  const sets = raw.slice(0, -1);
  let out = [];
  for (const s of sets) { if (Array.isArray(s)) { out = out.concat(s); } }
  return out;
}

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-reports-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
  const db = new Database(p);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_1);
  db.exec(SCHEMA_2);
  db._path = p;
  seed(db);
  return db;
}

function cleanup(db) {
  const p = db._path;
  db.close();
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} }
}

/**
 * Seeds a B2B customer, one category set, one in-stock 22K product, and one
 * non-cancelled fully-paid invoice (₹65000 taxable, ₹975 CGST + ₹975 SGST,
 * ₹5000 making + ₹1000 stone + ₹2000 wastage, ₹66950 grand total) with a
 * single line item and a cash payment. Everything stored in integer paise/mg.
 */
function seed(db) {
  const cust = db.prepare(
    `INSERT INTO customers
       (customerGuid, firstName, lastName, gender, city, state, stateCode, phoneNumber, gstin, pan)
     VALUES ('cust-guid-1','Asha','Rao','female','Pune','Maharashtra','27','9998887777',
             '27AAAAA0000A1Z5','ABCDE1234F')`
  ).run();
  db._customerId = cust.lastInsertRowid;

  const mid = db.prepare(`INSERT INTO mastercategories (masterCategoryName) VALUES ('Gold')`).run().lastInsertRowid;
  const sid = db.prepare(`INSERT INTO subcategories (subCategoryName) VALUES ('Rings')`).run().lastInsertRowid;
  const pid = db.prepare(`INSERT INTO productcategories (productCategoryName) VALUES ('Wedding')`).run().lastInsertRowid;
  db._mid = mid; db._sid = sid; db._pid = pid;

  // In-stock 22K (916) product: 10.000 g gross / 9.500 g net; tag ₹70000, cost ₹60000.
  const prod = db.prepare(
    `INSERT INTO products
       (productGuid, sku, purityCode, grossWeight, netWeight, tagPrice, costPrice, isSold, mid, sid, pid)
     VALUES ('prod-guid-1','SKU-001','916', 10000, 9500, 7000000, 6000000, 0, ?, ?, ?)`
  ).run(mid, sid, pid);
  db._productId = prod.lastInsertRowid;

  const inv = db.prepare(
    `INSERT INTO invoices
       (invoiceGuid, invoiceNumber, hsn, placeOfSupply, soldToCustomer,
        subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
        totalMakingCharge, totalStoneCharge, totalWastageCharge,
        oldGoldCreditAmount, roundOffAmount, grandTotal, isPaymentDone)
     VALUES ('inv-guid-1','INV/00001','7113','Maharashtra', ?,
             6500000, 97500, 97500, 0, 0,
             500000, 100000, 200000,
             0, 0, 6695000, 1)`
  ).run(db._customerId);
  db._invoiceId = inv.lastInsertRowid;

  db.prepare(
    `INSERT INTO invoicelineitems
       (invoiceId, productId, lineType, description, hsnCode, purityCode,
        grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
        makingCharge, stoneCharge, wastageCharge, discountAmount,
        taxableAmount, cgst, sgst, igst, lineTotal)
     VALUES (?, ?, 'product','22K Ring','7113','916',
             10000, 9500, 500, 600000, 5700000,
             500000, 100000, 200000, 0,
             6500000, 97500, 97500, 0, 6695000)`
  ).run(db._invoiceId, db._productId);

  db.prepare(
    `INSERT INTO payments (paymentGuid, amount, paymentType, invoiceId)
     VALUES ('pay-guid-1', 6695000, 'cash', ?)`
  ).run(db._invoiceId);
}

test('get_day_book: tender pivot + taxable value, money hydrated to DECIMAL strings', () => {
  const db = freshDb();
  try {
    const rows = flatten(callProc(db, 'get_day_book', [null, null]));
    assert.equal(rows.length, 1, 'one payment day');
    const r = rows[0];
    assert.equal(r.cash, '66950.00', 'cash tender hydrated');
    assert.equal(r.cheque, '0.00');
    assert.equal(r.upi, '0.00');
    assert.equal(r.card, '0.00');
    assert.equal(r.online, '0.00');
    assert.equal(r.total, '66950.00', 'total = sum of tenders');
    assert.equal(r.invoiceCount, 1, 'distinct invoice count is a plain number');
    assert.equal(r.totalTaxableValue, '65000.00', 'day taxable value from invoices');
  } finally { cleanup(db); }
});

test('get_sales_register: status/type classification, mixed schema + alias money hydration', () => {
  const db = freshDb();
  try {
    const rows = flatten(callProc(db, 'get_sales_register', [null, null, null, null]));
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.customerName, 'Asha Rao', 'CONCAT firstName + lastName');
    assert.equal(r.status, 'paid', 'isPaymentDone=1 & not cancelled');
    assert.equal(r.invoiceType, 'B2B', 'customer has gstin');
    // schema-named money columns hydrate automatically.
    assert.equal(r.subTotalTaxable, '65000.00');
    assert.equal(r.grandTotal, '66950.00');
    assert.equal(r.totalMakingCharge, '5000.00');
    assert.equal(r.totalStoneCharge, '1000.00');
    assert.equal(r.totalWastageCharge, '2000.00');
    assert.equal(r.roundOffAmount, '0.00');
    // aliases hydrated explicitly.
    assert.equal(r.cgstAmount, '975.00');
    assert.equal(r.sgstAmount, '975.00');
    assert.equal(r.igstAmount, '0.00');
    assert.equal(r.oldGoldCredit, '0.00');

    // customer filter (matching guid) still returns the row.
    assert.equal(flatten(callProc(db, 'get_sales_register', [null, null, 'cust-guid-1', null])).length, 1);
    // Faithful to the SP's SELECT..INTO: an unknown guid leaves l_customerId NULL,
    // so the customer filter is skipped and all rows return (NOT an empty set).
    assert.equal(flatten(callProc(db, 'get_sales_register', [null, null, 'no-such-guid', null])).length, 1,
      'unknown guid -> l_customerId stays NULL -> filter skipped (SP behavior)');

    // status filter.
    assert.equal(flatten(callProc(db, 'get_sales_register', [null, null, null, 'paid'])).length, 1);
    assert.equal(flatten(callProc(db, 'get_sales_register', [null, null, null, 'pending'])).length, 0);
    assert.equal(flatten(callProc(db, 'get_sales_register', [null, null, null, 'cancelled'])).length, 0);
  } finally { cleanup(db); }
});

test('get_stock_summary_by_purity: in-stock roll-up per active purity, weight + money hydrated', () => {
  const db = freshDb();
  try {
    const rows = flatten(callProc(db, 'get_stock_summary_by_purity', [null]));
    // Every active purity appears (LEFT JOIN); find the seeded 22K row.
    const row916 = rows.find((r) => r.purityCode === '916');
    assert.ok(row916, '916 purity present');
    assert.equal(row916.metalType, 'gold');
    assert.equal(row916.unitCount, 1, 'one in-stock 22K product');
    assert.equal(row916.netWeightGrams, '9.500', 'SUM(mg) alias -> 3dp grams');
    assert.equal(row916.grossWeightGrams, '10.000');
    assert.equal(row916.totalTagPrice, '70000.00', 'SUM(paise) alias -> 2dp rupees');
    assert.equal(row916.totalCostPrice, '60000.00');

    // A purity with no stock rolls up to zeros (hydrated), not nulls.
    const empty = rows.find((r) => r.unitCount === 0);
    assert.ok(empty, 'a purity with no stock is present');
    assert.equal(empty.netWeightGrams, '0.000');
    assert.equal(empty.totalTagPrice, '0.00');

    // asOfDate in the past (before seeding) excludes the product created "now".
    const past = flatten(callProc(db, 'get_stock_summary_by_purity', ['2000-01-01']));
    assert.equal(past.find((r) => r.purityCode === '916').unitCount, 0, 'created after as-of date -> excluded');
  } finally { cleanup(db); }
});

test('get_low_stock_by_category: CROSS JOIN combos below threshold, netWeight hydrated', () => {
  const db = freshDb();
  try {
    const rows = flatten(callProc(db, 'get_low_stock_by_category', [3]));
    assert.equal(rows.length, 1, 'one category combination, count(1) < 3');
    const r = rows[0];
    assert.equal(r.masterCategoryName, 'Gold');
    assert.equal(r.subCategoryName, 'Rings');
    assert.equal(r.productCategoryName, 'Wedding');
    assert.equal(r.inStockCount, 1);
    assert.equal(r.totalNetWeight, '9.500', 'SUM(mg) alias -> 3dp grams');

    // Threshold 1 -> count(1) is NOT < 1, so nothing is low.
    assert.equal(flatten(callProc(db, 'get_low_stock_by_category', [1])).length, 0);

    // Default threshold (null -> 3) behaves like 3.
    assert.equal(flatten(callProc(db, 'get_low_stock_by_category', [null])).length, 1);
  } finally { cleanup(db); }
});

test('get_gstr1_export_rows: TWO result sets (detail + HSN summary), rates + money hydrated', () => {
  const db = freshDb();
  try {
    const raw = callProc(db, 'get_gstr1_export_rows', [null]); // default = current month
    assert.equal(raw.length, 3, '[detail],[summary],sentinel');
    const detail = raw[0];
    const summary = raw[1];

    assert.equal(detail.length, 1, 'one invoice this month');
    const d = detail[0];
    assert.equal(d.invoiceNumber, 'INV/00001');
    assert.equal(d.invoiceType, 'B2B');
    assert.equal(d.placeOfSupply, '27-Maharashtra', 'stateCode-state');
    assert.equal(d.hsnCode, '7113');
    assert.equal(d.taxableValue, '65000.00', 'alias money hydrated');
    assert.equal(d.cgstAmount, '975.00');
    assert.equal(d.sgstAmount, '975.00');
    assert.equal(d.igstAmount, '0.00');
    assert.equal(d.invoiceValue, '66950.00');
    // Tax RATE = paise/paise ratio forced to float in SQL (1.5%), stays a number.
    assert.equal(d.cgstRate, 1.5, '97500/6500000*100 = 1.5 (float division)');
    assert.equal(d.sgstRate, 1.5);
    assert.equal(d.igstRate, 0);

    assert.equal(summary.length, 1, 'one HSN bucket');
    const s = summary[0];
    assert.equal(s.hsnCode, '7113');
    assert.equal(s.invoiceCount, 1);
    assert.equal(s.taxableValue, '65000.00');
    assert.equal(s.cgstAmount, '975.00');
    assert.equal(s.invoiceValue, '66950.00');

    // Explicit YYYY-MM param for a month with no invoices -> both sets empty.
    const empty = callProc(db, 'get_gstr1_export_rows', ['2000-01']);
    assert.equal(empty[0].length, 0, 'detail empty');
    assert.equal(empty[1].length, 0, 'summary empty');
  } finally { cleanup(db); }
});
