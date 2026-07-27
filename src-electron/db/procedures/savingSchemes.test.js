/**
 * Saving-scheme data-layer tests (money path). Run:
 *   node --test src-electron/db/procedures/savingSchemes.test.js
 *
 * Proves: enroll stores monthlyAmount in EXACT integer paise and returns
 * start/maturity dates; record_scheme_installment stores amount in paise,
 * bumps totalPaid, numbers installments via MAX+1, enforces the "already paid
 * this month" dedupe (and its bypass), and flips status to matured at tenure;
 * redeem corpus = totalPaid + monthly*bonus; forfeit RBAC + transitions;
 * money hydration to DECIMAL strings; get_all pagination (rows + count sets).
 *
 * The savingSchemes tables are P2 — the temp DB execs BOTH schema files
 * (001_baseline then 002_p2_tables), matching the required test pattern.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('../router');
const schemes = require('./savingSchemes');

const SCHEMA_1 = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');
const SCHEMA_2 = fs.readFileSync(path.join(__dirname, '..', 'schema', '002_p2_tables.sql'), 'utf8');

/**
 * savingSchemes procs are not registered in the router registry yet — the
 * strict scope of this task is savingSchemes.js/savingSchemes.test.js only. We
 * call the proc directly and append the router's SENTINEL so the envelope +
 * flatten() behave exactly as they would once wired into ./index.js.
 */
function callProc(db, name, params) {
  const sets = schemes[name](db, Array.isArray(params) ? params : []);
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
  const p = path.join(os.tmpdir(), `jsms-schemes-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Seeds a customer (and reusable guid). */
function seed(db) {
  const cust = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, gender, city, phoneNumber)
     VALUES ('cust-guid-1','Asha','Rao','female','Pune','9998887777')`
  ).run();
  db._customerId = cust.lastInsertRowid;
}

/** Enroll a scheme with a short tenure so maturity is reachable in-test. */
function enroll(db, overrides = {}) {
  const params = [
    'cust-guid-1',                                   // p_customerGuid
    overrides.planName || 'Gold-11',                 // p_planName
    overrides.monthlyAmount !== undefined ? overrides.monthlyAmount : 5000, // p_monthlyAmount (rupees)
    overrides.tenureMonths !== undefined ? overrides.tenureMonths : 11,     // p_tenureMonths
    overrides.bonusInstallments !== undefined ? overrides.bonusInstallments : 1, // p_bonusInstallments
    overrides.actorUserId !== undefined ? overrides.actorUserId : null,     // p_actorUserId
  ];
  return flatten(callProc(db, 'enroll_saving_scheme', params))[0];
}

test('enroll_saving_scheme: paise storage, dates, audit, hydrated read', () => {
  const db = freshDb();
  try {
    const res = enroll(db);
    assert.equal(typeof res.schemeGuid, 'string');
    assert.equal(res.schemeGuid.length, 36);
    assert.equal(typeof res.schemeId, 'number');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(res.startDate), 'startDate is a DATE');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(res.expectedMaturityDate), 'maturity is a DATE');

    // monthlyAmount stored in EXACT integer paise, totalPaid seeded 0.
    const row = db.prepare('SELECT * FROM savingschemes WHERE id = ?').get(res.schemeId);
    assert.equal(row.monthlyAmount, 500000, '₹5000 -> 500000 paise');
    assert.equal(row.totalPaid, 0);
    assert.equal(row.status, 'active');
    assert.equal(row.tenureMonths, 11);
    assert.equal(row.bonusInstallments, 1);

    // maturity = start + tenure months.
    const expected = db.prepare("SELECT date(?, '+11 months') AS d").get(res.startDate).d;
    assert.equal(res.expectedMaturityDate, expected);

    // audit row written.
    const audit = db.prepare("SELECT * FROM auditlog WHERE action = 'enroll_saving_scheme'").get();
    assert.ok(audit, 'audit row written');

    // read back hydrated to DECIMAL strings.
    const det = flatten(callProc(db, 'get_saving_scheme_details', [res.schemeGuid]));
    const scheme = det.find(r => r.schemeGuid);
    assert.equal(scheme.monthlyAmount, '5000.00', 'hydrated to 2dp string');
    assert.equal(scheme.totalPaid, '0.00');
    assert.equal(scheme.expectedTotalContribution, '55000.00', 'monthly*tenure hydrated');
    assert.equal(scheme.bonusAmount, '5000.00', 'monthly*bonus hydrated');
    assert.equal(scheme.projectedCorpus, '5000.00', 'totalPaid + monthly*bonus');
    assert.equal(scheme.customerName, 'Asha Rao');
    assert.equal(scheme.installmentsPaid, 0);
    assert.equal(scheme.installmentsRemaining, 11);
    assert.equal(scheme.isEligibleForRedemption, 0);
  } finally { cleanup(db); }
});

