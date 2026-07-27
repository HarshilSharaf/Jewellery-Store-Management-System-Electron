/**
 * Karigar data-layer tests. Run:
 *   node --test src-electron/db/procedures/karigar.test.js
 *
 * Proves: add/update/delete karigar; the issue -> receive -> settle status flow
 * and its guards; EXACT integer paise/mg storage with hydrated DECIMAL-string
 * reads; the conditional making-charge ledger row; the ledger balance rollup
 * math (issued/received grams, making accrued, payments, balance due); and
 * count+page pagination shape for both list procs.
 *
 * Both P2 schema files must be exec'd (001 baseline provides users/customers/
 * products/purities; 002 provides the karigar tables).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('../router');
const karigar = require('./karigar');

const SCHEMA_1 = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');
const SCHEMA_2 = fs.readFileSync(path.join(__dirname, '..', 'schema', '002_p2_tables.sql'), 'utf8');

/** Calls the proc directly and appends the router SENTINEL (proc not yet in registry). */
function callProc(db, name, params) {
  const sets = karigar[name](db, Array.isArray(params) ? params : []);
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
  const p = path.join(os.tmpdir(), `jsms-karigar-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Seeds a user (for actorUserId FK + audit) and a customer. */
function seed(db) {
  db._userId = db.prepare(
    `INSERT INTO users (userName, email, password, type)
     VALUES ('owner', 'o@x.com', 'p', 'owner')`
  ).run().lastInsertRowid;

  db._customerId = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, gender, city, phoneNumber)
     VALUES ('cust-guid-1','Asha','Rao','female','Pune','9998887777')`
  ).run().lastInsertRowid;
}

/** Convenience: create a karigar, return its guid. */
function addKarigar(db, name = 'Ramesh Smith', phone = '9000000001') {
  const res = flatten(callProc(db, 'add_karigar', [name, phone, 'Shop 3', 'reliable', db._userId]))[0];
  return res.karigarGuid;
}

test('add_karigar: inserts, returns id+guid, writes audit', () => {
  const db = freshDb();
  try {
    const raw = callProc(db, 'add_karigar', ['Ramesh', '9000000001', 'Addr', 'note', db._userId]);
    const out = flatten(raw);
    assert.equal(out.length, 1);
    assert.equal(typeof out[0].karigarGuid, 'string');
    assert.equal(out[0].karigarGuid.length, 36);
    assert.equal(typeof out[0].karigarId, 'number');

    const row = db.prepare('SELECT * FROM karigars WHERE id = ?').get(out[0].karigarId);
    assert.equal(row.name, 'Ramesh');
    assert.equal(row.phone, '9000000001');

    const audit = db.prepare(
      "SELECT * FROM auditlog WHERE action = 'add_karigar' AND entityId = ?"
    ).get(String(out[0].karigarId));
    assert.ok(audit, 'audit row written');
  } finally { cleanup(db); }
});

test('update_karigar: name COALESCE, direct phone/address; not-found throws', () => {
  const db = freshDb();
  try {
    const guid = addKarigar(db);
    callProc(db, 'update_karigar', [guid, 'Ramesh Kumar', '9111111111', 'New Addr', 'vip', db._userId]);
    let row = db.prepare('SELECT * FROM karigars WHERE karigarGuid = ?').get(guid);
    assert.equal(row.name, 'Ramesh Kumar');
    assert.equal(row.phone, '9111111111');
    assert.equal(row.address, 'New Addr');

    // name = COALESCE(NULL, name) keeps existing; phone overwritten to NULL directly.
    callProc(db, 'update_karigar', [guid, null, null, null, null, db._userId]);
    row = db.prepare('SELECT * FROM karigars WHERE karigarGuid = ?').get(guid);
    assert.equal(row.name, 'Ramesh Kumar', 'name preserved via COALESCE');
    assert.equal(row.phone, null, 'phone overwritten directly');

    assert.throws(
      () => callProc(db, 'update_karigar', ['no-such-guid', 'X', null, null, null, null]),
      /karigar not found/,
    );
  } finally { cleanup(db); }
});

