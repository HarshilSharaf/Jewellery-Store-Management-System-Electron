const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const og = require('./oldGold');

const DIR = path.join(__dirname, '..', 'schema');
function flatten(raw) { if (!Array.isArray(raw)) return raw; let o = []; for (const s of raw.slice(0, -1)) if (Array.isArray(s)) o = o.concat(s); return o; }
function envelope(sets) { return [...sets, { __sqliteOk: true }]; }
function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-og-${process.pid}-${process.hrtime()[1]}.db`);
  const db = new Database(p); db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(DIR, '001_baseline.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(DIR, '002_p2_tables.sql'), 'utf8'));
  db.prepare(`INSERT INTO customers (customerGuid,firstName,lastName,gender,city,phoneNumber) VALUES ('c1','Meera','Iyer','female','Pune','9990001111')`).run();
  db.prepare(`INSERT INTO invoices (invoiceGuid,invoiceNumber,grandTotal,soldToCustomer) VALUES ('inv1','INV/00001',5000000,1)`).run();
  db._path = p; return db;
}
function cleanup(db) { const p = db._path; db.close(); for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} } }

// params: customerGuid, invoiceGuid, grossWeight, testedPurityPercent, testedPurityCode, deductionPercent, ratePerGram, creditAmount, remarks, actorUserId
test('save_old_gold_receipt: stores integer paise/mg, returns guid', () => {
  const db = freshDb();
  try {
    const r = flatten(envelope(og.save_old_gold_receipt(db, ['c1', 'inv1', 12.5, 91.6, '916', 2, 6000, 67500, 'scrap', null])));
    assert.equal(r.length, 1);
    assert.equal(r[0].receiptGuid.length, 36);
    const raw = db.prepare('SELECT grossWeight, ratePerGram, creditAmount FROM oldgoldreceipts WHERE id=?').get(r[0].receiptId);
    assert.equal(raw.grossWeight, 12500, 'mg');
    assert.equal(raw.ratePerGram, 600000, 'paise');
    assert.equal(raw.creditAmount, 6750000, 'paise');
  } finally { cleanup(db); }
});

test('save_old_gold_receipt: unknown customer -> error row', () => {
  const db = freshDb();
  try {
    const r = flatten(envelope(og.save_old_gold_receipt(db, ['nope', null, 5, null, null, 0, 6000, 30000, null, null])));
    assert.ok(r[0].message && r[0].message.startsWith('Error:'));
  } finally { cleanup(db); }
});

test('get_old_gold_receipts_by_customer / by_invoice: hydrated + customerName', () => {
  const db = freshDb();
  try {
    og.save_old_gold_receipt(db, ['c1', 'inv1', 10, 91.6, '916', 2, 6000, 540, null, null]);
    const byCust = flatten(envelope(og.get_old_gold_receipts_by_customer(db, ['c1'])));
    assert.equal(byCust.length, 1);
    assert.equal(byCust[0].customerName, 'Meera Iyer');
    assert.equal(byCust[0].grossWeight, '10.000');
    assert.equal(byCust[0].creditAmount, '540.00');
    const byInv = flatten(envelope(og.get_old_gold_receipt_by_invoice(db, ['inv1'])));
    assert.equal(byInv.length, 1);
    assert.equal(byInv[0].invoiceId, 1);
  } finally { cleanup(db); }
});
