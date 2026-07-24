/**
 * SQLite data layer (better-sqlite3) — Phase 0 scaffolding.
 *
 * Owns the single synchronous database handle for the app. Replaces the
 * mysql2 pool in the long run; during Phase 0 it is initialised ALONGSIDE
 * the existing mysql2 pool (non-destructive) so we can prove the native
 * module loads, the schema builds, and packaging works before any business
 * logic is ported.
 *
 * Design notes:
 *   - One handle, opened once from a file in userData. No pool, no async,
 *     no network timeouts.
 *   - WAL journal + NORMAL sync: fast and safe for a single-writer POS.
 *   - foreign_keys=ON is set per connection (SQLite default is OFF) — this
 *     is the single most important correctness pragma; without it every FK
 *     is silently ignored.
 *   - Schema versioning via `PRAGMA user_version`. Forward-only migrations.
 */

const path = require('path');
const fs = require('fs');
const logger = require('electron-log');

let Database = null;      // lazy: better-sqlite3 is native; defer require so a
                          // broken binding surfaces as a clear error, not a
                          // silent app-start crash.
let db = null;

/**
 * Ordered migration steps. Each runs inside its own transaction; on success
 * `user_version` is bumped to `version`. Add new steps with strictly
 * increasing version numbers — never edit a shipped step.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline',
    sqlFile: '001_baseline.sql',
    seed: seedBaseline,
  },
  {
    version: 2,
    name: 'p2_tables',
    sqlFile: '002_p2_tables.sql',
  },
];

function resolveDbPath() {
  if (process.env.ZEUS_DB_PATH && process.env.ZEUS_DB_PATH.length) {
    return process.env.ZEUS_DB_PATH;
  }
  // Required at call time (not module load) so tests can run without Electron.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'jewellery.db');
}

function readSchema(sqlFile) {
  // __dirname resolves inside the asar in production; Electron's patched fs
  // reads packed files transparently, so no extraResources needed for .sql.
  const p = path.join(__dirname, 'schema', sqlFile);
  return fs.readFileSync(p, 'utf8');
}

/**
 * Seed reference/bootstrap rows that can't live in plain SQL — currently just
 * the default admin user, whose password must be bcrypt-hashed at runtime to
 * match the app's `auth:compareHash` semantics.
 *
 * Idempotent: only inserts admin if the users table is empty.
 */
function seedBaseline(database) {
  const { count } = database.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) { return; }

  const bcrypt = require('bcryptjs');
  const DEFAULT_ADMIN_PASSWORD = 'admin'; // TODO(P1): force change on first login
  const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);

  database.prepare(
    `INSERT INTO users (userName, email, password, type, permissions)
     VALUES (?, ?, ?, 'admin', NULL)`
  ).run('admin', 'admin@localhost', hash);

  logger.warn(
    '[db] Seeded default admin user (userName="admin", password="admin"). ' +
    'This must be changed before shipping to a customer.'
  );
}

function runMigrations(database) {
  let current = database.pragma('user_version', { simple: true });
  const pending = MIGRATIONS.filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  if (!pending.length) {
    logger.info(`[db] schema up to date at user_version=${current}`);
    return;
  }

  for (const m of pending) {
    logger.info(`[db] applying migration v${m.version} (${m.name})`);
    const apply = database.transaction(() => {
      if (m.sqlFile) { database.exec(readSchema(m.sqlFile)); }
      if (typeof m.seed === 'function') { m.seed(database); }
      // user_version cannot be parameterised; version is an integer literal
      // from our own trusted list, never user input.
      database.pragma(`user_version = ${m.version}`);
    });
    apply();
    current = m.version;
    logger.info(`[db] migration v${m.version} applied; user_version=${current}`);
  }
}

/**
 * Opens (or creates) the database, applies PRAGMAs, and runs migrations.
 * Safe to call once at app startup. Returns the live handle.
 */
function initDatabase() {
  if (db) { return db; }

  if (!Database) { Database = require('better-sqlite3'); }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  runMigrations(db);

  logger.info(`[db] SQLite ready at ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) { throw new Error('Database not initialised. Call initDatabase() first.'); }
  return db;
}

function closeDatabase() {
  if (db) {
    try { db.close(); } catch (e) { logger.warn('[db] close failed:', e && e.message); }
    db = null;
  }
}

/**
 * Coerces a bind value into something better-sqlite3 accepts. It is stricter
 * than mysql2: it rejects undefined, boolean, and Date. Currency/weight
 * values must already be integers (paise/mg) before reaching here.
 */
function bind(v) {
  if (v === undefined) { return null; }
  if (typeof v === 'boolean') { return v ? 1 : 0; }
  if (v instanceof Date) { return v.toISOString(); }
  return v;
}

/** Maps bind() across a positional parameter array. */
function bindAll(values) {
  return Array.isArray(values) ? values.map(bind) : [];
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  bind,
  bindAll,
  resolveDbPath,
};
