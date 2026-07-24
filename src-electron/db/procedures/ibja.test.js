const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const ibja = require('./ibja');

const DIR = path.join(__dirname, '..', 'schema');
function flatten(raw) { if (!Array.isArray(raw)) return raw; let o = []; for (const s of raw.slice(0, -1)) if (Array.isArray(s)) o = o.concat(s); return o; }
function envelope(sets) { return [...sets, { __sqliteOk: true }]; }
function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-ibja-${process.pid}-${process.hrtime()[1]}.db`);
  const db = new Database(p); db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(DIR, '001_baseline.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(DIR, '002_p2_tables.sql'), 'utf8'));
  db._path = p; return db;
}
function cleanup(db) { const p = db._path; db.close(); for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(p + s, { force: true }); } catch (_) {} } }

test('save_ibja_snapshot: inserts, returns guid; validates session/status', () => {
  const db = freshDb();
  try {
    const r = flatten(envelope(ibja.save_ibja_snapshot(db, ['AM', 'raw text', 'success', null])));
    assert.equal(r[0].snapshotGuid.length, 36);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ibjaratesnapshots').get().c, 1);
    assert.throws(() => ibja.save_ibja_snapshot(db, ['XX', 'r', 'success', null]), /session/);
    assert.throws(() => ibja.save_ibja_snapshot(db, ['AM', 'r', 'bogus', null]), /status/);
  } finally { cleanup(db); }
});

test('get_ibja_snapshots: [rows,[count]], preview truncation', () => {
  const db = freshDb();
  try {
    const big = 'x'.repeat(900);
    ibja.save_ibja_snapshot(db, ['AM', big, 'success', null]);
    ibja.save_ibja_snapshot(db, ['PM', 'short', 'network_error', 'timeout']);
    const raw = ibja.get_ibja_snapshots(db, [null, null, null, 10, 1]);
    assert.equal(raw.length, 2, 'rows + count sets');
    const all = flatten(envelope(raw));
    const count = all.find(r => typeof r.totalRecords === 'number');
    assert.equal(count.totalRecords, 2);
    const rows = all.filter(r => r.snapshotGuid);
    assert.equal(rows.length, 2);
    const amRow = rows.find(r => r.session === 'AM');
    assert.equal(amRow.rawResponsePreview.length, 500, 'truncated to 500');
  } finally { cleanup(db); }
});
