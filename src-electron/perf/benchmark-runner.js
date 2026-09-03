'use strict';

/**
 * Lightweight orchestrator for the performance benchmark.
 *
 * All heavy SQLite work runs in benchmark-worker.js (a worker_thread) so the
 * main process — and therefore the renderer + IPC — remain fully responsive
 * even during long-running seeds on the X-Large / XX-Large presets.
 *
 * Flow:
 *   runBenchmarks()  → spawns worker → relays postMessage events to renderer
 *   cancelBenchmarks() → terminates worker + cleans up sandbox DB file
 *   listPerfIndexes()  → queries production DB on the main thread (fast, unchanged)
 */

const { Worker } = require('worker_threads');
const path       = require('path');
const os         = require('os');
const fs         = require('fs');
const crypto     = require('crypto');

// ---------------------------------------------------------------------------
// Preset definitions  (single source of truth — passed to worker via workerData)
// ---------------------------------------------------------------------------

const PRESETS = {
  small:   { label: 'Small   (200 customers / 500 products / 200 invoices)',        customers:         200, products:    500, invoices:     200, lineItemsPerInvoice: 3 },
  medium:  { label: 'Medium  (1 000 customers / 3 000 products / 1 000 invoices)',  customers:       1_000, products:  3_000, invoices:   1_000, lineItemsPerInvoice: 3 },
  large:   { label: 'Large   (3 000 customers / 10 000 products / 3 000 invoices)', customers:       3_000, products: 10_000, invoices:   3_000, lineItemsPerInvoice: 3 },
  xlarge:  { label: 'X-Large (3L customers / 50K products / 1L invoices)',          customers:     300_000, products: 50_000, invoices: 100_000, lineItemsPerInvoice: 2, seedChunkSize:  50_000 },
  xxlarge: { label: 'XX-Large (30L customers / 1L products / 5L invoices)',         customers:   3_000_000, products: 100_000, invoices: 500_000, lineItemsPerInvoice: 1, seedChunkSize: 100_000 },
};

// ---------------------------------------------------------------------------
// Active-run state (one benchmark at a time)
// ---------------------------------------------------------------------------

let activeWorker = null;
let activeDbPath = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawns a worker thread to run the full benchmark lifecycle.
 * Returns synchronously with { started: true } so the IPC handler can reply
 * immediately; progress/result/done/error events are pushed to the renderer.
 */
function runBenchmarks(mainWindow, config) {
  if (activeWorker) return { started: false, reason: 'A benchmark is already running.' };

  const { preset = 'small', droppedIndexes = [], seedOpts = {} } = config;
  const presetCfg = PRESETS[preset] || PRESETS.small;
  const dbPath    = path.join(os.tmpdir(), `jsms-perf-${crypto.randomUUID()}.db`);

  const emit = (channel, data) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
  };

  const worker = new Worker(path.join(__dirname, 'benchmark-worker.js'), {
    workerData: { preset, presetCfg, droppedIndexes, dbPath, seedOpts },
  });

  activeWorker = worker;
  activeDbPath = dbPath;

  const clearActive = () => { activeWorker = null; activeDbPath = null; };

  worker.on('message', (msg) => {
    switch (msg.type) {
      case 'progress': emit('perfTest:progress', msg.data);    break;
      case 'result':   emit('perfTest:result',   msg.data);    break;
      case 'done':     emit('perfTest:done',      msg.data);   clearActive(); break;
      case 'error':    emit('perfTest:error',     msg.message); clearActive(); break;
    }
  });

  worker.on('error', (err) => {
    emit('perfTest:error', err.message || String(err));
    clearActive();
  });

  // Exit with non-zero code means the worker crashed (not a clean terminate)
  worker.on('exit', (code) => {
    if (code !== 0 && activeWorker === worker) {
      emit('perfTest:error', `Benchmark worker exited unexpectedly (code ${code})`);
    }
    clearActive();
  });

  return { started: true };
}

/**
 * Terminates the running worker immediately and cleans up the sandbox DB.
 * worker.terminate() is abrupt — the worker's finally block does NOT run,
 * so we handle file cleanup here in the main thread.
 */
function cancelBenchmarks() {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  if (activeDbPath) {
    [activeDbPath, activeDbPath + '-shm', activeDbPath + '-wal']
      .forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    activeDbPath = null;
  }
}

/**
 * Lists all non-unique idx_* indexes from the production DB.
 * Runs on the main thread against the live DB — fast and safe.
 */
function listPerfIndexes(db) {
  return db.prepare(
    `SELECT name, tbl_name AS table_name
       FROM sqlite_master
      WHERE type = 'index'
        AND name LIKE 'idx_%'
      ORDER BY tbl_name, name`
  ).all();
}

module.exports = { runBenchmarks, cancelBenchmarks, listPerfIndexes };