test('enroll_saving_scheme: unknown customer throws', () => {
  const db = freshDb();
  try {
    assert.throws(
      () => callProc(db, 'enroll_saving_scheme', ['nope', 'P', 100, 11, 1, null]),
      /customer not found/,
    );
  } finally { cleanup(db); }
});

test('record_scheme_installment: paise, MAX+1 numbering, totalPaid bump, monthly dedupe + bypass', () => {
  const db = freshDb();
  try {
    const s = enroll(db);

    // First installment for a given receiptDate.
    const r1 = flatten(callProc(db, 'record_scheme_installment',
      [s.schemeGuid, 5000, 'cash', null, '2026-01-05', null, 0]))[0];
    assert.equal(r1.installmentNumber, 1);
    assert.equal(r1.totalPaid, '5000.00', 'totalPaid hydrated');
    assert.equal(r1.status, 'active');

    const stored = db.prepare('SELECT * FROM savingschemeinstallments WHERE installmentGuid = ?').get(r1.installmentGuid);
    assert.equal(stored.amount, 500000, '₹5000 -> 500000 paise');
    assert.equal(stored.installmentNumber, 1);
    assert.equal(stored.paymentMode, 'cash');
    assert.equal(db.prepare('SELECT totalPaid FROM savingschemes WHERE id = ?').get(s.schemeId).totalPaid, 500000);

    // Same month again without bypass -> throws (dedupe).
    assert.throws(
      () => callProc(db, 'record_scheme_installment', [s.schemeGuid, 5000, 'cash', null, '2026-01-20', null, 0]),
      /already recorded this month/,
    );

    // Same month WITH bypass -> allowed, number bumps via MAX+1.
    const r1b = flatten(callProc(db, 'record_scheme_installment',
      [s.schemeGuid, 5000, 'upi', 'UTR9', '2026-01-20', null, 1]))[0];
    assert.equal(r1b.installmentNumber, 2, 'MAX+1 numbering');
    assert.equal(r1b.totalPaid, '10000.00');

    // A different month -> allowed without bypass.
    const r2 = flatten(callProc(db, 'record_scheme_installment',
      [s.schemeGuid, 5000, 'cash', null, '2026-02-05', null, 0]))[0];
    assert.equal(r2.installmentNumber, 3);
    assert.equal(r2.status, 'active', 'still active before tenure');
  } finally { cleanup(db); }
});

test('record_scheme_installment: flips to matured at tenure, then rejects further/inactive', () => {
  const db = freshDb();
  try {
    // tenure=2, bonus=1 so we can reach maturity quickly.
    const s = enroll(db, { tenureMonths: 2, monthlyAmount: 1000 });

    const i1 = flatten(callProc(db, 'record_scheme_installment',
      [s.schemeGuid, 1000, 'cash', null, '2026-01-05', null, 0]))[0];
    assert.equal(i1.status, 'active');

    const i2 = flatten(callProc(db, 'record_scheme_installment',
      [s.schemeGuid, 1000, 'cash', null, '2026-02-05', null, 0]))[0];
    assert.equal(i2.installmentNumber, 2);
    assert.equal(i2.status, 'matured', 'nextInstallmentNumber >= tenure -> matured');
    assert.equal(i2.totalPaid, '2000.00');

    // scheme no longer active -> recording throws "not active".
    assert.throws(
      () => callProc(db, 'record_scheme_installment', [s.schemeGuid, 1000, 'cash', null, '2026-03-05', null, 0]),
      /not active/,
    );
  } finally { cleanup(db); }
});

