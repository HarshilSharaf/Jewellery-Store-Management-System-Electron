/**
 * TaxSlabs proc tests. Run with:
 *   node --test src-electron/db/procedures/taxslabs.test.js
 *
 * Tax slabs are seeded by the baseline schema, so no fixture insert is needed
 * for the happy path. Calls the proc fn directly (no router, no Electron).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { get_tax_slabs } = require('./taxslabs');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-tax-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

test('get_tax_slabs: returns seeded active slabs, rates unchanged', () => {
  const db = freshDb();
  try {
    const sets = get_tax_slabs(db);
    assert.equal(sets.length, 1, 'single result set');
    const rows = sets[0];
    assert.equal(rows.length, 3, 'three seeded slabs');

    const row = rows[0];
    assert.ok('id' in row && 'hsnCode' in row && 'name' in row && 'effectiveFrom' in row);
    // REAL rates are NOT money columns -> pass through hydrate unchanged (numbers).
    assert.equal(row.cgstRate, 1.5);
    assert.equal(row.sgstRate, 1.5);
    assert.equal(row.igstRate, 3.0);
    assert.equal(typeof row.cgstRate, 'number', 'rate stays a number, not a paise string');
    assert.equal(row.active, 1);
  } finally { cleanup(db); }
});

test('get_tax_slabs: excludes inactive slabs, ordered by hsnCode', () => {
  const db = freshDb();
  try {
    db.prepare('UPDATE taxslabs SET active = 0 WHERE hsnCode = ?').run('7114');
    // Add a second effectiveFrom for 7113 to prove DESC ordering within an hsn.
    db.prepare(
      `INSERT INTO taxslabs (hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom)
       VALUES ('7113', 'Newer slab', 1.5, 1.5, 3.0, 1, '2025-01-01')`
    ).run();

    const rows = get_tax_slabs(db)[0];
    const codes = rows.map(r => r.hsnCode);
    assert.ok(!codes.includes('7114'), 'inactive slab excluded');

    const hsn7113 = rows.filter(r => r.hsnCode === '7113');
    assert.equal(hsn7113.length, 2);
    assert.equal(hsn7113[0].effectiveFrom, '2025-01-01', 'newest effectiveFrom first (DESC)');

    // hsnCode ascending overall.
    const sorted = [...codes].sort();
    assert.deepEqual(codes, sorted, 'ordered by hsnCode ascending');
  } finally { cleanup(db); }
});
