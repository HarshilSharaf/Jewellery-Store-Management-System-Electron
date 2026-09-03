'use strict';

/**
 * Worker-thread entry point for the performance benchmark.
 * Runs in its own V8 context so the main process (and renderer) stay fully
 * responsive during long-running seeds and queries.
 *
 * workerData: { preset, presetCfg, droppedIndexes, dbPath, seedOpts }
 *   seedOpts.fastPragmas   — journal=OFF · sync=OFF · FK=OFF · exclusive lock · 200 MB cache
 *   seedOpts.deferIndexes  — drop all idx_* before INSERT, rebuild after
 *   seedOpts.analyze       — ANALYZE after indexing
 *
 * postMessage: { type: 'progress'|'result'|'done'|'error', data|message }
 */

const { workerData, parentPort } = require('worker_threads');
const Database = require('better-sqlite3');
const fs       = require('fs');

const { applyMigrations } = require('../db/migrate');
const { generateCustomers, generateProducts, generateInvoices } = require('./data-factory');
const suite = require('./benchmark-suite');

// ---------------------------------------------------------------------------
// DB openers
// ---------------------------------------------------------------------------

/** Aggressive settings safe only for a throwaway, rebuildable sandbox. */
function openSandboxForSeed(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = OFF');       // no crash journal — we don't care about durability
  db.pragma('foreign_keys = OFF');       // skip FK lookups; generated data is already valid
  db.pragma('synchronous = OFF');        // skip fsync entirely
  db.pragma('locking_mode = EXCLUSIVE'); // single writer, no lock negotiation
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -200000');     // ~200 MB page cache
  db.pragma('mmap_size = 268435456');    // 256 MB mmap
  return db;
}