test('record_scheme_installment: unknown scheme throws', () => {
  const db = freshDb();
  try {
    assert.throws(
      () => callProc(db, 'record_scheme_installment', ['no-scheme', 100, 'cash', null, null, null, 0]),
      /scheme not found/,
    );
  } finally { cleanup(db); }
});

test('redeem_saving_scheme: corpus = totalPaid + monthly*bonus, hydrated, status flip', () => {
  const db = freshDb();
  try {
    const s = enroll(db, { monthlyAmount: 5000, bonusInstallments: 1 });
    flatten(callProc(db, 'record_scheme_installment', [s.schemeGuid, 5000, 'cash', null, '2026-01-05', null, 0]));
    flatten(callProc(db, 'record_scheme_installment', [s.schemeGuid, 5000, 'cash', null, '2026-02-05', null, 0]));
    // totalPaid = ₹10000; corpus = 10000 + 5000*1 = ₹15000.

    const res = flatten(callProc(db, 'redeem_saving_scheme', [s.schemeGuid, null, null]))[0];
    assert.equal(res.redeemedAmount, '15000.00', 'corpus hydrated');
    assert.equal(res.invoiceId, null);
    assert.equal(res.schemeId, s.schemeId);

    const row = db.prepare('SELECT * FROM savingschemes WHERE id = ?').get(s.schemeId);
    assert.equal(row.status, 'redeemed');
    assert.equal(row.redeemedAmount, 1500000, '₹15000 -> 1500000 paise stored');
    assert.ok(row.redeemedAt, 'redeemedAt stamped');

    // second redeem -> not redeemable.
    assert.throws(
      () => callProc(db, 'redeem_saving_scheme', [s.schemeGuid, null, null]),
      /not redeemable/,
    );
  } finally { cleanup(db); }
});

test('redeem_saving_scheme: unknown invoice throws', () => {
  const db = freshDb();
  try {
    const s = enroll(db);
    assert.throws(
      () => callProc(db, 'redeem_saving_scheme', [s.schemeGuid, 'no-invoice', null]),
      /invoice not found/,
    );
  } finally { cleanup(db); }
});

test('forfeit_saving_scheme: transitions, RBAC (non-admin forbidden), redeemed blocks', () => {
  const db = freshDb();
  try {
    const s = enroll(db);

    // employee actor -> forbidden (must be admin).
    const emp = db.prepare(
      `INSERT INTO users (userName,email,password,type) VALUES ('emp','e@x.com','p','employee')`
    ).run().lastInsertRowid;
    assert.throws(
      () => callProc(db, 'forfeit_saving_scheme', [s.schemeGuid, 'quit', emp]),
      /Forbidden: canForfeitSavingScheme/,
    );

    // admin actor -> allowed.
    const admin = db.prepare(
      `INSERT INTO users (userName,email,password,type) VALUES ('adm','a@x.com','p','admin')`
    ).run().lastInsertRowid;
    const res = flatten(callProc(db, 'forfeit_saving_scheme', [s.schemeGuid, 'customer quit', admin]))[0];
    assert.equal(res.status, 'forfeited');
    const row = db.prepare('SELECT * FROM savingschemes WHERE id = ?').get(s.schemeId);
    assert.equal(row.status, 'forfeited');
    assert.equal(row.forfeitReason, 'customer quit');
    assert.ok(row.forfeitedAt);

    // redeemed scheme cannot be forfeited.
    const s2 = enroll(db, { planName: 'Gold-2' });
    flatten(callProc(db, 'redeem_saving_scheme', [s2.schemeGuid, null, null]));
    assert.throws(
      () => callProc(db, 'forfeit_saving_scheme', [s2.schemeGuid, 'x', null]),
      /already redeemed/,
    );
  } finally { cleanup(db); }
});

