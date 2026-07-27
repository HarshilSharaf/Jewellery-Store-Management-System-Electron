/**
 * Orders data-layer tests (the money path). Run:
 *   node --test src-electron/db/procedures/orders.test.js
 *
 * Proves: save_order stores EXACT integer paise/mg, totals reconcile
 * (line paise sum == invoice grandTotal paise), invoiceNumber formatting,
 * product isSold flip, hydrated DECIMAL-string return; record_payment marks
 * isPaymentDone; the save_order/record_payment error paths return an
 * {message:'Error:...'} row; and the nested read shapes come back assembled.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('../router');
const orders = require('./orders');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

/**
 * orders procs are not registered in the router registry (index.js) yet — the
 * strict scope of this task is orders.js/orders.test.js only. We call the proc
 * directly and append the router's SENTINEL so the envelope + flatten() behave
 * exactly as they would once the proc is wired into ./index.js.
 */
function callProc(db, name, params) {
  const sets = orders[name](db, Array.isArray(params) ? params : []);
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
  const p = path.join(os.tmpdir(), `jsms-orders-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
  const db = new Database(p);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  db._path = p;
  seed(db);
  return db;
}

function cleanup(db) {
  const p = db._path;
  db.close();
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} }
}

/** Seeds shopsettings singleton, a customer, category set, and one unsold product. */
function seed(db) {
  db.prepare(
    `INSERT INTO shopsettings
       (id, shopName, gstin, addressLine1, city, state, stateCode, pincode, phone,
        invoicePrefix, currentInvoiceCounter)
     VALUES (1,'Test Jewellers','27AAAAA0000A1Z5','1 MG Rd','Pune','Maharashtra','27','411001','9990001111','INV/', 1)`
  ).run();

  const cust = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, gender, city, phoneNumber)
     VALUES ('cust-guid-1','Asha','Rao','female','Pune','9998887777')`
  ).run();
  db._customerId = cust.lastInsertRowid;

  const mid = db.prepare(`INSERT INTO mastercategories (masterCategoryName) VALUES ('Gold')`).run().lastInsertRowid;
  const sid = db.prepare(`INSERT INTO subcategories (subCategoryName) VALUES ('Rings')`).run().lastInsertRowid;
  const pid = db.prepare(`INSERT INTO productcategories (productCategoryName) VALUES ('Wedding')`).run().lastInsertRowid;

  const prod = db.prepare(
    `INSERT INTO products
       (productGuid, sku, purityCode, grossWeight, netWeight, isSold, mid, sid, pid)
     VALUES ('prod-guid-1','SKU-001','916', 10000, 9500, 0, ?, ?, ?)`
  ).run(mid, sid, pid);
  db._productId = prod.lastInsertRowid;
}

// save_order positional param order (24 IN params).
function saveOrderParams(db, overrides = {}) {
  const line = {
    productId: db._productId,
    lineType: 'product',
    description: '22K Ring',
    hsnCode: '7113',
    purityCode: '916',
    grossWeight: 10,      // g
    netWeight: 9.5,       // g
    stoneWeight: 0.5,     // g
    ratePerGram: 6000,    // ₹/g
    metalValue: 57000,    // ₹
    makingCharge: 5000,
    stoneCharge: 1000,
    wastageCharge: 2000,
    discountAmount: 0,
    taxableAmount: 65000, // ₹  (57000 + 5000 + 1000 + 2000)
    cgst: 975,            // 1.5%
    sgst: 975,
    igst: 0,
    lineTotal: 66950,     // ₹  (65000 + 975 + 975)
  };
  const base = [
    db._customerId,        // p_soldToCustomer
    'Maharashtra',         // p_placeOfSupply
    '7113',                // p_hsn
    JSON.stringify({ '916': 6000 }), // p_rateSnapshot
    65000,                 // p_subTotalTaxable
    975,                   // p_totalCgst
    975,                   // p_totalSgst
    0,                     // p_totalIgst
    0,                     // p_totalDiscount
    5000,                  // p_totalMakingCharge
    1000,                  // p_totalStoneCharge
    2000,                  // p_totalWastageCharge
    0,                     // p_oldGoldCreditAmount
    0,                     // p_roundOffAmount
    66950,                 // p_grandTotal
    'first order',         // p_remarks
    overrides.amountPaid !== undefined ? overrides.amountPaid : 66950, // p_amountPaid
    'cash',                // p_paymentMethod
    null,                  // p_paymentRefNumber
    JSON.stringify(overrides.lineItems || [line]),        // p_lineItems
    JSON.stringify(overrides.oldGoldReceipts || []),      // p_oldGoldReceipts
    null,                  // p_oldGoldReceiptGuid
    null,                  // p_savingSchemeGuid
    null,                  // p_actorUserId
  ];
  return base;
}

