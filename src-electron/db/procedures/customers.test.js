/**
 * Direct unit tests for the ported Customers procedures (no router / Electron).
 * Run: `node --test src-electron/db/procedures/customers.test.js`
 *
 * Builds a temp DB from schema/001_baseline.sql, seeds minimal fixtures, calls
 * the proc functions directly, and asserts result-set shapes, money hydration,
 * pagination, RBAC, and audit side-effects.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const c = require('./customers');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-cust-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Current SQLite timestamp, matching CURRENT_TIMESTAMP / datetime('now'). */
function nowTs(db) {
  return db.prepare("SELECT datetime('now') AS t").get().t;
}

/** Seed one customer and return its guid + id. */
function seedCustomer(db, over = {}) {
  const guid = over.customerGuid || `guid-${Math.random().toString(36).slice(2)}`;
  const info = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, gender, city, phoneNumber,
                            email, gstin, creditBalance, imagePath, deletedAt, createdAt)
     VALUES (@customerGuid,@firstName,@lastName,@gender,@city,@phoneNumber,
             @email,@gstin,@creditBalance,@imagePath,@deletedAt,@createdAt)`
  ).run({
    customerGuid: guid,
    firstName: over.firstName || 'Asha',
    lastName: over.lastName || 'Rao',
    gender: over.gender || 'female',
    city: over.city || 'Pune',
    phoneNumber: over.phoneNumber || '9990001111',
    email: over.email == null ? null : over.email,
    gstin: over.gstin == null ? null : over.gstin,
    creditBalance: over.creditBalance || 0,
    imagePath: over.imagePath == null ? null : over.imagePath,
    deletedAt: over.deletedAt == null ? null : over.deletedAt,
    createdAt: over.createdAt || nowTs(db),
  });
  return { guid, id: info.lastInsertRowid };
}

function seedInvoice(db, over) {
  const guid = `inv-${Math.random().toString(36).slice(2)}`;
  const info = db.prepare(
    `INSERT INTO invoices (invoiceGuid, invoiceNumber, grandTotal, soldToCustomer,
                           cancelledAt, cancelReason, remarks, isPaymentDone, createdAt)
     VALUES (@invoiceGuid,@invoiceNumber,@grandTotal,@soldToCustomer,
             @cancelledAt,@cancelReason,@remarks,@isPaymentDone,@createdAt)`
  ).run({
    invoiceGuid: guid,
    invoiceNumber: over.invoiceNumber,
    grandTotal: over.grandTotal,
    soldToCustomer: over.soldToCustomer,
    cancelledAt: over.cancelledAt == null ? null : over.cancelledAt,
    cancelReason: over.cancelReason == null ? null : over.cancelReason,
    remarks: over.remarks == null ? null : over.remarks,
    isPaymentDone: over.isPaymentDone == null ? 0 : over.isPaymentDone,
    createdAt: over.createdAt || nowTs(db),
  });
  return { guid, id: info.lastInsertRowid };
}

test('get_customer_details: single set, money hydrated, respects deletedAt', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db, { creditBalance: 12345 });
    const sets = c.get_customer_details(db, [guid]);
    assert.equal(sets.length, 1);
    assert.equal(sets[0].length, 1);
    assert.equal(sets[0][0].customerGuid, guid);
    assert.equal(sets[0][0].creditBalance, '123.45', '12345 paise -> "123.45"');

    seedCustomer(db, { customerGuid: 'del-1', deletedAt: '2020-01-01 00:00:00' });
    assert.equal(c.get_customer_details(db, ['del-1'])[0].length, 0, 'deleted excluded');
  } finally { cleanup(db); }
});

test('get_customer_image: returns imagePath row', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db, { imagePath: 'pic.jpg' });
    const sets = c.get_customer_image(db, [guid]);
    assert.equal(sets.length, 1);
    assert.equal(sets[0][0].imagePath, 'pic.jpg');
  } finally { cleanup(db); }
});

test('get_customer_orders: count+page, grandTotal hydration, cancelled branch', () => {
  const db = freshDb();
  try {
    const { guid, id } = seedCustomer(db);
    seedInvoice(db, { invoiceNumber: 'INV/1', grandTotal: 100000, soldToCustomer: id });
    seedInvoice(db, { invoiceNumber: 'INV/2', grandTotal: 250000, soldToCustomer: id });
    seedInvoice(db, { invoiceNumber: 'INV/3', grandTotal: 5000, soldToCustomer: id,
      cancelledAt: '2024-01-01 00:00:00', cancelReason: 'oops' });

    // active only (getCancelledOrders = 0)
    const active = c.get_customer_orders(db, [0, guid, 10, 1, '']);
    assert.equal(active.length, 2, '[count],[rows]');
    assert.equal(active[0][0].totalRecords, 2, 'excludes cancelled');
    assert.equal(active[1].length, 2);
    const hydrated = active[1].map(r => r.grandTotal).sort();
    assert.deepEqual(hydrated, ['1000.00', '2500.00'], 'paise -> rupee strings');
    assert.ok('numberOfLineItems' in active[1][0]);
    assert.ok(!('cancelReason' in active[1][0]), 'active branch omits cancelReason');

    // with cancelled (getCancelledOrders = 1)
    const withC = c.get_customer_orders(db, [1, guid, 10, 1, '']);
    assert.equal(withC[0][0].totalRecords, 3, 'includes cancelled');
    assert.ok(withC[1].some(r => 'cancelReason' in r), 'cancelled branch has cancelReason');
  } finally { cleanup(db); }
});

test('get_customer_orders: pagination limit/offset', () => {
  const db = freshDb();
  try {
    const { guid, id } = seedCustomer(db);
    for (let i = 0; i < 5; i++) {
      seedInvoice(db, { invoiceNumber: `INV/${i}`, grandTotal: 1000 * (i + 1), soldToCustomer: id });
    }
    const p1 = c.get_customer_orders(db, [0, guid, 2, 1, '']);
    assert.equal(p1[0][0].totalRecords, 5);
    assert.equal(p1[1].length, 2, 'page 1 has 2');
    const p3 = c.get_customer_orders(db, [0, guid, 2, 3, '']);
    assert.equal(p3[1].length, 1, 'page 3 has remainder');
  } finally { cleanup(db); }
});

test('get_total_amount_of_products_bought_for_customer: summed & hydrated, cancelled excluded', () => {
  const db = freshDb();
  try {
    const { guid, id } = seedCustomer(db);
    seedInvoice(db, { invoiceNumber: 'A', grandTotal: 100000, soldToCustomer: id });
    seedInvoice(db, { invoiceNumber: 'B', grandTotal: 250000, soldToCustomer: id });
    seedInvoice(db, { invoiceNumber: 'C', grandTotal: 999900, soldToCustomer: id,
      cancelledAt: '2024-01-01 00:00:00' });

    const sets = c.get_total_amount_of_products_bought_for_customer(db, [guid]);
    assert.equal(sets.length, 1);
    assert.equal(sets[0][0].totalAmount, '3500.00', '(100000+250000) paise -> "3500.00"');

    // no invoices -> COALESCE 0 -> "0.00"
    const empty = seedCustomer(db, { customerGuid: 'nobuy' });
    const z = c.get_total_amount_of_products_bought_for_customer(db, [empty.guid]);
    assert.equal(z[0][0].totalAmount, '0.00');
  } finally { cleanup(db); }
});

test('get_total_customers: total + percent, empty DB yields 100', () => {
  const db = freshDb();
  try {
    const empty = c.get_total_customers(db);
    assert.equal(empty[0][0].total, 0);
    assert.equal(empty[0][0].percent_increase, 100, 'previous_count=0 -> 100 (matches SP)');

    seedCustomer(db, { customerGuid: 'r1', email: 'a@b.com' });
    seedCustomer(db, { customerGuid: 'r2', email: 'c@d.com' });
    seedCustomer(db, { customerGuid: 'gone', email: 'e@f.com', deletedAt: '2020-01-01 00:00:00' });
    const res = c.get_total_customers(db);
    assert.equal(res[0][0].total, 2, 'excludes soft-deleted');
    assert.equal(typeof res[0][0].percent_increase, 'number');
  } finally { cleanup(db); }
});

test('update_customer_details: fields updated, gender-after-phone order', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db);
    const sets = c.update_customer_details(db, [
      guid, 'Neha', 'Shah', '1990-05-05', 'MG Road', 'Delhi', 'Delhi', '07',
      'neha@x.com', '8887776665', 'male', '07ABCDE1234F1Z5', 'ABCDE1234F', 'vip',
    ]);
    assert.deepEqual(sets, [[]], 'nothing meaningful returned');
    const row = db.prepare('SELECT * FROM customers WHERE customerGuid = ?').get(guid);
    assert.equal(row.firstName, 'Neha');
    assert.equal(row.gender, 'male', 'gender bound correctly despite position');
    assert.equal(row.phoneNumber, '8887776665');
    assert.equal(row.city, 'Delhi');
  } finally { cleanup(db); }
});

test('update_customer_image: sets built name, returns new + old', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db, { imagePath: 'old.jpg' });
    const sets = c.update_customer_image(db, [guid, 'new.png']);
    assert.equal(sets.length, 1);
    assert.equal(sets[0][0].imagePath, `${guid}-customer-new.png`);
    assert.equal(sets[0][0].oldFileName, 'old.jpg');
    const row = db.prepare('SELECT imagePath FROM customers WHERE customerGuid = ?').get(guid);
    assert.equal(row.imagePath, `${guid}-customer-new.png`);
  } finally { cleanup(db); }
});

test('delete_customer_image: clears path, returns old', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db, { imagePath: 'photo.jpg' });
    const sets = c.delete_customer_image(db, [guid]);
    assert.equal(sets[0][0].oldFileName, 'photo.jpg');
    const row = db.prepare('SELECT imagePath FROM customers WHERE customerGuid = ?').get(guid);
    assert.equal(row.imagePath, null);
  } finally { cleanup(db); }
});

test('delete_customer: soft delete stamps deletedAt + audit row', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db);
    const sets = c.delete_customer(db, [0, guid, null]);
    assert.deepEqual(sets, [[]]);
    const row = db.prepare('SELECT deletedAt FROM customers WHERE customerGuid = ?').get(guid);
    assert.ok(row.deletedAt, 'deletedAt stamped');
    const audit = db.prepare("SELECT * FROM auditlog WHERE action='delete_customer'").get();
    assert.equal(audit.entityId, guid);
    assert.equal(JSON.parse(audit.after).hardDelete, 0);
  } finally { cleanup(db); }
});

test('delete_customer: hard delete removes row', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db);
    c.delete_customer(db, [1, guid, null]);
    const row = db.prepare('SELECT * FROM customers WHERE customerGuid = ?').get(guid);
    assert.equal(row, undefined, 'row removed');
    const audit = db.prepare("SELECT * FROM auditlog WHERE action='delete_customer'").get();
    assert.equal(JSON.parse(audit.after).hardDelete, 1);
  } finally { cleanup(db); }
});

test('delete_customer: employee actor is forbidden (throws), no delete', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db);
    const emp = db.prepare(
      "INSERT INTO users (userName,email,password,type) VALUES ('e','e@x.com','p','employee')"
    ).run();
    assert.throws(
      () => c.delete_customer(db, [1, guid, emp.lastInsertRowid]),
      /Forbidden: canDeleteCustomer/,
    );
    const row = db.prepare('SELECT * FROM customers WHERE customerGuid = ?').get(guid);
    assert.ok(row, 'customer NOT deleted');
  } finally { cleanup(db); }
});

test('delete_customer: admin actor allowed + audit records actor', () => {
  const db = freshDb();
  try {
    const { guid } = seedCustomer(db);
    const admin = db.prepare(
      "INSERT INTO users (userName,email,password,type) VALUES ('a','a@x.com','p','admin')"
    ).run();
    c.delete_customer(db, [0, guid, admin.lastInsertRowid]);
    const audit = db.prepare("SELECT * FROM auditlog WHERE action='delete_customer'").get();
    assert.equal(audit.actorUserId, admin.lastInsertRowid);
  } finally { cleanup(db); }
});