test('get_all_saving_schemes: rows + count sets, pagination, status/search filters', () => {
  const db = freshDb();
  try {
    const a = enroll(db, { planName: 'Alpha' });
    enroll(db, { planName: 'Beta' });
    enroll(db, { planName: 'Gamma' });
    // forfeit one so status filter is exercised.
    flatten(callProc(db, 'forfeit_saving_scheme', [a.schemeGuid, 'x', null]));

    // page 1, size 2 -> 2 rows, totalRecords 3.
    const raw = callProc(db, 'get_all_saving_schemes', [2, 1, null, '']);
    assert.equal(raw.length, 3, '[rows],[count],sentinel');
    const flat = flatten(raw);
    const rows = flat.filter(r => r.schemeGuid);
    assert.equal(rows.length, 2, 'page size honoured');
    const countRow = flat.find(r => typeof r.totalRecords === 'number');
    assert.equal(countRow.totalRecords, 3);
    // money hydrated.
    assert.equal(rows[0].monthlyAmount, '5000.00');

    // page 2 -> 1 row.
    assert.equal(flatten(callProc(db, 'get_all_saving_schemes', [2, 2, null, ''])).filter(r => r.schemeGuid).length, 1);

    // status filter.
    const active = flatten(callProc(db, 'get_all_saving_schemes', [20, 1, 'active', '']));
    assert.equal(active.filter(r => r.schemeGuid).length, 2, 'two remain active');
    assert.equal(active.find(r => typeof r.totalRecords === 'number').totalRecords, 2);

    // search by plan name.
    const byPlan = flatten(callProc(db, 'get_all_saving_schemes', [20, 1, null, 'Beta']));
    assert.equal(byPlan.filter(r => r.schemeGuid).length, 1);

    // search by customer name.
    assert.equal(flatten(callProc(db, 'get_all_saving_schemes', [20, 1, null, 'Asha'])).filter(r => r.schemeGuid).length, 3);
    // junk search -> none.
    assert.equal(flatten(callProc(db, 'get_all_saving_schemes', [20, 1, null, 'zzz'])).filter(r => r.schemeGuid).length, 0);
  } finally { cleanup(db); }
});

test('get_saving_scheme_details & get_saving_schemes_by_customer: shapes, installment set, hydration', () => {
  const db = freshDb();
  try {
    const s = enroll(db);
    flatten(callProc(db, 'record_scheme_installment', [s.schemeGuid, 5000, 'cash', null, '2026-01-05', null, 0]));

    // details -> [scheme row], [installments].
    const detRaw = callProc(db, 'get_saving_scheme_details', [s.schemeGuid]);
    assert.equal(detRaw.length, 3, '[scheme],[installments],sentinel');
    const det = flatten(detRaw);
    const scheme = det.find(r => r.schemeGuid);
    assert.equal(scheme.installmentsPaid, 1);
    assert.equal(scheme.totalPaid, '5000.00');
    const inst = det.find(r => r.installmentGuid);
    assert.equal(inst.amount, '5000.00', 'installment amount hydrated');
    assert.equal(inst.installmentNumber, 1);

    // details of unknown scheme -> empty scheme set, empty installments.
    const none = callProc(db, 'get_saving_scheme_details', ['no-such']);
    assert.deepEqual(none[0], [], 'empty scheme set');
    assert.deepEqual(none[1], [], 'empty installments set');

    // by customer.
    const byCust = flatten(callProc(db, 'get_saving_schemes_by_customer', ['cust-guid-1']));
    assert.equal(byCust.filter(r => r.schemeGuid).length, 1);
    assert.equal(byCust[0].monthlyAmount, '5000.00');
    assert.equal(byCust[0].installmentsPaid, 1);

    // unknown customer -> no rows.
    assert.equal(flatten(callProc(db, 'get_saving_schemes_by_customer', ['nope'])).length, 0);
  } finally { cleanup(db); }
});