/** Production-equivalent settings — used for the benchmark phase (and seed phase when fastPragmas=false). */
function openSandboxForBench(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -65536');     // 64 MB page cache
  db.pragma('mmap_size = 268435456');   // 256 MB mmap
  return db;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rate(throughput, category, durationMs) {
  if (category === 'aggregate') {
    if (durationMs < 10)  return 'fast';
    if (durationMs < 100) return 'ok';
    return 'slow';
  }
  if (category === 'write') {
    if (throughput > 5000) return 'fast';
    if (throughput > 500)  return 'ok';
    return 'slow';
  }
  if (throughput > 50000) return 'fast';
  if (throughput > 5000)  return 'ok';
  return 'slow';
}

function makeResult(id, name, category, rowCount, durationMs, droppedIndexes = []) {
  const throughput = durationMs > 0 ? Math.round((rowCount / durationMs) * 1000) : 0;
  return {
    id, name, category, rowCount,
    durationMs:  Math.round(durationMs * 10) / 10,
    throughput,
    rating:      rate(throughput, category, durationMs),
    droppedIndexes,
  };
}

// ---------------------------------------------------------------------------
// Reference + dataset seeding
// ---------------------------------------------------------------------------

function seedReferenceData(db) {
  const insertPurity = db.prepare(
    `INSERT OR IGNORE INTO purities (code, label, metalType, fineness, sortOrder, active)
     VALUES (?, ?, 'gold', ?, ?, 1)`
  );
  db.transaction(() => {
    for (const [code, label, fineness, sortOrder] of [
      ['24K', '24 Karat', 9990, 1], ['22K', '22 Karat', 9160, 2],
      ['18K', '18 Karat', 7500, 3], ['14K', '14 Karat', 5850, 4],
    ]) insertPurity.run(code, label, fineness, sortOrder);
  })();

  db.prepare(`INSERT OR IGNORE INTO mastercategories  (id, masterCategoryName)  VALUES (1, 'Gold Jewellery')`).run();
  db.prepare(`INSERT OR IGNORE INTO subcategories     (id, subCategoryName)     VALUES (1, 'Rings')`).run();
  db.prepare(`INSERT OR IGNORE INTO productcategories (id, productCategoryName) VALUES (1, 'Plain Gold')`).run();

  db.prepare(
    `INSERT OR IGNORE INTO taxslabs (hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom)
     VALUES ('7113', 'GST 3%', 1.5, 1.5, 3.0, 1, '2017-07-01')`
  ).run();

  db.prepare(
    `INSERT OR IGNORE INTO shopsettings
       (id, shopName, gstin, addressLine1, city, state, stateCode, pincode, phone,
        invoicePrefix, currentInvoiceCounter, defaultCurrency, timezone)
     VALUES (1, 'Perf Test Shop', '27AABCT3518Q1ZV', '123 Test Street',
             'Mumbai', 'Maharashtra', '27', '400001', '9876543210',
             'PERF/', 1, 'INR', 'Asia/Kolkata')`
  ).run();
}

const MAX_FK_SAMPLE = 50_000;

function seedDataset(db, preset) {
  const { customers: nC, products: nP, invoices: nI, lineItemsPerInvoice, seedChunkSize } = preset;
  const custChunk = seedChunkSize ?? nC;
  const prodChunk = seedChunkSize ?? nP;
  const invChunk  = Math.min(seedChunkSize ?? nI, 25_000);

  const insertCust = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, phoneNumber, city, state, stateCode, gender)
     VALUES (@customerGuid, @firstName, @lastName, @phoneNumber, @city, @state, @stateCode, @gender)`
  );
  const seedCustChunk = db.transaction((rows) => { for (const r of rows) insertCust.run(r); });
  for (let done = 0; done < nC; done += custChunk) {
    seedCustChunk(generateCustomers(Math.min(custChunk, nC - done), 9_000_000_000 + done));
  }

  const customerIds = db.prepare(
    nC > MAX_FK_SAMPLE
      ? `SELECT id FROM customers ORDER BY RANDOM() LIMIT ${MAX_FK_SAMPLE}`
      : `SELECT id FROM customers`
  ).all().map(r => r.id);

  const insertProd = db.prepare(
    `INSERT INTO products
       (productGuid, sku, purityCode, productDescription, grossWeight, netWeight, stoneWeight,
        stoneCharges, makingMode, makingValue, wastagePercent, costPrice, tagPrice,
        hsnCode, mid, sid, pid)
     VALUES (@productGuid, @sku, @purityCode, @productDescription, @grossWeight, @netWeight, @stoneWeight,
             @stoneCharges, @makingMode, @makingValue, @wastagePercent, @costPrice, @tagPrice,
             @hsnCode, @masterCategoryId, @subCategoryId, @productCategoryId)`
  );
  const seedProdChunk = db.transaction((rows) => { for (const r of rows) insertProd.run(r); });
  for (let done = 0; done < nP; done += prodChunk) {
    seedProdChunk(generateProducts(Math.min(prodChunk, nP - done), { masterCategoryId: 1, subCategoryId: 1, productCategoryId: 1 }, done));
  }

  const productIds = db.prepare(
    nP > MAX_FK_SAMPLE
      ? `SELECT id FROM products ORDER BY RANDOM() LIMIT ${MAX_FK_SAMPLE}`
      : `SELECT id FROM products`
  ).all().map(r => r.id);

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
       (invoiceGuid, invoiceNumber, soldToCustomer, grandTotal, isPaymentDone, placeOfSupply, hsn,
        subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount, totalMakingCharge,
        totalStoneCharge, totalWastageCharge, oldGoldCreditAmount, roundOffAmount)
     VALUES (@invoiceGuid, @invoiceNumber, @soldToCustomer, @grandTotal, @isPaymentDone, @placeOfSupply, @hsn,
             @subTotalTaxable, @totalCgst, @totalSgst, @totalIgst, @totalDiscount, @totalMakingCharge,
             @totalStoneCharge, @totalWastageCharge, @oldGoldCreditAmount, @roundOffAmount)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoicelineitems
       (invoiceId, productId, lineType, description, purityCode, hsnCode,
        grossWeight, netWeight, stoneWeight, ratePerGram, metalValue, makingCharge,
        stoneCharge, wastageCharge, discountAmount, taxableAmount, cgst, sgst, igst, lineTotal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPayment = db.prepare(
    `INSERT INTO payments (invoiceId, paymentGuid, amount, paymentType, refNumber, remarks, receivedOn)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const seedInvChunk = db.transaction((rows) => {
    for (const inv of rows) {
      const info = insertInvoice.run(inv);
      const invoiceId = info.lastInsertRowid;
      for (const li of inv.lineItems) {
        insertLine.run(
          invoiceId, li.productId, li.lineType, li.description, li.purityCode, li.hsnCode,
          li.grossWeight, li.netWeight, li.stoneWeight, li.ratePerGram, li.metalValue,
          li.makingCharge, li.stoneCharge, li.wastageCharge, li.discountAmount,
          li.taxableAmount, li.cgst, li.sgst, li.igst, li.lineTotal,
        );
      }
      if (inv.payment) {
        const p = inv.payment;
        insertPayment.run(invoiceId, p.paymentGuid, p.amount, p.paymentType, p.refNumber, p.remarks);
      }
    }
  });

  for (let done = 0; done < nI; done += invChunk) {
    const rows = generateInvoices(Math.min(invChunk, nI - done), { customerIds, productIds, lineItemsPerInvoice }, done);
    seedInvChunk(rows);
  }
}

