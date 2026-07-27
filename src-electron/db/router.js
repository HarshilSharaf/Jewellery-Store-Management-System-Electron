/**
 * Routes `call <proc>(...)` statements from the renderer's db:execute channel
 * to the SQLite proc registry, returning results in the SAME envelope mysql2
 * produced for a CALL: [...resultSets, trailingSentinel].
 *
 * Why the sentinel matters: the renderer's DbBridgeService.flatten() (and the
 * Backend prepareResponseData) do `raw.slice(0, -1)` to drop mysql2's trailing
 * OkPacket, then concat the remaining sets. By appending a non-array sentinel
 * here we reproduce that shape exactly, so the flatten layer keeps working
 * unchanged and never drops a real row. (This is the documented
 * silent-data-loss trap from the migration plan.)
 */

const registry = require('./procedures');

// Non-array so flatten()'s concat step ignores it; slice(0,-1) drops it.
const SENTINEL = Object.freeze({ __sqliteOk: true });

const CALL_RE = /^\s*call\s+`?([a-zA-Z0-9_]+)`?\s*\(/i;

function isProcCall(sql) {
  return typeof sql === 'string' && CALL_RE.test(sql);
}

function procName(sql) {
  const m = CALL_RE.exec(sql);
  return m ? m[1] : null;
}

/** True if this proc has a SQLite implementation (else caller uses legacy). */
function isHandled(sql) {
  const name = isProcCall(sql) ? procName(sql) : null;
  return !!(name && registry[name]);
}

/** True if a proc of this exact name has a SQLite implementation. */
function hasProc(name) {
  return !!registry[name];
}

/**
 * Runs a registered proc by NAME (used by the named IPC channels, which know
 * the proc up front and don't send a `call ...` string). Returns the
 * mysql2-shaped envelope, or `undefined` if the proc is not registered.
 *
 * @param {Function} getDb - lazy accessor; only invoked for handled procs.
 */
function runProc(name, params, getDb) {
  const fn = registry[name];
  if (!fn) { return undefined; }
  const db = getDb();
  const sets = fn(db, Array.isArray(params) ? params : []);
  return [...sets, SENTINEL];
}

/**
 * Executes a `call proc(...)` against SQLite if the proc is registered.
 * Returns the mysql2-shaped envelope, or `undefined` if the statement is not
 * a registered proc call (signal to fall back to the legacy mysql2 path).
 *
 * @param {Function} getDb - lazy accessor; only invoked for handled procs.
 */
function tryExecute(sql, params, getDb) {
  if (!isProcCall(sql)) { return undefined; }
  const name = procName(sql);
  return runProc(name, params, getDb);
}

module.exports = { tryExecute, runProc, isProcCall, isHandled, hasProc, procName, SENTINEL };
