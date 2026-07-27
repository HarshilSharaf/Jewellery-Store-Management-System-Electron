/**
 * Repair-ticket data-layer tests. Run:
 *   node --test src-electron/db/procedures/repair.test.js
 *
 * Proves: create_repair_ticket formats ticketNumber (repairPrefix + LPAD 5) and
 * increments currentRepairCounter atomically; money/weight stored as EXACT
 * integer paise/mg and hydrated back to DECIMAL strings on read; the
 * update_repair_status transition allow-map accepts valid edges + 'declined'
 * from any state and rejects invalid ones; settle flow (ready -> delivered,
 * required fields, deliveredAt stamp); guards throw the SP's exact MESSAGE_TEXT;
 * RBAC on delete; pagination + search + status/date filters.
 *
 * The DB is built by exec'ing BOTH schema files (001 baseline then 002 P2), so
 * repairtickets / karigars / karigarjobcards exist.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('../router');
const repair = require('./repair');

const SCHEMA_1 = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');
const SCHEMA_2 = fs.readFileSync(path.join(__dirname, '..', 'schema', '002_p2_tables.sql'), 'utf8');

/**
 * repair procs are not registered in the router registry yet (strict scope of
 * this task is repair.js/repair.test.js only). We call the proc directly and
 * append the router SENTINEL so the envelope + flatten() behave exactly as they
 * will once the proc is wired into ./index.js.
 */
function callProc(db, name, params) {
  const sets = repair[name](db, Array.isArray(params) ? params : []);
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
  const p = path.join(os.tmpdir(), `jsms-repair-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Seeds shopsettings singleton (with repair counter), a user, a customer, a karigar. */
function seed(db) {
  db.prepare(
    `INSERT INTO shopsettings
       (id, shopName, gstin, addressLine1, city, state, stateCode, pincode, phone,
        invoicePrefix, currentInvoiceCounter, repairPrefix, currentRepairCounter)
     VALUES (1,'Test Jewellers','27AAAAA0000A1Z5','1 MG Rd','Pune','Maharashtra','27','411001','9990001111',
             'INV/', 1, 'REP/', 1)`
  ).run();

  const owner = db.prepare(
    `INSERT INTO users (userName, email, password, type) VALUES ('owner','o@x.com','p','owner')`
  ).run();
  db._ownerUid = owner.lastInsertRowid;

  const emp = db.prepare(
    `INSERT INTO users (userName, email, password, type) VALUES ('emp','e@x.com','p','employee')`
  ).run();
  db._empUid = emp.lastInsertRowid;

  const cust = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, gender, city, phoneNumber, email)
     VALUES ('cust-guid-1','Asha','Rao','female','Pune','9998887777','asha@x.com')`
  ).run();
  db._customerId = cust.lastInsertRowid;

  const kar = db.prepare(
    `INSERT INTO karigars (karigarGuid, name, phone) VALUES ('kar-guid-1','Ravi Smith','9111122223')`
  ).run();
  db._karigarId = kar.lastInsertRowid;
}

// create_repair_ticket positional param order (9 IN params).
function createParams(overrides = {}) {
  return [
    overrides.customerGuid !== undefined ? overrides.customerGuid : 'cust-guid-1', // p_customerGuid
    overrides.receivedByUserId,        // p_receivedByUserId (set per test)
    overrides.itemDescription !== undefined ? overrides.itemDescription : 'Gold chain clasp repair',
    overrides.itemPhotoPath !== undefined ? overrides.itemPhotoPath : null,
    overrides.weight !== undefined ? overrides.weight : 12.345,       // g
    overrides.estimatedCharge !== undefined ? overrides.estimatedCharge : 750.5, // ₹
    overrides.estimatedReturnDate !== undefined ? overrides.estimatedReturnDate : '2026-08-01',
    overrides.notes !== undefined ? overrides.notes : 'handle with care',
    overrides.karigarGuid !== undefined ? overrides.karigarGuid : null, // p_karigarGuid
  ];
}

test('create_repair_ticket: ticketNumber format, counter increment, exact paise/mg storage', () => {
  const db = freshDb();
  try {
    const res = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    assert.equal(res.ticketNumber, 'REP/00001', 'repairPrefix + LPAD(counter,5)');
    assert.equal(typeof res.ticketGuid, 'string');
    assert.equal(res.ticketGuid.length, 36);

    const row = db.prepare('SELECT * FROM repairtickets WHERE id = ?').get(res.ticketId);
    assert.equal(row.weight, 12345, '12.345 g -> 12345 mg');
    assert.equal(row.estimatedCharge, 75050, '₹750.50 -> 75050 paise');
    assert.equal(row.status, 'received', 'new ticket starts received');
    assert.equal(row.customerId, db._customerId);
    assert.equal(row.karigarId, null);

    const counter = db.prepare('SELECT currentRepairCounter FROM shopsettings WHERE id = 1').get().currentRepairCounter;
    assert.equal(counter, 2, 'counter incremented');

    // Second ticket numbers sequentially.
    const res2 = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    assert.equal(res2.ticketNumber, 'REP/00002');

    // Audit row written.
    const audit = db.prepare("SELECT * FROM auditlog WHERE action = 'create_repair_ticket' AND entityId = ?").get(String(res.ticketId));
    assert.ok(audit, 'audit row present');
  } finally { cleanup(db); }
});

