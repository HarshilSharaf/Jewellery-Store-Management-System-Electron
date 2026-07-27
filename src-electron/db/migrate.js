/**
 * Single source of truth for schema migrations, shared by the app
 * (`db/index.js`) and the demo seeder (`db/seed-demo.js`) so they can never
 * drift (an earlier bug: the seeder hand-rolled "apply 001, 002" and silently
 * skipped later migrations, so seeded DBs missed the performance indexes).
 *
 * Electron-free: takes a better-sqlite3 handle and an optional logger, so it
 * runs identically in the main process and in the standalone seeder.
 */

const path = require('path');
const fs = require('fs');

// Ordered, forward-only. Add new steps with strictly increasing versions;
// never edit a shipped step. `baselineSeed: true` marks the step during which
// the caller's seedBaseline(db) callback runs (the default admin user).
const MIGRATIONS = [
  { version: 1, name: 'baseline',           sqlFile: '001_baseline.sql', baselineSeed: true },
  { version: 2, name: 'p2_tables',          sqlFile: '002_p2_tables.sql' },
  { version: 3, name: 'perf_indexes',       sqlFile: '003_perf_indexes.sql' },
  { version: 4, name: 'query_opt_indexes',  sqlFile: '004_query_opt_indexes.sql' },
];

function readSchema(sqlFile) {
  // __dirname resolves inside the asar in production; Electron's patched fs
  // reads packed files transparently.
  return fs.readFileSync(path.join(__dirname, 'schema', sqlFile), 'utf8');
}

/**
 * Applies every migration with version > current user_version, each in its own
 * transaction, bumping user_version on success.
 * @param {import('better-sqlite3').Database} db
 * @param {{ seedBaseline?: (db) => void, log?: (msg: string) => void }} opts
 */
function applyMigrations(db, { seedBaseline, log } = {}) {
  const say = typeof log === 'function' ? log : () => {};
  const current = db.pragma('user_version', { simple: true });
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);

  if (!pending.length) { say(`schema up to date at user_version=${current}`); return; }

  for (const m of pending) {
    const apply = db.transaction(() => {
      if (m.sqlFile) { db.exec(readSchema(m.sqlFile)); }
      if (m.baselineSeed && typeof seedBaseline === 'function') { seedBaseline(db); }
      // version is an integer literal from our own trusted list, never user input.
      db.pragma(`user_version = ${m.version}`);
    });
    apply();
    say(`applied migration v${m.version} (${m.name})`);
  }
}

module.exports = { MIGRATIONS, applyMigrations, readSchema };
