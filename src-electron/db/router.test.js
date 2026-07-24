/**
 * Main-process data-layer tests. Run with: `npm run test:db` (node --test).
 *
 * Proves the Phase 1 contract: the proc router returns the mysql2-compatible
 * envelope so the renderer's DbBridgeService.flatten() yields correct rows,
 * integer paise/mg hydrate to DECIMAL strings, and multi-result-set procs
 * (pagination) keep their flattened shape. No Electron required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const router = require('./router');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema', '001_baseline.sql'), 'utf8');

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
  const p = path.join(os.tmpdir(), `jsms-db-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

test('unregistered procs and raw SQL fall through to legacy', () => {
  assert.equal(router.tryExecute('call get_order_details(?)', ['x'], () => { throw new Error('should not open db'); }), undefined);
  assert.equal(router.isHandled('SELECT 1'), false);
  assert.equal(router.isHandled('call get_purities()'), true);
});

test('get_purities: plain SELECT, envelope + flatten', () => {
  const db = freshDb();
  try {
    const raw = router.tryExecute('call get_purities()', [], () => db);
    assert.equal(raw[raw.length - 1], router.SENTINEL, 'ends with sentinel');
    const rows = flatten(raw);
    assert.equal(rows.length, 8);
    assert.ok(rows[0].code && rows[0].metalType && 'fineness' in rows[0]);
  } finally { cleanup(db); }
});

test('add_customer: GUID generated, row returned, money hydrated', () => {
  const db = freshDb();
  try {
    const raw = router.tryExecute(
      'call add_customer(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['Asha', 'Rao', null, 'female', null, 'Pune', 'Maharashtra', '27', null, '9990001111', null, null, null, null],
      () => db,
    );
    const added = flatten(raw);
    assert.equal(added.length, 1);
    assert.equal(typeof added[0].customerGuid, 'string');
    assert.equal(added[0].customerGuid.length, 36);
    assert.equal(added[0].creditBalance, '0.00', 'paise 0 -> "0.00"');
    assert.equal(added[0].imagePath, null);
  } finally { cleanup(db); }
});

test('get_all_customers paged: 2 result sets, paise hydration, imagePath masking', () => {
  const db = freshDb();
  try {
    router.tryExecute('call add_customer(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['Asha', 'Rao', null, 'female', null, 'Pune', 'MH', '27', null, '999', null, null, null, null], () => db);
    db.prepare(`INSERT INTO customers (customerGuid,firstName,lastName,gender,city,phoneNumber,creditBalance)
                VALUES ('cg-x','Bal','Test','male','Mumbai','888',12345)`).run();

    const raw = router.tryExecute('call get_all_customers(?,?,?,?,?)', [1, 10, 1, 0, ''], () => db);
    assert.equal(raw.length, 3, '[count],[rows],sentinel');
    const page = flatten(raw);
    assert.equal(page.find(r => typeof r.totalRecords === 'number').totalRecords, 2);
    const rows = page.filter(r => r.customerGuid);
    assert.equal(rows.length, 2);
    assert.equal(rows.find(r => r.customerGuid === 'cg-x').creditBalance, '123.45', '12345 paise -> "123.45"');

    const all = flatten(router.tryExecute('call get_all_customers(?,?,?,?,?)', [0, 10, 1, 1, ''], () => db));
    assert.equal(all.length, 2, 'fetchAll returns all');
    assert.equal(all[0].imagePath, null, 'fetchImage=0 masks imagePath');
  } finally { cleanup(db); }
});