test('create_repair_ticket: with valid karigarGuid links; bad karigarGuid throws; bad customer throws', () => {
  const db = freshDb();
  try {
    const res = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid, karigarGuid: 'kar-guid-1' })))[0];
    const row = db.prepare('SELECT karigarId FROM repairtickets WHERE id = ?').get(res.ticketId);
    assert.equal(row.karigarId, db._karigarId, 'karigar linked at creation');

    assert.throws(
      () => callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid, karigarGuid: 'no-such-karigar' })),
      /create_repair_ticket: karigar not found/,
    );
    assert.throws(
      () => callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid, customerGuid: 'no-such-customer' })),
      /create_repair_ticket: customer not found/,
    );

    // Failed creates rolled back: counter still at 2 (only the first succeeded).
    assert.equal(db.prepare('SELECT currentRepairCounter FROM shopsettings WHERE id = 1').get().currentRepairCounter, 2);
  } finally { cleanup(db); }
});

test('get_repair_ticket_details: money/weight hydrate to DECIMAL strings, customerName joined', () => {
  const db = freshDb();
  try {
    const created = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    const det = flatten(callProc(db, 'get_repair_ticket_details', [created.ticketGuid]))[0];

    assert.equal(det.ticketNumber, 'REP/00001');
    assert.equal(det.customerName, 'Asha Rao', 'CONCAT_WS(firstName,lastName)');
    assert.equal(det.customerPhone, '9998887777');
    assert.equal(det.customerEmail, 'asha@x.com');
    assert.equal(det.receivedByUserName, 'owner');
    assert.equal(det.weight, '12.345', 'weight hydrated to 3dp string');
    assert.equal(det.estimatedCharge, '750.50', 'estimatedCharge hydrated to 2dp string');
    assert.equal(det.actualCharge, null, 'unset actualCharge stays null');

    // Not found -> empty result set.
    assert.equal(flatten(callProc(db, 'get_repair_ticket_details', ['no-such-guid'])).length, 0);
  } finally { cleanup(db); }
});

test('update_repair_status: valid transitions advance; invalid ones throw; declined from any state', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];

    // received -> ready is NOT allowed.
    assert.throws(
      () => callProc(db, 'update_repair_status', [t.ticketGuid, 'ready', db._ownerUid, null, null, null]),
      /update_repair_status: invalid transition/,
    );

    // received -> in_progress -> ready (valid chain).
    let r = flatten(callProc(db, 'update_repair_status', [t.ticketGuid, 'in_progress', db._ownerUid, null, null, null]))[0];
    assert.equal(r.status, 'in_progress');
    r = flatten(callProc(db, 'update_repair_status', [t.ticketGuid, 'ready', db._ownerUid, null, null, null]))[0];
    assert.equal(r.status, 'ready');

    // ready -> delivered requires actualCharge + paymentMode.
    assert.throws(
      () => callProc(db, 'update_repair_status', [t.ticketGuid, 'delivered', db._ownerUid, null, null, null]),
      /update_repair_status: delivered requires actualCharge and paymentMode/,
    );

    // Valid delivered with charge/payment: stamps deliveredAt, stores paise.
    r = flatten(callProc(db, 'update_repair_status', [t.ticketGuid, 'delivered', db._ownerUid, 800.25, 'cash', 'R-1']))[0];
    assert.equal(r.status, 'delivered');
    const row = db.prepare('SELECT * FROM repairtickets WHERE id = ?').get(t.ticketId);
    assert.equal(row.actualCharge, 80025, '₹800.25 -> 80025 paise');
    assert.equal(row.paymentMode, 'cash');
    assert.ok(row.deliveredAt, 'deliveredAt stamped on delivered');

    // 'declined' is reachable from any state (fresh ticket, received -> declined).
    const t2 = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    const d = flatten(callProc(db, 'update_repair_status', [t2.ticketGuid, 'declined', db._ownerUid, null, null, null]))[0];
    assert.equal(d.status, 'declined');

    // Unknown ticket throws.
    assert.throws(
      () => callProc(db, 'update_repair_status', ['no-such-guid', 'in_progress', db._ownerUid, null, null, null]),
      /update_repair_status: ticket not found/,
    );
  } finally { cleanup(db); }
});

