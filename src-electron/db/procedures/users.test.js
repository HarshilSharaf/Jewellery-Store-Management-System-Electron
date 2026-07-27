/**
 * Users proc tests. Run with: `node --test src-electron/db/procedures/users.test.js`.
 *
 * Procs are called directly (they are not yet wired into the registry/router),
 * against a temp SQLite DB built from the baseline schema. Covers result-set
 * shapes, the image-name derivation, permissions-as-text passthrough, and the
 * RBAC guards (admin allowed; employee forbidden; self-delete blocked).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const users = require('./users');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', '001_baseline.sql'), 'utf8');

function freshDb() {
  const p = path.join(os.tmpdir(), `jsms-users-test-${process.pid}-${Math.floor(process.hrtime()[1])}.db`);
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

/** Inserts an admin (uid captured) + an employee fixture; returns their uids. */
function seedUsers(db) {
  const admin = db.prepare(
    `INSERT INTO users (userName, email, password, type, permissions)
     VALUES ('admin', 'admin@shop.test', 'hash-a', 'admin', '{"canManageUsers":true}')`
  ).run();
  const emp = db.prepare(
    `INSERT INTO users (userName, email, password, type, permissions)
     VALUES ('emp', 'emp@shop.test', 'hash-e', 'employee', NULL)`
  ).run();
  return { adminId: Number(admin.lastInsertRowid), empId: Number(emp.lastInsertRowid) };
}

test('add_user: admin actor allowed, returns [[{userId}]], audit written', () => {
  const db = freshDb();
  try {
    const { adminId } = seedUsers(db);
    const sets = users.add_user(db, ['newbie', 'new@shop.test', 'hash-n', 'employee', '{"a":1}', adminId]);
    assert.equal(sets.length, 1, 'single result set');
    assert.equal(sets[0].length, 1, 'one row');
    const newId = sets[0][0].userId;
    assert.equal(typeof newId, 'number');

    const row = db.prepare('SELECT userName, type, permissions FROM users WHERE uid = ?').get(newId);
    assert.equal(row.userName, 'newbie');
    assert.equal(row.type, 'employee');
    assert.equal(row.permissions, '{"a":1}', 'permissions stored as raw JSON text');

    const audit = db.prepare("SELECT * FROM auditlog WHERE action = 'add_user'").get();
    assert.ok(audit, 'audit row exists');
    assert.equal(audit.actorUserId, adminId);
    assert.equal(audit.entityId, String(newId));
  } finally { cleanup(db); }
});

test('add_user: null actor bypasses RBAC; null type defaults to employee', () => {
  const db = freshDb();
  try {
    const sets = users.add_user(db, ['boot', 'boot@shop.test', 'h', null, null, null]);
    const newId = sets[0][0].userId;
    const row = db.prepare('SELECT type, permissions FROM users WHERE uid = ?').get(newId);
    assert.equal(row.type, 'employee', 'COALESCE(type, "employee")');
    assert.equal(row.permissions, null);
  } finally { cleanup(db); }
});

test('add_user: employee actor is forbidden', () => {
  const db = freshDb();
  try {
    const { empId } = seedUsers(db);
    assert.throws(
      () => users.add_user(db, ['x', 'x@shop.test', 'h', 'employee', null, empId]),
      /Forbidden: canManageUsers/,
    );
    const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    assert.equal(count, 2, 'insert rolled back / never happened');
  } finally { cleanup(db); }
});

test('delete_user: admin allowed; audit written; no result set', () => {
  const db = freshDb();
  try {
    const { adminId, empId } = seedUsers(db);
    const sets = users.delete_user(db, [empId, adminId]);
    assert.deepEqual(sets, [], 'no result set');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE uid = ?').get(empId).c, 0);
    const audit = db.prepare("SELECT * FROM auditlog WHERE action = 'delete_user'").get();
    assert.equal(audit.entityId, String(empId));
  } finally { cleanup(db); }
});

test('delete_user: employee actor forbidden, self-delete blocked', () => {
  const db = freshDb();
  try {
    const { adminId, empId } = seedUsers(db);
    assert.throws(() => users.delete_user(db, [adminId, empId]), /Forbidden: canManageUsers/);
    assert.throws(() => users.delete_user(db, [adminId, adminId]), /cannot delete self/);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 2, 'nobody deleted');
  } finally { cleanup(db); }
});

