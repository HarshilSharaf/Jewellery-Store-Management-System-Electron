/**
 * Metal-rates proc tests. Run with: node --test.
 * Proves the money boundary: save_metal_rates dehydrates rupees -> integer
 * paise on write, and get_current_metal_rates hydrates paise -> DECIMAL
 * string on read. Also covers the history window and the RBAC guard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const {
  get_current_metal_rates,
  get_metal_rates_history,
  save_metal_rates,
} = require('./metalRates');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-mr-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

function seedUser(db, type) {
  const info = db.prepare(
    `INSERT INTO users (userName, email, password, type)
     VALUES (?, ?, 'x', ?)`
  ).run(`u_${type}_${Math.random().toString(36).slice(2)}`, `${Math.random().toString(36).slice(2)}@e.com`, type);
  return info.lastInsertRowid;
}

test('save_metal_rates: rupees dehydrate to integer paise; get_current hydrates back', () => {
  const db = freshDb();
  try {
    const ratesJson = JSON.stringify([
      { purityCode: '916', ratePerGram: '7250.50' },
      { purityCode: '999', ratePerGram: 7999 },
    ]);
    const sets = save_metal_rates(db, ['2026-07-24', 'AM', 'manual', null, ratesJson]);

    // Stored value is integer paise.
    const stored = db.prepare(
      `SELECT ratePerGram FROM metalrates WHERE purityCode = '916' AND session = 'AM'`
    ).get();
    assert.equal(stored.ratePerGram, 725050, 'rupees 7250.50 -> 725050 paise (integer)');
    assert.equal(typeof stored.ratePerGram, 'number');

    // save_metal_rates returns get_current_metal_rates()'s single result set.
    assert.equal(sets.length, 1);
    const rows = sets[0];
    const r916 = rows.find(r => r.purityCode === '916');
    assert.equal(r916.ratePerGram, '7250.50', 'paise 725050 -> "7250.50" string on read');
    assert.equal(r916.purityLabel, '22K Gold (916)');
    assert.equal(r916.metalType, 'gold');
    const r999 = rows.find(r => r.purityCode === '999');
    assert.equal(r999.ratePerGram, '7999.00', 'integer rupees 7999 -> "7999.00"');
  } finally { cleanup(db); }
});

test('save_metal_rates: upsert on (date,session,purity) updates rate + source', () => {
  const db = freshDb();
  try {
    save_metal_rates(db, ['2026-07-24', 'AM', 'manual', null,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7000 }])]);
    save_metal_rates(db, ['2026-07-24', 'AM', 'ibja', null,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7100 }])]);

    const count = db.prepare(
      `SELECT COUNT(*) AS c FROM metalrates WHERE purityCode='916' AND session='AM' AND effectiveDate='2026-07-24'`
    ).get();
    assert.equal(count.c, 1, 'conflict updates in place, no duplicate row');

    const row = db.prepare(`SELECT ratePerGram, source FROM metalrates WHERE purityCode='916' AND session='AM'`).get();
    assert.equal(row.ratePerGram, 710000);
    assert.equal(row.source, 'ibja');

    // Audit trail written for each save.
    const audits = db.prepare(`SELECT COUNT(*) AS c FROM auditlog WHERE action='save_metal_rates'`).get();
    assert.equal(audits.c, 2);
  } finally { cleanup(db); }
});

test('get_current_metal_rates: latest AM and latest PM per purity', () => {
  const db = freshDb();
  try {
    save_metal_rates(db, ['2026-07-23', 'AM', 'manual', null,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7000 }])]);
    save_metal_rates(db, ['2026-07-24', 'AM', 'manual', null,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7200 }])]);
    save_metal_rates(db, ['2026-07-24', 'PM', 'manual', null,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7300 }])]);

    const [rows] = get_current_metal_rates(db);
    const am = rows.filter(r => r.purityCode === '916' && r.session === 'AM');
    const pm = rows.filter(r => r.purityCode === '916' && r.session === 'PM');
    assert.equal(am.length, 1);
    assert.equal(am[0].ratePerGram, '7200.00', 'latest AM only');
    assert.equal(pm.length, 1);
    assert.equal(pm[0].ratePerGram, '7300.00', 'latest PM only');
  } finally { cleanup(db); }
});

test('get_metal_rates_history: honours the day window and joins setByUserName', () => {
  const db = freshDb();
  try {
    const uid = seedUser(db, 'admin');
    save_metal_rates(db, ['2026-07-24', 'AM', 'manual', uid,
      JSON.stringify([{ purityCode: '916', ratePerGram: 7200 }])]);
    // An old row well outside a 30-day window.
    db.prepare(
      `INSERT INTO metalrates (effectiveDate, session, purityCode, ratePerGram, source)
       VALUES ('2000-01-01', 'AM', '999', 100000, 'manual')`
    ).run();

    const [recent] = get_metal_rates_history(db, [30]);
    assert.ok(recent.every(r => r.effectiveDate !== '2000-01-01'), 'old row excluded from 30-day window');
    const r = recent.find(x => x.purityCode === '916');
    assert.equal(r.ratePerGram, '7200.00');
    assert.equal(typeof r.setByUserName, 'string', 'left-joined userName present');

    // null/absent days -> default 30 (GREATEST(1, COALESCE(days,30))).
    const [def30] = get_metal_rates_history(db, [null]);
    assert.ok(def30.every(r2 => r2.effectiveDate !== '2000-01-01'));
  } finally { cleanup(db); }
});

test('save_metal_rates: employee actor is forbidden (RBAC guard)', () => {
  const db = freshDb();
  try {
    const emp = seedUser(db, 'employee');
    assert.throws(
      () => save_metal_rates(db, ['2026-07-24', 'AM', 'manual', emp,
        JSON.stringify([{ purityCode: '916', ratePerGram: 7200 }])]),
      /Forbidden: canEditShopSettings/,
    );
    const count = db.prepare('SELECT COUNT(*) AS c FROM metalrates').get();
    assert.equal(count.c, 0, 'no rows written when forbidden');
  } finally { cleanup(db); }
});