test('update_repair_status: COALESCE preserves existing charge/payment when not supplied', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    callProc(db, 'update_repair_status', [t.ticketGuid, 'in_progress', db._ownerUid, 500, 'cash', 'REF-9']);
    // Advancing to ready with all charge params null must NOT wipe them.
    callProc(db, 'update_repair_status', [t.ticketGuid, 'ready', db._ownerUid, null, null, null]);
    const row = db.prepare('SELECT actualCharge, paymentMode, paymentRef FROM repairtickets WHERE id = ?').get(t.ticketId);
    assert.equal(row.actualCharge, 50000, 'preserved ₹500 -> 50000 paise');
    assert.equal(row.paymentMode, 'cash', 'preserved paymentMode');
    assert.equal(row.paymentRef, 'REF-9', 'preserved paymentRef');
  } finally { cleanup(db); }
});

test('settle_repair_ticket: only from ready, requires fields, sets delivered + deliveredAt', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];

    // Not ready yet -> throws.
    assert.throws(
      () => callProc(db, 'settle_repair_ticket', [t.ticketGuid, 900, 'cash', 'X', db._ownerUid]),
      /settle_repair_ticket: ticket is not in ready state/,
    );

    // Advance to ready.
    callProc(db, 'update_repair_status', [t.ticketGuid, 'in_progress', db._ownerUid, null, null, null]);
    callProc(db, 'update_repair_status', [t.ticketGuid, 'ready', db._ownerUid, null, null, null]);

    // Missing paymentMode -> throws.
    assert.throws(
      () => callProc(db, 'settle_repair_ticket', [t.ticketGuid, 900, '', null, db._ownerUid]),
      /settle_repair_ticket: actualCharge and paymentMode required/,
    );

    // Valid settle.
    const r = flatten(callProc(db, 'settle_repair_ticket', [t.ticketGuid, 900.75, 'online', 'UTR-77', db._ownerUid]))[0];
    assert.equal(r.status, 'delivered');
    const row = db.prepare('SELECT * FROM repairtickets WHERE id = ?').get(t.ticketId);
    assert.equal(row.status, 'delivered');
    assert.equal(row.actualCharge, 90075, '₹900.75 -> 90075 paise');
    assert.equal(row.paymentMode, 'online');
    assert.equal(row.paymentRef, 'UTR-77');
    assert.ok(row.deliveredAt, 'deliveredAt stamped');

    // Unknown ticket throws.
    assert.throws(
      () => callProc(db, 'settle_repair_ticket', ['no-such', 100, 'cash', null, db._ownerUid]),
      /settle_repair_ticket: ticket not found/,
    );
  } finally { cleanup(db); }
});

test('link_repair_to_karigar: links karigar (+optional job); bad guids throw', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];

    // A job card for the karigar (optional link target).
    db.prepare(
      `INSERT INTO karigarjobcards (jobGuid, karigarId, issueDate) VALUES ('job-guid-1', ?, '2026-07-24')`
    ).run(db._karigarId);
    const jobId = db.prepare("SELECT id FROM karigarjobcards WHERE jobGuid = 'job-guid-1'").get().id;

    const r = flatten(callProc(db, 'link_repair_to_karigar', [t.ticketGuid, 'kar-guid-1', 'job-guid-1', db._ownerUid]))[0];
    assert.equal(r.karigarId, db._karigarId);
    assert.equal(r.karigarJobId, jobId);

    const row = db.prepare('SELECT karigarId, karigarJobId FROM repairtickets WHERE id = ?').get(t.ticketId);
    assert.equal(row.karigarId, db._karigarId);
    assert.equal(row.karigarJobId, jobId);

    assert.throws(
      () => callProc(db, 'link_repair_to_karigar', [t.ticketGuid, 'no-such-karigar', null, db._ownerUid]),
      /link_repair_to_karigar: karigar not found/,
    );
    assert.throws(
      () => callProc(db, 'link_repair_to_karigar', ['no-such-ticket', 'kar-guid-1', null, db._ownerUid]),
      /link_repair_to_karigar: ticket not found/,
    );
    assert.throws(
      () => callProc(db, 'link_repair_to_karigar', [t.ticketGuid, 'kar-guid-1', 'no-such-job', db._ownerUid]),
      /link_repair_to_karigar: karigar job not found/,
    );
  } finally { cleanup(db); }
});