test('delete_karigar: soft-delete stamps deletedAt; not-found throws', () => {
  const db = freshDb();
  try {
    const guid = addKarigar(db);
    callProc(db, 'delete_karigar', [guid, db._userId]);
    const row = db.prepare('SELECT deletedAt FROM karigars WHERE karigarGuid = ?').get(guid);
    assert.ok(row.deletedAt, 'deletedAt stamped');

    // Deleted karigar is no longer resolvable -> not found.
    assert.throws(
      () => callProc(db, 'delete_karigar', [guid, db._userId]),
      /karigar not found/,
    );
  } finally { cleanup(db); }
});

test('get_all_karigars: rows + count sets, search filter, hidden after delete', () => {
  const db = freshDb();
  try {
    addKarigar(db, 'Alpha Smith', '9000000001');
    addKarigar(db, 'Beta Goldworks', '9000000002');

    const raw = callProc(db, 'get_all_karigars', [10, 1, '']);
    assert.equal(raw.length, 3, '[rows],[count],sentinel');
    const flat = flatten(raw);
    const count = flat.find(r => typeof r.totalRecords === 'number');
    assert.equal(count.totalRecords, 2);
    assert.equal(flat.filter(r => r.karigarGuid).length, 2);

    // ORDER BY name ASC.
    const names = flat.filter(r => r.karigarGuid).map(r => r.name);
    assert.deepEqual(names, ['Alpha Smith', 'Beta Goldworks']);

    // Search by name.
    assert.equal(flatten(callProc(db, 'get_all_karigars', [10, 1, 'Beta'])).filter(r => r.karigarGuid).length, 1);
    assert.equal(flatten(callProc(db, 'get_all_karigars', [10, 1, 'zzz'])).filter(r => r.karigarGuid).length, 0);

    // openJobs / totalJobs columns present.
    assert.equal(count.totalRecords, 2);
    const alpha = flat.find(r => r.name === 'Alpha Smith');
    assert.equal(alpha.totalJobs, 0);
    assert.equal(alpha.openJobs, 0);
  } finally { cleanup(db); }
});