function cleanup(dbPath) {
  [dbPath, dbPath + '-shm', dbPath + '-wal'].forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { preset: presetKey, presetCfg, droppedIndexes = [], dbPath, seedOpts = {} } = workerData;
  const { fastPragmas = true, deferIndexes = true, analyze = true } = seedOpts;
  const droppedSet = new Set(droppedIndexes);

  const post       = (type, payload) => parentPort.postMessage({ type, ...payload });
  const progress   = (phase, step, message) => post('progress', { data: { phase, step, total: 6, message } });
  const sendResult = (r) => post('result', { data: r });

  let sandboxDb  = null;
  const startAll = Date.now();
  const results  = [];

  try {
    // ── Phase 1: Init ────────────────────────────────────────────────────────
    progress('init', 1, 'Creating sandbox database…');
    sandboxDb = fastPragmas ? openSandboxForSeed(dbPath) : openSandboxForBench(dbPath);
    applyMigrations(sandboxDb, {});
    seedReferenceData(sandboxDb);

    // Capture all performance index DDL before any drops
    const perfIndexes = sandboxDb.prepare(
      `SELECT name, sql FROM sqlite_master
        WHERE type = 'index' AND name LIKE 'idx_%' AND sql IS NOT NULL
        ORDER BY name`
    ).all();

    if (deferIndexes) {
      // Drop every idx_* now — seeding without index maintenance is dramatically faster
      for (const { name } of perfIndexes) sandboxDb.exec(`DROP INDEX IF EXISTS "${name}"`);
    }

    // ── Phase 2: Seed ────────────────────────────────────────────────────────
    progress('seed', 2, `Seeding dataset — ${presetCfg.label}…`);

    const seedStart = process.hrtime.bigint();
    seedDataset(sandboxDb, presetCfg);
    const seedMs = Number(process.hrtime.bigint() - seedStart) / 1e6;

    const w3 = makeResult('W3', 'Bulk seed (transactional INSERTs)', 'write',
      presetCfg.customers + presetCfg.products + presetCfg.invoices * (1 + presetCfg.lineItemsPerInvoice + 1),
      seedMs, droppedIndexes,
    );
    results.push(w3); sendResult(w3);

    // If fast PRAGMAs were used, reopen with production settings for realistic benchmarks
    if (fastPragmas) {
      sandboxDb.close();
      sandboxDb = null;
      sandboxDb = openSandboxForBench(dbPath);
    }

    // ── Phase 3: Index setup ─────────────────────────────────────────────────
    const idxMsg = [
      deferIndexes && 'rebuilding indexes',
      analyze      && 'ANALYZE',
    ].filter(Boolean).join(' + ') || 'applying index config';
    progress('indexes', 3, `${idxMsg[0].toUpperCase()}${idxMsg.slice(1)}…`);

    if (deferIndexes) {
      // Recreate only the indexes the user kept enabled — skip the dropped ones entirely
      for (const { name, sql } of perfIndexes) {
        if (!droppedSet.has(name)) sandboxDb.exec(sql);
      }
    } else {
      // Indexes were maintained live during seed — just drop the user-selected ones now
      for (const name of droppedIndexes) sandboxDb.exec(`DROP INDEX IF EXISTS "${name}"`);
    }

    if (analyze) sandboxDb.exec('ANALYZE');

    // Load ctx IDs for R4a/R4b after the bench connection is open
    const ctx = {
      customerIds: sandboxDb.prepare('SELECT id FROM customers ORDER BY RANDOM() LIMIT 50000').all().map(r => r.id),
      productIds:  sandboxDb.prepare('SELECT id FROM products  ORDER BY RANDOM() LIMIT 50000').all().map(r => r.id),
      invoiceIds:  sandboxDb.prepare(
        presetCfg.invoices > MAX_FK_SAMPLE
          ? 'SELECT id FROM invoices ORDER BY RANDOM() LIMIT 50000'
          : 'SELECT id FROM invoices'
      ).all().map(r => r.id),
    };

    // ── Phase 4: Write benchmarks ────────────────────────────────────────────
    progress('write', 4, 'Running write benchmarks (W1, W2)…');

    for (const [id, name, fn] of [
      ['W1', 'Individual INSERTs — no transaction', () => suite.runW1(sandboxDb)],
      ['W2', 'INSERTs inside single transaction',   () => suite.runW2(sandboxDb)],
    ]) {
      const raw = fn();
      const r   = makeResult(id, name, 'write', raw.rowCount, raw.durationMs, droppedIndexes);
      results.push(r); sendResult(r);
    }

    // ── Phase 5: Read benchmarks ─────────────────────────────────────────────
    progress('read', 5, 'Running read benchmarks (R1 – R5)…');

    for (const [id, name, category, fn] of [
      ['R1',  'Inventory list scan (covering index)',             'read',      () => suite.runR1(sandboxDb)],
      ['R2',  'Paginated products (10 pages × 20)',               'read',      () => suite.runR2(sandboxDb)],
      ['R3',  'Customer LIKE search',                             'read',      () => suite.runR3(sandboxDb)],
      ['R4a', 'Orders list — naive N+1 (151 queries / 50 rows)', 'read',      () => suite.runR4a(sandboxDb, ctx)],
      ['R4b', 'Orders list — batch (3 queries / 50 rows)',        'read',      () => suite.runR4b(sandboxDb, ctx)],
      ['R5',  'Dashboard aggregates',                             'aggregate', () => suite.runR5(sandboxDb)],
    ]) {
      const raw = fn();
      const r   = makeResult(id, name, category, raw.rowCount, raw.durationMs, droppedIndexes);
      results.push(r); sendResult(r);
    }

    // ── Phase 6: Cleanup ─────────────────────────────────────────────────────
    progress('cleanup', 6, 'Cleaning up sandbox…');
    sandboxDb.close();
    sandboxDb = null;
    cleanup(dbPath);

    post('done', {
      data: {
        completedAt:     new Date().toISOString(),
        preset:          presetKey,
        droppedIndexes,
        seedOpts:        { fastPragmas, deferIndexes, analyze },
        results,
        totalDurationMs: Date.now() - startAll,
      },
    });

  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message || String(err) });
  } finally {
    if (sandboxDb) { try { sandboxDb.close(); } catch (_) {} }
    cleanup(dbPath);
  }
}

main();