test('delete_repair_ticket: employee forbidden; owner soft-deletes (hidden from reads)', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];

    assert.throws(
      () => callProc(db, 'delete_repair_ticket', [t.ticketGuid, db._empUid]),
      /Forbidden: canDeleteRepair/,
    );

    const r = flatten(callProc(db, 'delete_repair_ticket', [t.ticketGuid, db._ownerUid]))[0];
    assert.equal(r.ticketId, t.ticketId);

    const row = db.prepare('SELECT deletedAt FROM repairtickets WHERE id = ?').get(t.ticketId);
    assert.ok(row.deletedAt, 'deletedAt stamped');

    // Soft-deleted ticket no longer visible in details.
    assert.equal(flatten(callProc(db, 'get_repair_ticket_details', [t.ticketGuid])).length, 0);

    // Deleting again -> not found (already filtered out).
    assert.throws(
      () => callProc(db, 'delete_repair_ticket', [t.ticketGuid, db._ownerUid]),
      /delete_repair_ticket: ticket not found/,
    );
  } finally { cleanup(db); }
});

test('get_all_repair_tickets: rows + count sets, pagination, status/search filters, hydration', () => {
  const db = freshDb();
  try {
    // Create 3 tickets; put one in_progress; soft-delete one.
    const a = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    const b = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    const c = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    callProc(db, 'update_repair_status', [b.ticketGuid, 'in_progress', db._ownerUid, null, null, null]);
    callProc(db, 'delete_repair_ticket', [c.ticketGuid, db._ownerUid]);

    // No filters: 2 visible (c soft-deleted).
    const raw = callProc(db, 'get_all_repair_tickets', [null, null, null, null, 20, 1]);
    assert.equal(raw.length, 3, '[rows],[count],sentinel');
    const flat = flatten(raw);
    const total = flat.find((r) => typeof r.totalRecords === 'number').totalRecords;
    assert.equal(total, 2, 'soft-deleted excluded from count');
    const list = flat.filter((r) => r.ticketGuid);
    assert.equal(list.length, 2);
    // money/weight hydrated.
    assert.equal(list[0].estimatedCharge, '750.50');
    assert.equal(list[0].weight, '12.345');
    assert.equal(list[0].customerName, 'Asha Rao');

    // Status filter: only in_progress -> 1.
    const byStatus = flatten(callProc(db, 'get_all_repair_tickets', ['in_progress', null, null, null, 20, 1]));
    assert.equal(byStatus.filter((r) => r.ticketGuid).length, 1);
    assert.equal(byStatus.find((r) => typeof r.totalRecords === 'number').totalRecords, 1);

    // Search by ticketNumber.
    const bySearch = flatten(callProc(db, 'get_all_repair_tickets', [null, a.ticketNumber, null, null, 20, 1]));
    assert.equal(bySearch.filter((r) => r.ticketGuid).length, 1);

    // Search by customer name.
    const byName = flatten(callProc(db, 'get_all_repair_tickets', [null, 'Asha', null, null, 20, 1]));
    assert.equal(byName.filter((r) => r.ticketGuid).length, 2);

    // Junk search -> none.
    const none = flatten(callProc(db, 'get_all_repair_tickets', [null, 'zzz-nomatch', null, null, 20, 1]));
    assert.equal(none.filter((r) => r.ticketGuid).length, 0);

    // Pagination: pageSize 1 -> 1 row, but total still 2.
    const page1 = flatten(callProc(db, 'get_all_repair_tickets', [null, null, null, null, 1, 1]));
    assert.equal(page1.filter((r) => r.ticketGuid).length, 1);
    assert.equal(page1.find((r) => typeof r.totalRecords === 'number').totalRecords, 2);
    const page2 = flatten(callProc(db, 'get_all_repair_tickets', [null, null, null, null, 1, 2]));
    assert.equal(page2.filter((r) => r.ticketGuid).length, 1);

    // Date filter: future dateFrom excludes all.
    const future = flatten(callProc(db, 'get_all_repair_tickets', [null, null, '2999-01-01', null, 20, 1]));
    assert.equal(future.filter((r) => r.ticketGuid).length, 0);
  } finally { cleanup(db); }
});

test('get_repair_tickets_by_customer: returns customer tickets, excludes deleted, hydrates', () => {
  const db = freshDb();
  try {
    const t = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    const del = flatten(callProc(db, 'create_repair_ticket', createParams({ receivedByUserId: db._ownerUid })))[0];
    callProc(db, 'delete_repair_ticket', [del.ticketGuid, db._ownerUid]);

    const rows = flatten(callProc(db, 'get_repair_tickets_by_customer', ['cust-guid-1']));
    assert.equal(rows.length, 1, 'only non-deleted ticket for the customer');
    assert.equal(rows[0].ticketGuid, t.ticketGuid);
    assert.equal(rows[0].estimatedCharge, '750.50', 'hydrated');
    assert.equal(rows[0].weight, '12.345');

    // Unknown customer -> empty.
    assert.equal(flatten(callProc(db, 'get_repair_tickets_by_customer', ['no-such-customer'])).length, 0);
  } finally { cleanup(db); }
});