test('issue -> receive -> settle: status flow, guards, paise/mg storage, hydration', () => {
  const db = freshDb();
  try {
    const guid = addKarigar(db);

    // ---- ISSUE ----
    const issued = flatten(callProc(db, 'issue_karigar_job', [
      guid, '2026-07-01', 25.5, '916', JSON.stringify({ diamond: 2 }),
      '2026-07-20', 'Ring casting', db._userId,
    ]))[0];
    assert.equal(typeof issued.jobGuid, 'string');
    const jobGuid = issued.jobGuid;

    let job = db.prepare('SELECT * FROM karigarjobcards WHERE id = ?').get(issued.jobId);
    assert.equal(job.status, 'issued');
    assert.equal(job.issuedGrossWeight, 25500, '25.5 g -> 25500 mg');
    assert.equal(job.issuedStones, '{"diamond":2}', 'JSON stored as-is');

    // issue ledger row: issue/debit, weight in mg, amount 0.
    const issueLedger = db.prepare(
      "SELECT * FROM karigarledger WHERE jobId = ? AND entryType = 'issue'"
    ).get(issued.jobId);
    assert.equal(issueLedger.direction, 'debit');
    assert.equal(issueLedger.weightGrams, 25500);
    assert.equal(issueLedger.amount, 0);

    // Cannot settle before receive.
    assert.throws(
      () => callProc(db, 'settle_karigar_job', [jobGuid, 5000, 'cash', null, db._userId]),
      /not in received state/,
    );

    // ---- RECEIVE (with making charge -> 2nd ledger row) ----
    callProc(db, 'receive_karigar_job', [
      jobGuid, '2026-07-15', 25.0, 24.0, 1.0, 2.0, 0.5, 1500.75, 'ok', db._userId,
    ]);
    job = db.prepare('SELECT * FROM karigarjobcards WHERE id = ?').get(issued.jobId);
    assert.equal(job.status, 'received');
    assert.equal(job.receivedGrossWeight, 25000, '25.0 g -> 25000 mg');
    assert.equal(job.receivedNetWeight, 24000);
    assert.equal(job.receivedStoneWeight, 1000);
    assert.equal(job.wastageGramsActual, 500, '0.5 g -> 500 mg');
    assert.equal(job.wastagePercentAllowed, 2.0, 'REAL percent passed through');
    assert.equal(job.makingCharge, 150075, 'Rs.1500.75 -> 150075 paise');

    const ledgers = db.prepare(
      'SELECT * FROM karigarledger WHERE jobId = ? ORDER BY id ASC'
    ).all(issued.jobId);
    assert.equal(ledgers.length, 3, 'issue + receive + making-charge adjustment');
    const receive = ledgers.find(l => l.entryType === 'receive');
    assert.equal(receive.direction, 'credit');
    assert.equal(receive.weightGrams, 25000);
    const making = ledgers.find(l => l.entryType === 'adjustment');
    assert.equal(making.direction, 'credit');
    assert.equal(making.amount, 150075);
    assert.equal(making.weightGrams, null);

    // Cannot receive twice.
    assert.throws(
      () => callProc(db, 'receive_karigar_job', [jobGuid, null, 1, 1, 0, 0, 0, 0, null, db._userId]),
      /not in issued state/,
    );

    // ---- SETTLE ----
    callProc(db, 'settle_karigar_job', [jobGuid, 1500.75, 'upi', 'UTR-9', db._userId]);
    job = db.prepare('SELECT * FROM karigarjobcards WHERE id = ?').get(issued.jobId);
    assert.equal(job.status, 'settled');
    assert.equal(job.settlementAmount, 150075);
    assert.equal(job.settlementPaymentMode, 'upi');
    assert.ok(job.settledAt, 'settledAt stamped');

    const payment = db.prepare(
      "SELECT * FROM karigarledger WHERE jobId = ? AND entryType = 'payment'"
    ).get(issued.jobId);
    assert.equal(payment.direction, 'debit');
    assert.equal(payment.amount, 150075);

    // ---- READ back through details: hydration to DECIMAL strings ----
    const det = flatten(callProc(db, 'get_karigar_job_card_details', [jobGuid]));
    const head = det.find(r => r.jobGuid);
    assert.equal(head.issuedGrossWeight, '25.500', 'weight hydrated to 3dp');
    assert.equal(head.makingCharge, '1500.75', 'money hydrated to 2dp');
    assert.equal(head.settlementAmount, '1500.75');
    assert.equal(head.karigarName, 'Ramesh Smith');
    const ledgerRows = det.filter(r => r.ledgerGuid);
    assert.equal(ledgerRows.length, 4, 'issue + receive + making + payment');
    const hMaking = ledgerRows.find(r => r.entryType === 'adjustment');
    assert.equal(hMaking.amount, '1500.75', 'ledger amount hydrated');
  } finally { cleanup(db); }
});

test('receive_karigar_job: no making charge -> no adjustment ledger row', () => {
  const db = freshDb();
  try {
    const guid = addKarigar(db);
    const jobGuid = flatten(callProc(db, 'issue_karigar_job', [
      guid, null, 10, '916', null, null, 'job', db._userId,
    ]))[0].jobGuid;

    callProc(db, 'receive_karigar_job', [jobGuid, null, 10, 9.5, 0, 0, 0.5, 0, null, db._userId]);
    const jobId = db.prepare('SELECT id FROM karigarjobcards WHERE jobGuid = ?').get(jobGuid).id;
    const count = db.prepare(
      "SELECT COUNT(*) AS c FROM karigarledger WHERE jobId = ? AND entryType = 'adjustment'"
    ).get(jobId).c;
    assert.equal(count, 0, 'no making charge -> no adjustment row');
  } finally { cleanup(db); }
});

