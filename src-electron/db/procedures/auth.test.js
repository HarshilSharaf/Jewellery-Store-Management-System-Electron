/**
 * Auth proc tests. Run with: node --test src-electron/db/procedures/auth.test.js
 *
 * Uses a temp SQLite DB built from the baseline schema, inserts a user fixture,
 * and calls the proc fns directly (no router, no Electron). Asserts result-set
 * shapes and the permissions role-default logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { loginUser, get_user_permissions, defaultPermissions } = require('./auth');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-auth-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Inserts a user fixture and returns its uid. */
function addUser(db, { userName, email, type, permissions = null, password = 'hash' }) {
  const info = db.prepare(
    `INSERT INTO users (userName, email, password, type, permissions)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userName, email, password, type, permissions);
  return info.lastInsertRowid;
}

test('loginUser: stamps login timestamps and returns the user row', () => {
  const db = freshDb();
  try {
    const uid = addUser(db, { userName: 'asha', email: 'asha@x.com', type: 'admin', password: 'secret' });

    const sets = loginUser(db, ['asha']);
    assert.equal(sets.length, 1, 'one result set');
    assert.equal(sets[0].length, 1, 'one row');

    const row = sets[0][0];
    assert.equal(row.uid, uid);
    assert.equal(row.userName, 'asha');
    assert.equal(row.email, 'asha@x.com');
    assert.equal(row.type, 'admin');
    assert.equal(row.password, 'secret', 'password column returned as-is');
    assert.ok(row.lastLoginAt, 'lastLoginAt stamped');
    assert.ok(row.last_login_date, 'last_login_date stamped');

    // Persisted to the table too.
    const persisted = db.prepare('SELECT lastLoginAt, last_login_date FROM users WHERE uid = ?').get(uid);
    assert.ok(persisted.lastLoginAt && persisted.last_login_date);
  } finally { cleanup(db); }
});

test('loginUser: unknown userName returns no result set', () => {
  const db = freshDb();
  try {
    const sets = loginUser(db, ['nobody']);
    assert.deepEqual(sets, [], 'empty result-set array (SP produced none)');
  } finally { cleanup(db); }
});

test('get_user_permissions: NULL permissions -> role default (admin)', () => {
  const db = freshDb();
  try {
    const uid = addUser(db, { userName: 'admin1', email: 'a1@x.com', type: 'admin' });

    const sets = get_user_permissions(db, [uid]);
    assert.equal(sets.length, 1);
    const row = sets[0][0];

    assert.equal(row.userId, uid);
    assert.equal(row.type, 'admin');
    assert.deepEqual(row.permissions, defaultPermissions('admin'));
    assert.deepEqual(row.defaultPermissions, defaultPermissions('admin'));
    assert.equal(row.permissions.canManageUsers, true);
    assert.equal(row.permissions.canBackup, true);
  } finally { cleanup(db); }
});

test('get_user_permissions: manager default differs from admin', () => {
  const db = freshDb();
  try {
    const uid = addUser(db, { userName: 'mgr', email: 'm@x.com', type: 'manager' });
    const row = get_user_permissions(db, [uid])[0][0];

    assert.equal(row.type, 'manager');
    assert.equal(row.permissions.costsVisible, true);
    assert.equal(row.permissions.canBackup, false);
    assert.equal(row.permissions.canManageUsers, false);
    assert.equal(row.permissions.canForfeitSavingScheme, false);
  } finally { cleanup(db); }
});

test('get_user_permissions: unknown role -> all-false default', () => {
  const db = freshDb();
  try {
    const uid = addUser(db, { userName: 'staff', email: 's@x.com', type: 'staff' });
    const row = get_user_permissions(db, [uid])[0][0];

    assert.equal(row.type, 'staff');
    for (const v of Object.values(row.permissions)) {
      assert.equal(v, false, 'every staff permission is false');
    }
  } finally { cleanup(db); }
});

test('get_user_permissions: stored JSON overrides the role default', () => {
  const db = freshDb();
  try {
    const stored = { costsVisible: true, canBackup: true, custom: 'x' };
    const uid = addUser(db, {
      userName: 'custom', email: 'c@x.com', type: 'staff',
      permissions: JSON.stringify(stored),
    });

    const row = get_user_permissions(db, [uid])[0][0];
    assert.deepEqual(row.permissions, stored, 'stored JSON parsed and returned');
    assert.deepEqual(row.defaultPermissions, defaultPermissions('staff'), 'default still reported');
  } finally { cleanup(db); }
});

test('get_user_permissions: unknown user throws (was SIGNAL 45000)', () => {
  const db = freshDb();
  try {
    assert.throws(() => get_user_permissions(db, [9999]), /user not found/);
  } finally { cleanup(db); }
});