test('update_user: COALESCE keeps fields, permissions assigned directly', () => {
  const db = freshDb();
  try {
    const { adminId, empId } = seedUsers(db);
    // Give emp permissions first, then null-clear them while changing only email.
    users.update_user(db, [empId, null, 'emp2@shop.test', null, '{"x":1}', adminId]);
    let row = db.prepare('SELECT userName, email, type, permissions FROM users WHERE uid = ?').get(empId);
    assert.equal(row.userName, 'emp', 'null userName kept via COALESCE');
    assert.equal(row.email, 'emp2@shop.test');
    assert.equal(row.type, 'employee', 'null type kept');
    assert.equal(row.permissions, '{"x":1}');

    users.update_user(db, [empId, null, null, null, null, adminId]);
    row = db.prepare('SELECT permissions FROM users WHERE uid = ?').get(empId);
    assert.equal(row.permissions, null, 'permissions assigned directly (null clears)');
  } finally { cleanup(db); }
});

test('update_user: employee actor forbidden', () => {
  const db = freshDb();
  try {
    const { empId } = seedUsers(db);
    assert.throws(() => users.update_user(db, [empId, 'hack', null, 'admin', null, empId]), /Forbidden/);
  } finally { cleanup(db); }
});

test('update_user_details: no RBAC; password kept when null', () => {
  const db = freshDb();
  try {
    const { empId } = seedUsers(db);
    const sets = users.update_user_details(db, [empId, 'renamed', null, 'renamed@shop.test']);
    assert.deepEqual(sets, []);
    const row = db.prepare('SELECT userName, password, email FROM users WHERE uid = ?').get(empId);
    assert.equal(row.userName, 'renamed');
    assert.equal(row.password, 'hash-e', 'null password preserved (COALESCE)');
    assert.equal(row.email, 'renamed@shop.test');

    users.update_user_details(db, [empId, 'renamed', 'hash-new', 'renamed@shop.test']);
    assert.equal(db.prepare('SELECT password FROM users WHERE uid = ?').get(empId).password, 'hash-new');
  } finally { cleanup(db); }
});

test('get_all_users / get_user_details / get_user_image shapes', () => {
  const db = freshDb();
  try {
    const { adminId } = seedUsers(db);

    const all = users.get_all_users(db);
    assert.equal(all.length, 1, 'single result set');
    assert.equal(all[0].length, 2);
    assert.ok('uid' in all[0][0] && 'permissions' in all[0][0] && 'password' in all[0][0] === false);
    assert.equal(all[0][0].uid, adminId, 'ordered by uid ASC');

    const details = users.get_user_details(db, [adminId]);
    assert.equal(details[0].length, 1);
    assert.equal(details[0][0].password, 'hash-a', 'SELECT * includes password');

    const img = users.get_user_image(db, [adminId]);
    assert.deepEqual(Object.keys(img[0][0]), ['imagePath']);
    assert.equal(img[0][0].imagePath, null);
  } finally { cleanup(db); }
});

test('update_user_image: derives user-<uid>-<file>, returns imagePath+oldFileName', () => {
  const db = freshDb();
  try {
    const { adminId } = seedUsers(db);

    let sets = users.update_user_image(db, [adminId, 'avatar.png']);
    assert.equal(sets[0].length, 1);
    assert.equal(sets[0][0].imagePath, `user-${adminId}-avatar.png`);
    assert.equal(sets[0][0].oldFileName, null, 'no prior image');

    // Second update surfaces the previous filename.
    sets = users.update_user_image(db, [adminId, 'new.jpg']);
    assert.equal(sets[0][0].imagePath, `user-${adminId}-new.jpg`);
    assert.equal(sets[0][0].oldFileName, `user-${adminId}-avatar.png`);
  } finally { cleanup(db); }
});

test('delete_user_image: clears imagePath, returns oldFileName', () => {
  const db = freshDb();
  try {
    const { adminId } = seedUsers(db);
    users.update_user_image(db, [adminId, 'pic.png']);

    const sets = users.delete_user_image(db, [adminId]);
    assert.equal(sets[0][0].oldFileName, `user-${adminId}-pic.png`);
    assert.equal(db.prepare('SELECT imagePath FROM users WHERE uid = ?').get(adminId).imagePath, null);
  } finally { cleanup(db); }
});
