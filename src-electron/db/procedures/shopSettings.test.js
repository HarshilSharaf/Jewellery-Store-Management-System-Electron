/**
 * Shop-settings proc tests. Run with: node --test.
 * Covers the singleton (id=1) upsert, the invoice-counter reset, and the
 * RBAC guard. shopsettings has no money columns.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const {
  get_shop_settings,
  reset_invoice_counter,
  save_shop_settings,
} = require('./shopSettings');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-ss-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

// 22 positional params in the SP's IN order (last is actorUserId).
function baseParams(overrides = {}) {
  const p = {
    shopName: 'Shubham Jewellers', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F',
    addressLine1: '12 MG Road', addressLine2: null, city: 'Pune', state: 'Maharashtra',
    stateCode: '27', pincode: '411001', phone: '9990001111', email: 's@j.com',
    logoPath: null, invoicePrefix: undefined, invoiceStartFrom: undefined,
    currentInvoiceCounter: undefined, defaultCurrency: undefined, timezone: undefined,
    roundOffEnabled: undefined, backupDir: null, defaultPrintVariant: undefined,
    typographyPreset: undefined, actorUserId: null, ...overrides,
  };
  return [
    p.shopName, p.gstin, p.pan, p.addressLine1, p.addressLine2, p.city, p.state,
    p.stateCode, p.pincode, p.phone, p.email, p.logoPath, p.invoicePrefix,
    p.invoiceStartFrom, p.currentInvoiceCounter, p.defaultCurrency, p.timezone,
    p.roundOffEnabled, p.backupDir, p.defaultPrintVariant, p.typographyPreset,
    p.actorUserId,
  ];
}

test('save_shop_settings: inserts singleton with SP defaults applied', () => {
  const db = freshDb();
  try {
    const [rows] = save_shop_settings(db, baseParams());
    assert.equal(rows.length, 1);
    const s = rows[0];
    assert.equal(s.id, 1);
    assert.equal(s.shopName, 'Shubham Jewellers');
    // COALESCE defaults from the SP.
    assert.equal(s.invoicePrefix, 'INV/');
    assert.equal(s.invoiceStartFrom, 1);
    assert.equal(s.currentInvoiceCounter, 1);
    assert.equal(s.defaultCurrency, 'INR');
    assert.equal(s.timezone, 'Asia/Kolkata');
    assert.equal(s.roundOffEnabled, 1);
    assert.equal(s.defaultPrintVariant, 'a4');
    assert.equal(s.typographyPreset, 'editorial');

    // Exactly one singleton row.
    const count = db.prepare('SELECT COUNT(*) AS c FROM shopsettings').get();
    assert.equal(count.c, 1);
  } finally { cleanup(db); }
});

test('save_shop_settings: second call upserts (updates) the same singleton row', () => {
  const db = freshDb();
  try {
    save_shop_settings(db, baseParams());
    const [rows] = save_shop_settings(db, baseParams({
      shopName: 'Renamed Jewellers', stateCode: '29', invoicePrefix: 'BILL/',
    }));
    const s = rows[0];
    assert.equal(s.id, 1);
    assert.equal(s.shopName, 'Renamed Jewellers', 'updated on conflict');
    assert.equal(s.stateCode, '29');
    assert.equal(s.invoicePrefix, 'BILL/');
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM shopsettings').get().c, 1, 'still one row');
  } finally { cleanup(db); }
});

test('save_shop_settings: update branch mirrors SP quirk (city/addressLine1/email not refreshed)', () => {
  const db = freshDb();
  try {
    save_shop_settings(db, baseParams({ city: 'Pune', addressLine1: '12 MG Road', email: 's@j.com' }));
    const [rows] = save_shop_settings(db, baseParams({ city: 'Mumbai', addressLine1: '99 Link Road', email: 'new@j.com' }));
    const s = rows[0];
    // The MySQL SP's ON DUPLICATE KEY UPDATE omits these columns; faithfully ported.
    assert.equal(s.city, 'Pune', 'city NOT updated on conflict (SP omission)');
    assert.equal(s.addressLine1, '12 MG Road', 'addressLine1 NOT updated on conflict');
    assert.equal(s.email, 's@j.com', 'email NOT updated on conflict');
  } finally { cleanup(db); }
});

test('reset_invoice_counter: sets both counters and returns them', () => {
  const db = freshDb();
  try {
    save_shop_settings(db, baseParams({ currentInvoiceCounter: 50 }));
    const [rows] = reset_invoice_counter(db, [200, null]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].currentInvoiceCounter, 200);
    assert.equal(rows[0].invoiceStartFrom, 200);

    // null newCounter -> COALESCE default 1.
    const [reset1] = reset_invoice_counter(db, [null, null]);
    assert.equal(reset1[0].currentInvoiceCounter, 1);
    assert.equal(reset1[0].invoiceStartFrom, 1);

    const audits = db.prepare(`SELECT COUNT(*) AS c FROM auditlog WHERE action='reset_invoice_counter'`).get();
    assert.equal(audits.c, 2);
  } finally { cleanup(db); }
});

test('get_shop_settings: returns the singleton; empty before any save', () => {
  const db = freshDb();
  try {
    const [empty] = get_shop_settings(db);
    assert.equal(empty.length, 0, 'no row before first save');

    save_shop_settings(db, baseParams());
    const [rows] = get_shop_settings(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 1);
  } finally { cleanup(db); }
});

test('RBAC: employee actor forbidden on save + reset', () => {
  const db = freshDb();
  try {
    const emp = seedUser(db, 'employee');
    assert.throws(() => save_shop_settings(db, baseParams({ actorUserId: emp })),
      /Forbidden: canEditShopSettings/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM shopsettings').get().c, 0);

    // admin allowed, then employee blocked from resetting.
    const admin = seedUser(db, 'admin');
    save_shop_settings(db, baseParams({ actorUserId: admin }));
    assert.throws(() => reset_invoice_counter(db, [5, emp]),
      /Forbidden: canEditShopSettings/);
  } finally { cleanup(db); }
});
