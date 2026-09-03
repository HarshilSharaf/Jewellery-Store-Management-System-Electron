'use strict';

/**
 * Individual benchmark test functions.
 * Each returns { rowCount, durationMs } — the runner computes throughput + rating.
 *
 * Tests operate on the sandbox DB only. Read tests receive a `ctx` object
 * with { customerIds, productIds, invoiceIds } populated during seeding.
 */

const { generateCustomers } = require('./data-factory');
const { hydrateRow, hydrateRows } = require('../db/money');

// ---------------------------------------------------------------------------
// Timing helper
// ---------------------------------------------------------------------------

function ms(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1e6;
}

// ---------------------------------------------------------------------------
// W1 — Individual INSERTs without a transaction
// ---------------------------------------------------------------------------

function runW1(db) {
  const ROWS   = 200;
  // Phone offset 8_100_000_000 avoids clashing with seeded data (9xxx) or W2 (8_200…)
  const data   = generateCustomers(ROWS, 8_100_000_000);
  const stmt   = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, phoneNumber, city, state, stateCode, gender)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const t = process.hrtime.bigint();
  for (const r of data) {
    stmt.run(r.customerGuid, r.firstName, r.lastName, r.phoneNumber, r.city, r.state, r.stateCode, r.gender);
  }
  return { rowCount: ROWS, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// W2 — Same row count inside a single transaction
// ---------------------------------------------------------------------------

function runW2(db) {
  const ROWS = 200;
  const data = generateCustomers(ROWS, 8_200_000_000);
  const stmt = db.prepare(
    `INSERT INTO customers (customerGuid, firstName, lastName, phoneNumber, city, state, stateCode, gender)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAll = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run(r.customerGuid, r.firstName, r.lastName, r.phoneNumber, r.city, r.state, r.stateCode, r.gender);
    }
  });

  const t = process.hrtime.bigint();
  insertAll(data);
  return { rowCount: ROWS, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R1 — Inventory list scan using the covering index
//      idx_products_deletedAt_isSold_createdAt (migration 007)
// ---------------------------------------------------------------------------

function runR1(db) {
  const t    = process.hrtime.bigint();
  const rows = db.prepare(
    `SELECT id, productGuid, sku, purityCode, productDescription,
            grossWeight, netWeight, tagPrice, isSold, createdAt
       FROM products
      WHERE deletedAt IS NULL AND isSold = 0
      ORDER BY createdAt DESC`
  ).all();
  return { rowCount: rows.length, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R2 — Paginated product reads (10 pages × 20 rows)
// ---------------------------------------------------------------------------

function runR2(db) {
  const PAGE_SIZE = 20;
  const PAGES     = 10;
  const stmt      = db.prepare(
    `SELECT id, productGuid, sku, purityCode, grossWeight, netWeight, tagPrice
       FROM products
      WHERE deletedAt IS NULL AND isSold = 0
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?`
  );
  const t = process.hrtime.bigint();
  for (let p = 0; p < PAGES; p++) {
    stmt.all(PAGE_SIZE, p * PAGE_SIZE);
  }
  return { rowCount: PAGE_SIZE * PAGES, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R3 — Customer LIKE search (phone + name)
// ---------------------------------------------------------------------------

function runR3(db) {
  const queries = ['Sharma', 'Patel', '999', 'Amit', 'Mumbai', 'Raj'];
  const stmt    = db.prepare(
    `SELECT id, customerGuid, firstName, lastName, city, phoneNumber
       FROM customers
      WHERE deletedAt IS NULL
        AND (firstName LIKE ? OR lastName LIKE ? OR phoneNumber LIKE ?)
      ORDER BY createdAt DESC
      LIMIT 20`
  );
  let totalRows = 0;
  const t = process.hrtime.bigint();
  for (const q of queries) {
    const pat  = `%${q}%`;
    const rows = stmt.all(pat, pat, pat);
    totalRows += rows.length;
  }
  return { rowCount: totalRows, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R4a — Orders list, NAIVE N+1 pattern (old code path, ~151 queries for 50 rows)
// ---------------------------------------------------------------------------

function runR4a(db, ctx) {
  const invoiceIds = ctx.invoiceIds.slice(0, 50);
  const ph         = invoiceIds.map(() => '?').join(',');

  const orders = db.prepare(
    `SELECT id, invoiceGuid, invoiceNumber, grandTotal, isPaymentDone, createdAt, soldToCustomer
       FROM invoices WHERE id IN (${ph})`
  ).all(...invoiceIds);

  // Prepare reusable statements (mirrors what the old code did inside .map())
  const liStmt   = db.prepare(`SELECT lineType, description, purityCode, netWeight, lineTotal FROM invoicelineitems WHERE invoiceId = ?`);
  const pmtStmt  = db.prepare(`SELECT amount, paymentType FROM payments WHERE invoiceId = ?`);
  const custStmt = db.prepare(`SELECT id, firstName, lastName, city FROM customers WHERE id = ?`);

  const t = process.hrtime.bigint();
  // eslint-disable-next-line no-unused-vars
  const page = orders.map((o) => ({
    ...o,
    lineItems:      liStmt.all(o.id),
    payments:       pmtStmt.all(o.id),
    customerDetails: custStmt.get(o.soldToCustomer),
  }));
  return { rowCount: invoiceIds.length, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R4b — Same orders list, BATCH pattern (current optimized code path)
// ---------------------------------------------------------------------------

function runR4b(db, ctx) {
  const invoiceIds = ctx.invoiceIds.slice(0, 50);
  const ph         = invoiceIds.map(() => '?').join(',');

  const orders = db.prepare(
    `SELECT id, invoiceGuid, invoiceNumber, grandTotal, isPaymentDone, createdAt, soldToCustomer
       FROM invoices WHERE id IN (${ph})`
  ).all(...invoiceIds);

  const customerIds = [...new Set(orders.map(o => o.soldToCustomer))];
  const custPh      = customerIds.map(() => '?').join(',');

  const t = process.hrtime.bigint();

  const allLi = db.prepare(
    `SELECT invoiceId, lineType, description, purityCode, netWeight, lineTotal
       FROM invoicelineitems WHERE invoiceId IN (${ph})`
  ).all(...invoiceIds);

  const allPmt = db.prepare(
    `SELECT invoiceId, amount, paymentType FROM payments WHERE invoiceId IN (${ph})`
  ).all(...invoiceIds);

  const allCust = db.prepare(
    `SELECT id, firstName, lastName, city FROM customers WHERE id IN (${custPh})`
  ).all(...customerIds);

  const liMap   = new Map();
  for (const li of allLi) {
    if (!liMap.has(li.invoiceId)) liMap.set(li.invoiceId, []);
    liMap.get(li.invoiceId).push(li);
  }
  const pmtMap  = new Map();
  for (const p of allPmt) {
    if (!pmtMap.has(p.invoiceId)) pmtMap.set(p.invoiceId, []);
    pmtMap.get(p.invoiceId).push(p);
  }
  const custMap = new Map(allCust.map(c => [c.id, c]));

  // eslint-disable-next-line no-unused-vars
  const page = orders.map(o => ({
    ...o,
    lineItems:       liMap.get(o.id)       || [],
    payments:        pmtMap.get(o.id)      || [],
    customerDetails: custMap.get(o.soldToCustomer) || null,
  }));

  return { rowCount: invoiceIds.length, durationMs: ms(t) };
}

// ---------------------------------------------------------------------------
// R5 — Dashboard aggregates
// ---------------------------------------------------------------------------

function runR5(db) {
  const t = process.hrtime.bigint();

  db.prepare(`SELECT COUNT(*) AS c FROM products WHERE deletedAt IS NULL AND isSold = 0`).get();
  db.prepare(`SELECT COUNT(*) AS c FROM customers WHERE deletedAt IS NULL`).get();
  db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS v FROM invoices
      WHERE cancelledAt IS NULL AND createdAt >= datetime('now', '-1 months')`
  ).get();
  db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS v FROM invoices
      WHERE cancelledAt IS NULL AND createdAt >= datetime('now', '-6 months')`
  ).get();
  db.prepare(
    `SELECT pc.productCategoryName, SUM(p.netWeight) AS tw
       FROM products p
       JOIN productcategories pc ON p.pid = pc.id
      WHERE p.isSold = 1 AND p.deletedAt IS NULL
      GROUP BY p.pid
      ORDER BY tw DESC
      LIMIT 5`
  ).all();

  return { rowCount: 5, durationMs: ms(t) };
}

module.exports = { runW1, runW2, runR1, runR2, runR3, runR4a, runR4b, runR5 };
