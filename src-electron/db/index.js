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

// Schema migration list + runner live in ./migrate, shared with the demo
// seeder so the two can never drift.
const { applyMigrations } = require('./migrate');

/** Repo-local dev database, anchored to this file (not cwd) so the app and the
 *  seeder always resolve to the same absolute path. Kept in one place. */
const DEV_DB_PATH = path.join(__dirname, '..', '..', 'demo.db');

function resolveDbPath() {
  if (process.env.ZEUS_DB_PATH && process.env.ZEUS_DB_PATH.length) {
    return process.env.ZEUS_DB_PATH;
  }
  // Required at call time (not module load) so tests can run without Electron.
  const { app } = require('electron');
  // Dev (unpackaged): use the repo's demo.db so `npm run seed:demo` +
  // `npm run electron` share one file with no ZEUS_DB_PATH juggling.
  // Packaged/production: the per-user data directory.
  if (!app.isPackaged) {
    return DEV_DB_PATH;
  }
  return path.join(app.getPath('userData'), 'jewellery.db');
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
  // --- PRAGMAs (per-connection unless noted) --------------------------------
  // WAL + NORMAL sync is the standard production baseline: readers never block
  // the single writer, and fsync leaves the commit critical path while staying
  // corruption-safe. The rest are performance tuning appropriate for a small,
  // read-heavy (dashboards/reports) single-shop database.
  db.pragma('journal_mode = WAL');       // persistent; concurrent read/write
  db.pragma('foreign_keys = ON');        // enforce FKs (OFF by default!)
  db.pragma('busy_timeout = 5000');      // wait out brief lock contention
  db.pragma('synchronous = NORMAL');     // safe + fast under WAL
  db.pragma('cache_size = -65536');      // 64 MB page cache (negative = KiB)
  db.pragma('temp_store = MEMORY');      // sorts / GROUP BY temp b-trees in RAM
  db.pragma('mmap_size = 268435456');    // up to 256 MB memory-mapped reads
  db.pragma('journal_size_limit = 67108864'); // cap WAL at 64 MB after checkpoint
  db.pragma('analysis_limit = 400');     // bound the cost of PRAGMA optimize/ANALYZE

  applyMigrations(db, { seedBaseline, log: (m) => logger.info(`[db] ${m}`) });

  // Give the query planner fresh statistics for the indexes below. Cheap thanks
  // to analysis_limit; SQLite recommends running optimize on connection open
  // (and close). See closeDatabase().
  try { db.pragma('optimize'); } catch (e) { logger.warn('[db] optimize failed:', e && e.message); }

  logger.info(`[db] SQLite ready at ${dbPath}`);
  return db;
}

function getDb() {
  if (!db) { throw new Error('Database not initialised. Call initDatabase() first.'); }
  return db;
}

function closeDatabase() {
  if (db) {
    // SQLite recommends `PRAGMA optimize` just before closing a long-lived
    // connection so accumulated query stats are persisted for next launch.
    try { db.pragma('optimize'); } catch (e) { logger.warn('[db] optimize on close failed:', e && e.message); }
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