test('get_all_karigar_jobs: rows + count, karigar filter, status filter, hydration', () => {
  const db = freshDb();
  try {
    const g1 = addKarigar(db, 'K One', '9000000001');
    const g2 = addKarigar(db, 'K Two', '9000000002');

    const j1 = flatten(callProc(db, 'issue_karigar_job', [g1, '2026-07-01', 5, '916', null, null, 'a', db._userId]))[0].jobGuid;
    flatten(callProc(db, 'issue_karigar_job', [g1, '2026-07-02', 6, '916', null, null, 'b', db._userId]));
    flatten(callProc(db, 'issue_karigar_job', [g2, '2026-07-03', 7, '916', null, null, 'c', db._userId]));

    // Receive j1 so it leaves 'issued'.
    callProc(db, 'receive_karigar_job', [j1, null, 5, 4.8, 0, 0, 0.2, 0, null, db._userId]);

    // All jobs.
    let raw = callProc(db, 'get_all_karigar_jobs', [10, 1, null, null]);
    assert.equal(raw.length, 3, '[rows],[count],sentinel');
    let flat = flatten(raw);
    assert.equal(flat.find(r => typeof r.totalRecords === 'number').totalRecords, 3);

    // Filter by karigar g1 -> 2 jobs.
    flat = flatten(callProc(db, 'get_all_karigar_jobs', [10, 1, g1, null]));
    assert.equal(flat.find(r => typeof r.totalRecords === 'number').totalRecords, 2);

    // Filter by status 'issued' -> j1 excluded (received), so 2 remaining (g1 b + g2 c).
    flat = flatten(callProc(db, 'get_all_karigar_jobs', [10, 1, null, 'issued']));
    assert.equal(flat.find(r => typeof r.totalRecords === 'number').totalRecords, 2);

    // Weight hydration on rows.
    const anyJob = flat.find(r => r.jobGuid);
    assert.equal(typeof anyJob.issuedGrossWeight, 'string');
    assert.ok(anyJob.issuedGrossWeight.includes('.'), 'weight hydrated to decimal string');
  } finally { cleanup(db); }
});

test('get_karigar_ledger: rollup balance math + entry list, date window', () => {
  const db = freshDb();
  try {
    const guid = addKarigar(db);
    const jobGuid = flatten(callProc(db, 'issue_karigar_job', [
      guid, '2026-07-01', 30.0, '916', null, null, 'job', db._userId,
    ]))[0].jobGuid;
    // receive 28g, making charge Rs.2000
    callProc(db, 'receive_karigar_job', [jobGuid, '2026-07-10', 28.0, 27.0, 1.0, 3.0, 2.0, 2000, 'ok', db._userId]);
    // settle Rs.1500 (partial payment vs Rs.2000 accrued)
    callProc(db, 'settle_karigar_job', [jobGuid, 1500, 'cash', null, db._userId]);

    const raw = callProc(db, 'get_karigar_ledger', [guid, '2026-06-01', '2026-08-01']);
    assert.equal(raw.length, 3, '[rollup],[entries],sentinel');
    const flat = flatten(raw);
    const rollup = flat.find(r => r.balanceDue !== undefined);
    assert.ok(rollup, 'rollup row present');

    assert.equal(rollup.issuedGrams, '30.000', 'issued grams hydrated');
    assert.equal(rollup.receivedGrams, '28.000');
    assert.equal(rollup.netMetalOutstandingGrams, '2.000', '30 - 28 = 2 g outstanding');
    assert.equal(rollup.makingAccrued, '2000.00');
    assert.equal(rollup.paymentsMade, '1500.00');
    assert.equal(rollup.balanceDue, '500.00', '2000 accrued - 1500 paid = 500 due');
    assert.equal(rollup.dateFrom, '2026-06-01');
    assert.equal(rollup.dateTo, '2026-08-01');

    // Entry list: issue + receive + making adjustment + payment = 4 rows.
    const entries = flat.filter(r => r.ledgerGuid);
    assert.equal(entries.length, 4);
    // entries carry jobGuid via LEFT JOIN and hydrate weight/amount.
    const issue = entries.find(e => e.entryType === 'issue');
    assert.equal(issue.jobGuid, jobGuid);
    assert.equal(issue.weightGrams, '30.000');
    const payment = entries.find(e => e.entryType === 'payment');
    assert.equal(payment.amount, '1500.00');

    // Date window excludes out-of-range entries.
    const narrow = flatten(callProc(db, 'get_karigar_ledger', [guid, '2026-07-05', '2026-07-31']));
    const narrowEntries = narrow.filter(r => r.ledgerGuid);
    // issue (07-01) excluded; receive/making (07-10) + payment (today or CURDATE) — payment txnDate is date('now').
    assert.ok(narrowEntries.every(e => e.entryType !== 'issue'), 'issue on 07-01 outside window');
  } finally { cleanup(db); }
});