test('save_order: paise storage, total reconciliation, invoiceNumber, isSold flip, hydrated return', () => {
  const db = freshDb();
  try {
    const raw = callProc(db, 'save_order', saveOrderParams(db));
    const out = flatten(raw);
    assert.equal(out.length, 1);
    const res = out[0];
    assert.equal(res.message, 'Success');
    assert.equal(typeof res.invoiceGuid, 'string');
    assert.equal(res.invoiceGuid.length, 36);
    assert.equal(res.invoiceNumber, 'INV/00001', 'prefix + LPAD(counter,5)');

    // Invoice stored in EXACT integer paise.
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(res.invoiceId);
    assert.equal(inv.grandTotal, 6695000, '₹66950 -> 6695000 paise');
    assert.equal(inv.subTotalTaxable, 6500000);
    assert.equal(inv.totalCgst, 97500);
    assert.equal(inv.totalSgst, 97500);
    assert.equal(inv.isPaymentDone, 1, 'full payment -> isPaymentDone=1');

    // Line item stored in EXACT integer paise / mg.
    const lines = db.prepare('SELECT * FROM invoicelineitems WHERE invoiceId = ?').all(res.invoiceId);
    assert.equal(lines.length, 1);
    const li = lines[0];
    assert.equal(li.netWeight, 9500, '9.5 g -> 9500 mg');
    assert.equal(li.grossWeight, 10000);
    assert.equal(li.stoneWeight, 500);
    assert.equal(li.ratePerGram, 600000, '₹6000 -> 600000 paise');
    assert.equal(li.lineTotal, 6695000);

    // Totals reconcile: sum of line lineTotal paise == invoice grandTotal paise.
    const lineSum = db.prepare(
      'SELECT COALESCE(SUM(lineTotal),0) AS s FROM invoicelineitems WHERE invoiceId = ?'
    ).get(res.invoiceId).s;
    assert.equal(lineSum, inv.grandTotal, 'line paise sum == invoice grandTotal paise');

    // Payment stored in exact paise.
    const pays = db.prepare('SELECT * FROM payments WHERE invoiceId = ?').all(res.invoiceId);
    assert.equal(pays.length, 1);
    assert.equal(pays[0].amount, 6695000);
    assert.equal(pays[0].paymentType, 'cash');

    // Product flipped to sold.
    const prod = db.prepare('SELECT isSold FROM products WHERE id = ?').get(db._productId);
    assert.equal(prod.isSold, 1, 'product isSold flipped to 1');

    // Counter incremented; next order numbers sequentially.
    const settings = db.prepare('SELECT currentInvoiceCounter FROM shopsettings WHERE id = 1').get();
    assert.equal(settings.currentInvoiceCounter, 2);

    // Read back through get_order_details: money hydrates to DECIMAL strings.
    const det = flatten(callProc(db, 'get_order_details', [res.invoiceGuid]))[0];
    assert.equal(det.grandTotal, '66950.00', 'hydrated to 2dp string');
    assert.equal(Array.isArray(det.lineItems), true);
    assert.equal(det.lineItems[0].netWeight, '9.500', 'weight hydrated to 3dp string');
    assert.equal(det.lineItems[0].lineTotal, '66950.00');
    assert.equal(det.customerDetails.firstName, 'Asha');
    assert.equal(det.payments[0].amount, '66950.00');
  } finally { cleanup(db); }
});

test('save_order: partial payment leaves isPaymentDone=0, second order gets INV/00002', () => {
  const db = freshDb();
  try {
    const first = flatten(callProc(db, 'save_order', saveOrderParams(db, { amountPaid: 1000 })))[0];
    assert.equal(first.invoiceNumber, 'INV/00001');
    const inv1 = db.prepare('SELECT isPaymentDone FROM invoices WHERE id = ?').get(first.invoiceId);
    assert.equal(inv1.isPaymentDone, 0, 'partial payment -> not done');

    // A fresh unsold product for the second order.
    db.prepare(
      `INSERT INTO products (productGuid, sku, purityCode, grossWeight, netWeight, isSold, mid, sid, pid)
       VALUES ('prod-guid-2','SKU-002','916', 5000, 4800, 0, 1, 1, 1)`
    ).run();
    const pid2 = db.prepare("SELECT id FROM products WHERE sku='SKU-002'").get().id;
    const line2 = { productId: pid2, lineType: 'product', purityCode: '916', netWeight: 4.8, ratePerGram: 6000, taxableAmount: 30000, lineTotal: 30900 };
    const second = flatten(callProc(db, 'save_order', saveOrderParams(db, { amountPaid: 0, lineItems: [line2] })))[0];
    assert.equal(second.invoiceNumber, 'INV/00002', 'sequential invoice numbering');
  } finally { cleanup(db); }
});

test('record_payment: additional payment marks isPaymentDone=1', () => {
  const db = freshDb();
  try {
    // pay ₹1000 of ₹66950
    const inv = flatten(callProc(db, 'save_order', saveOrderParams(db, { amountPaid: 1000 })))[0];
    let done = db.prepare('SELECT isPaymentDone FROM invoices WHERE id = ?').get(inv.invoiceId).isPaymentDone;
    assert.equal(done, 0);

    // Pay the remaining balance.
    callProc(db, 'record_payment', [inv.invoiceGuid, 'upi', 'UTR123', 'balance', 65950, null]);

    done = db.prepare('SELECT isPaymentDone FROM invoices WHERE id = ?').get(inv.invoiceId).isPaymentDone;
    assert.equal(done, 1, 'cumulative payments >= grandTotal -> isPaymentDone=1');

    const total = db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE invoiceId = ?')
      .get(inv.invoiceId).s;
    assert.equal(total, 6695000, 'payments sum to grandTotal in paise');
  } finally { cleanup(db); }
});

test('record_payment: error path returns {message:"Error:..."} row (bad paymentType)', () => {
  const db = freshDb();
  try {
    const inv = flatten(callProc(db, 'save_order', saveOrderParams(db, { amountPaid: 0 })))[0];

    const raw = callProc(db, 'record_payment', [inv.invoiceGuid, 'crypto', null, null, 100, null]); // 'crypto' violates CHECK
    const out = flatten(raw);
    assert.equal(out.length, 1);
    assert.equal(typeof out[0].message, 'string');
    assert.ok(out[0].message.startsWith('Error:'), 'error row starts with "Error:"');
  } finally { cleanup(db); }
});

test('save_order: error path (linked receipt not found) returns error row, rolls back', () => {
  const db = freshDb();
  try {
    const params = saveOrderParams(db);
    params[21] = 'no-such-receipt-guid'; // p_oldGoldReceiptGuid
    const out = flatten(callProc(db, 'save_order', params));
    assert.equal(out.length, 1);
    assert.ok(out[0].message.startsWith('Error:'));

    // Rolled back: no invoice, product still unsold, counter unchanged.
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c, 0);
    assert.equal(db.prepare('SELECT isSold FROM products WHERE id = ?').get(db._productId).isSold, 0);
    assert.equal(db.prepare('SELECT currentInvoiceCounter FROM shopsettings WHERE id = 1').get().currentInvoiceCounter, 1);
  } finally { cleanup(db); }
});

test('cancel_order: un-sells products, deletes lines, stamps cancelledAt; employee is forbidden', () => {
  const db = freshDb();
  try {
    const inv = flatten(callProc(db, 'save_order', saveOrderParams(db)))[0];
    assert.equal(db.prepare('SELECT isSold FROM products WHERE id = ?').get(db._productId).isSold, 1);

    // Employee RBAC guard -> throws.
    const emp = db.prepare(
      `INSERT INTO users (userName,email,password,type) VALUES ('emp','e@x.com','p','employee')`
    ).run().lastInsertRowid;
    assert.throws(
      () => callProc(db, 'cancel_order', [inv.invoiceGuid, 'x', emp]),
      /Forbidden/,
    );

    // Owner/admin can cancel.
    callProc(db, 'cancel_order', [inv.invoiceGuid, 'customer returned', null]);
    const after = db.prepare('SELECT cancelledAt, cancelReason FROM invoices WHERE id = ?').get(inv.invoiceId);
    assert.ok(after.cancelledAt, 'cancelledAt stamped');
    assert.equal(after.cancelReason, 'customer returned');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM invoicelineitems WHERE invoiceId = ?').get(inv.invoiceId).c, 0, 'lines deleted');
    assert.equal(db.prepare('SELECT isSold FROM products WHERE id = ?').get(db._productId).isSold, 0, 'product un-sold');
  } finally { cleanup(db); }
});

test('get_all_orders: count + page (2 sets), nested children, hydration', () => {
  const db = freshDb();
  try {
    callProc(db, 'save_order', saveOrderParams(db));

    const raw = callProc(db, 'get_all_orders', [10, 1, '']);
    assert.equal(raw.length, 3, '[count],[rows],sentinel');
    const flat = flatten(raw);
    assert.equal(flat.find(r => typeof r.totalRecords === 'number').totalRecords, 1);
    const order = flat.find(r => r.invoiceGuid);
    assert.equal(order.grandTotal, '66950.00', 'top-level money hydrated');
    assert.equal(Array.isArray(order.lineItems), true);
    assert.equal(order.lineItems[0].sku, 'SKU-001');
    assert.equal(order.lineItems[0].lineTotal, '66950.00');
    assert.equal(order.customerDetails.firstName, 'Asha');
    assert.equal(order.payments[0].amount, '66950.00');

    // Search by customer name still finds it; junk search returns none.
    assert.equal(flatten(callProc(db, 'get_all_orders', [10, 1, 'Asha'])).filter(r => r.invoiceGuid).length, 1);
    assert.equal(flatten(callProc(db, 'get_all_orders', [10, 1, 'zzz-nomatch'])).filter(r => r.invoiceGuid).length, 0);
  } finally { cleanup(db); }
});

test('get_recent_orders: excludes cancelled, nests customer + line count', () => {
  const db = freshDb();
  try {
    const inv = flatten(callProc(db, 'save_order', saveOrderParams(db)))[0];
    let rows = flatten(callProc(db, 'get_recent_orders', [5]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].totalLineItems, 1);
    assert.equal(rows[0].customerDetails.firstName, 'Asha');
    assert.equal(rows[0].grandTotal, '66950.00');

    callProc(db, 'cancel_order', [inv.invoiceGuid, 'x', null]);
    rows = flatten(callProc(db, 'get_recent_orders', [5]));
    assert.equal(rows.length, 0, 'cancelled orders excluded');
  } finally { cleanup(db); }
});

test('get_revenue_of_six_months & get_sales_labour: shapes + hydration', () => {
  const db = freshDb();
  try {
    callProc(db, 'save_order', saveOrderParams(db));

    const rev = flatten(callProc(db, 'get_revenue_of_six_months', []))[0];
    assert.equal(rev.total, '66950.00', 'revenue total hydrated to string');
    assert.equal(typeof rev.percent_increase, 'number');

    const sl = flatten(callProc(db, 'get_sales_labour', [6]))[0];
    assert.equal(Array.isArray(sl.monthlySalesAndLabour), true);
    const bucket = sl.monthlySalesAndLabour[0];
    assert.equal(bucket.sales, '66950.00');
    assert.equal(bucket.labour, '7000.00', 'making + wastage: ₹5000 + ₹2000');
  } finally { cleanup(db); }
});
