/**
 * Orders procedures (SQLite reimplementation of Scripts/Stored-Procedures/Orders).
 *
 * This is the money path: storage is INTEGER paise / INTEGER milligrams.
 *   - ON READ  every row passes through hydrateRow/hydrateRows (money.js),
 *     which converts money/weight columns (by name) to DECIMAL strings so the
 *     renderer contract (old mysql2 DECIMAL-as-string) is preserved. Nested
 *     JSON children (lineItems, payments, oldGoldReceipts, customerDetails)
 *     are hydrated too — see the risk note in the port report.
 *   - ON WRITE every incoming rupee amount is toPaise() and every gram weight
 *     toMg() before binding. Sums the SP does over stored columns
 *     (record_payment) stay in integer paise.
 *
 * Each proc returns an array of result sets, in the SP's SELECT order; the
 * router appends the mysql2 sentinel. Local helpers are defined at the top and
 * noted in the report (nextInvoiceNumber, tableExists, parseArray, the nested
 * child fetchers).
 */

const { hydrateRow, hydrateRows, toPaise, toMg, fromPaise } = require('../money');
const {
  newGuid, pageBounds, likePattern, writeAudit, getUserType, computeGrowth,
} = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** rupees -> paise, treating null/undefined/'' as 0 (mirrors SP COALESCE(...,0)). */
function paise0(v) { return toPaise(v == null || v === '' ? 0 : v); }
/** grams -> milligrams, treating null/undefined/'' as 0. */
function mg0(v) { return toMg(v == null || v === '' ? 0 : v); }

/** JSON string | array | null -> array. Mirrors JSON_LENGTH / WHILE loops. */
function parseArray(v) {
  if (v == null || v === '') { return []; }
  if (Array.isArray(v)) { return v; }
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

/** Normalises a JSON productId ("null"/""/null/number) to an INTEGER id or null. */
function normProductId(v) {
  if (v == null || v === '' || v === 'null') { return null; }
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** True if a table exists (guards P2-only tables such as savingschemes). */
function tableExists(db, name) {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name);
}

/**
 * Reads shopsettings id=1 and formats the next invoice number
 * (prefix + LPAD(counter,5,'0')). MUST be called inside the write transaction;
 * better-sqlite3 serialises writes so the read+increment is atomic (no FOR UPDATE).
 * Falls back to the SP's defaults ('INV/', 1) when the singleton row is absent.
 */
function nextInvoiceNumber(db) {
  const row = db.prepare(
    'SELECT invoicePrefix, currentInvoiceCounter FROM shopsettings WHERE id = 1'
  ).get();
  const prefix = row && row.invoicePrefix != null ? row.invoicePrefix : 'INV/';
  const counter = row && row.currentInvoiceCounter != null ? row.currentInvoiceCounter : 1;
  return {
    prefix,
    counter,
    hasRow: !!row,
    invoiceNumber: `${prefix}${String(counter).padStart(5, '0')}`,
  };
}

// ---- nested child fetchers (replace JSON_ARRAYAGG / JSON_OBJECT subqueries) --

/** get_all_orders lineItems shape (subset of columns). */
function lineItemsBrief(db, invoiceId) {
  const rows = db.prepare(
    `SELECT li.lineType, li.description, li.productId,
            p.productGuid, p.sku, p.huid,
            li.purityCode, li.netWeight, li.ratePerGram, li.taxableAmount, li.lineTotal,
            m.masterCategoryName  AS masterCategory,
            s.subCategoryName     AS subCategory,
            pc.productCategoryName AS productCategory
       FROM invoicelineitems li
       LEFT JOIN products p          ON li.productId = p.id
       LEFT JOIN mastercategories m  ON p.mid = m.id
       LEFT JOIN subcategories s     ON p.sid = s.id
       LEFT JOIN productcategories pc ON p.pid = pc.id
      WHERE li.invoiceId = ?`
  ).all(invoiceId);
  return rows.length ? hydrateRows(rows) : null; // JSON_ARRAYAGG -> NULL when empty
}

/** get_order_details lineItems shape (full columns). */
function lineItemsFull(db, invoiceId) {
  const rows = db.prepare(
    `SELECT li.id, li.lineType, li.description, li.productId,
            p.productGuid, p.sku, p.huid,
            li.hsnCode, li.purityCode,
            li.grossWeight, li.netWeight, li.stoneWeight, li.ratePerGram,
            li.metalValue, li.makingCharge, li.stoneCharge, li.wastageCharge,
            li.discountAmount, li.taxableAmount, li.cgst, li.sgst, li.igst, li.lineTotal,
            m.masterCategoryName  AS masterCategory,
            s.subCategoryName     AS subCategory,
            pc.productCategoryName AS productCategory
       FROM invoicelineitems li
       LEFT JOIN products p          ON li.productId = p.id
       LEFT JOIN mastercategories m  ON p.mid = m.id
       LEFT JOIN subcategories s     ON p.sid = s.id
       LEFT JOIN productcategories pc ON p.pid = pc.id
      WHERE li.invoiceId = ?`
  ).all(invoiceId);
  return rows.length ? hydrateRows(rows) : null;
}

function paymentsBrief(db, invoiceId) {
  const rows = db.prepare(
    `SELECT amount, paymentType, refNumber, remarks, receivedOn
       FROM payments WHERE invoiceId = ?`
  ).all(invoiceId);
  return rows.length ? hydrateRows(rows) : null;
}

function paymentsFull(db, invoiceId) {
  const rows = db.prepare(
    `SELECT amount, paymentType, refNumber, remarks, receivedOn, reconciledAt
       FROM payments WHERE invoiceId = ?`
  ).all(invoiceId);
  return rows.length ? hydrateRows(rows) : null;
}

function oldGoldReceiptsFor(db, invoiceId) {
  const rows = db.prepare(
    `SELECT receiptGuid, grossWeight, testedPurityCode, testedPurityPercent,
            deductionPercent, ratePerGram, creditAmount, remarks
       FROM oldgoldreceipts WHERE invoiceId = ?`
  ).all(invoiceId);
  return rows.length ? hydrateRows(rows) : null;
}

function customerBrief(db, customerId) {
  const row = db.prepare(
    `SELECT id AS customerId, customerGuid, firstName, lastName, gender, city, phoneNumber
       FROM customers WHERE id = ?`
  ).get(customerId);
  return row ? hydrateRow(row) : null;
}

function customerFull(db, customerId) {
  const row = db.prepare(
    `SELECT id AS customerId, customerGuid, imagePath, firstName, lastName, gender,
            city, state, gstin, pan, phoneNumber, email
       FROM customers WHERE id = ?`
  ).get(customerId);
  return row ? hydrateRow(row) : null;
}

function customerRecent(db, customerId) {
  const row = db.prepare(
    `SELECT id AS customerId, firstName, lastName, gender, city
       FROM customers WHERE id = ?`
  ).get(customerId);
  return row ? hydrateRow(row) : null;
}

// =====================================================================
// save_order — the hot spot.
// =====================================================================
function save_order(db, params) {
  const [
    p_soldToCustomer, p_placeOfSupply, p_hsn, p_rateSnapshot,
    p_subTotalTaxable, p_totalCgst, p_totalSgst, p_totalIgst, p_totalDiscount,
    p_totalMakingCharge, p_totalStoneCharge, p_totalWastageCharge,
    p_oldGoldCreditAmount, p_roundOffAmount, p_grandTotal, p_remarks,
    p_amountPaid, p_paymentMethod, p_paymentRefNumber,
    p_lineItems, p_oldGoldReceipts, p_oldGoldReceiptGuid, p_savingSchemeGuid,
    p_actorUserId,
  ] = params;

  try {
    const run = db.transaction(() => {
      const invoiceGuid = newGuid();
      const grandTotalPaise = paise0(p_grandTotal);
      const amountPaidPaise = toPaise(p_amountPaid); // null when not paid

      // --- linked old-gold receipt (overrides oldGoldCreditAmount) --------
      let effectiveOldGoldCreditPaise = paise0(p_oldGoldCreditAmount);
      let linkedReceiptId = null;
      if (p_oldGoldReceiptGuid != null && p_oldGoldReceiptGuid !== '') {
        const receipt = db.prepare(
          'SELECT id, creditAmount FROM oldgoldreceipts WHERE receiptGuid = ? LIMIT 1'
        ).get(p_oldGoldReceiptGuid);
        if (!receipt) { throw new Error('save_order: old-gold receipt not found'); }
        linkedReceiptId = receipt.id;
        effectiveOldGoldCreditPaise = receipt.creditAmount; // already paise
      }

      // --- saving scheme redemption (P2 table; guarded) -------------------
      let schemeId = null;
      let schemeCorpusPaise = 0;
      let schemeBonus = 0;
      let schemeRedemptionJson = null;
      if (p_savingSchemeGuid != null && p_savingSchemeGuid !== '') {
        if (!tableExists(db, 'savingschemes')) {
          throw new Error('save_order: saving scheme not found');
        }
        const scheme = db.prepare(
          `SELECT id, monthlyAmount, bonusInstallments, totalPaid, status
             FROM savingschemes WHERE schemeGuid = ? LIMIT 1`
        ).get(p_savingSchemeGuid);
        if (!scheme) { throw new Error('save_order: saving scheme not found'); }
        if (scheme.status !== 'active' && scheme.status !== 'matured') {
          throw new Error('save_order: saving scheme is not redeemable');
        }
        schemeId = scheme.id;
        schemeBonus = scheme.bonusInstallments || 0;
        // monthlyAmount / totalPaid stored in paise -> integer paise math.
        schemeCorpusPaise = (scheme.totalPaid || 0) + (scheme.monthlyAmount || 0) * schemeBonus;
        schemeRedemptionJson = JSON.stringify({
          schemeGuid: p_savingSchemeGuid,
          schemeId,
          corpus: Number(fromPaise(schemeCorpusPaise)),
          bonusInstallments: schemeBonus,
        });
      }

      // --- invoice counter (atomic inside the transaction) ----------------
      const { counter, hasRow, invoiceNumber } = nextInvoiceNumber(db);

      const isPaymentDone =
        ((amountPaidPaise || 0) + schemeCorpusPaise) >= grandTotalPaise ? 1 : 0;

      const rateSnapshot = p_rateSnapshot == null ? null
        : (typeof p_rateSnapshot === 'string' ? p_rateSnapshot : JSON.stringify(p_rateSnapshot));

      const info = db.prepare(
        `INSERT INTO invoices
           (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
            subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
            totalMakingCharge, totalStoneCharge, totalWastageCharge,
            oldGoldCreditAmount, savingSchemeRedemption, roundOffAmount, grandTotal,
            isPaymentDone, remarks, soldToCustomer)
         VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?)`
      ).run(
        invoiceGuid, invoiceNumber, nz(p_hsn) || '7113', nz(p_placeOfSupply), rateSnapshot,
        paise0(p_subTotalTaxable), paise0(p_totalCgst), paise0(p_totalSgst),
        paise0(p_totalIgst), paise0(p_totalDiscount),
        paise0(p_totalMakingCharge), paise0(p_totalStoneCharge), paise0(p_totalWastageCharge),
        effectiveOldGoldCreditPaise, schemeRedemptionJson, paise0(p_roundOffAmount), grandTotalPaise,
        isPaymentDone, nz(p_remarks), nz(p_soldToCustomer),
      );
      const invoiceId = info.lastInsertRowid;

      // increment counter (no-op if the singleton row is absent, as in the SP)
      if (hasRow) {
        db.prepare('UPDATE shopsettings SET currentInvoiceCounter = ? WHERE id = 1')
          .run(counter + 1);
      }

      if (linkedReceiptId != null) {
        db.prepare('UPDATE oldgoldreceipts SET invoiceId = ? WHERE id = ?')
          .run(invoiceId, linkedReceiptId);
      }

      // --- payment (only when amountPaid > 0) -----------------------------
      if (amountPaidPaise != null && amountPaidPaise > 0) {
        db.prepare(
          `INSERT INTO payments
             (paymentGuid, invoiceId, amount, paymentType, refNumber, remarks)
           VALUES (?,?,?,?,?,?)`
        ).run(
          newGuid(), invoiceId, amountPaidPaise, nz(p_paymentMethod),
          nz(p_paymentRefNumber), 'Paid while creating order',
        );
      }

      // --- line items -----------------------------------------------------
      const insertLine = db.prepare(
        `INSERT INTO invoicelineitems
           (invoiceId, productId, lineType, description, hsnCode, purityCode,
            grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
            makingCharge, stoneCharge, wastageCharge, discountAmount,
            taxableAmount, cgst, sgst, igst, lineTotal)
         VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?)`
      );
      const markSold = db.prepare('UPDATE products SET isSold = 1 WHERE id = ?');

      for (const item of parseArray(p_lineItems)) {
        const productId = normProductId(item.productId);
        insertLine.run(
          invoiceId, productId,
          item.lineType || 'product', nz(item.description), nz(item.hsnCode), nz(item.purityCode),
          mg0(item.grossWeight), mg0(item.netWeight), mg0(item.stoneWeight),
          paise0(item.ratePerGram), paise0(item.metalValue),
          paise0(item.makingCharge), paise0(item.stoneCharge), paise0(item.wastageCharge),
          paise0(item.discountAmount), paise0(item.taxableAmount),
          paise0(item.cgst), paise0(item.sgst), paise0(item.igst), paise0(item.lineTotal),
        );
        if (productId != null) { markSold.run(productId); }
      }

      // --- ad-hoc old-gold receipts created with the order ----------------
      const insertReceipt = db.prepare(
        `INSERT INTO oldgoldreceipts
           (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
            testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
         VALUES (?,?,?,?,?, ?,?,?,?,?)`
      );
      for (const og of parseArray(p_oldGoldReceipts)) {
        insertReceipt.run(
          newGuid(), invoiceId, nz(p_soldToCustomer),
          mg0(og.grossWeight), nz(og.testedPurityCode),
          og.testedPurityPercent == null ? null : Number(og.testedPurityPercent),
          og.deductionPercent == null ? 0 : Number(og.deductionPercent),
          paise0(og.ratePerGram), paise0(og.creditAmount), nz(og.remarks),
        );
      }

      // --- saving scheme flip --------------------------------------------
      if (schemeId != null) {
        db.prepare(
          `UPDATE savingschemes
              SET status = 'redeemed', redeemedInvoiceId = ?, redeemedAmount = ?,
                  redeemedAt = CURRENT_TIMESTAMP
            WHERE id = ?`
        ).run(invoiceId, schemeCorpusPaise, schemeId);
      }

      writeAudit(db, {
        actorUserId: nz(p_actorUserId),
        action: 'save_order',
        entity: 'invoices',
        entityId: invoiceId,
        after: {
          invoiceNumber,
          grandTotal: nz(p_grandTotal),
          oldGoldReceiptGuid: nz(p_oldGoldReceiptGuid),
          savingSchemeGuid: nz(p_savingSchemeGuid),
        },
      });

      // Matches the SP success SELECT (invoiceId, invoiceGuid, invoiceNumber);
      // message:'Success' added so the renderer's error probe (message startsWith
      // 'Error:') is unambiguous.
      return { invoiceId, invoiceGuid, invoiceNumber, message: 'Success' };
    });

    return [[run()]];
  } catch (e) {
    // Mirrors the SP EXIT HANDLER: ROLLBACK (automatic) + emit an error row.
    return [[{ message: `Error: ${e.message}` }]];
  }
}

// =====================================================================
// record_payment
// =====================================================================
function record_payment(db, params) {
  const [p_orderGuid, p_paymentType, p_refNumber, p_remarks, p_paymentAmount, p_receivedOn] = params;
  try {
    const inv = db.prepare(
      'SELECT id, grandTotal FROM invoices WHERE invoiceGuid = ?'
    ).get(p_orderGuid);
    if (!inv) { return []; } // SP does nothing when invoice not found

    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO payments
           (paymentGuid, amount, paymentType, refNumber, remarks, receivedOn, invoiceId)
         VALUES (?,?,?,?,?, COALESCE(?, CURRENT_TIMESTAMP), ?)`
      ).run(
        newGuid(), toPaise(p_paymentAmount), nz(p_paymentType),
        nz(p_refNumber), nz(p_remarks), nz(p_receivedOn), inv.id,
      );

      const { s } = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoiceId = ?'
      ).get(inv.id);
      if (s >= inv.grandTotal) { // integer paise comparison
        db.prepare('UPDATE invoices SET isPaymentDone = 1 WHERE id = ?').run(inv.id);
      }
    });
    run();
    return [];
  } catch (e) {
    return [[{ message: `Error: ${e.message}` }]];
  }
}

// =====================================================================
// cancel_order — RBAC guard + un-sell + delete lines. SP uses RESIGNAL,
// so failures throw (propagate) rather than returning an error row.
// =====================================================================
function cancel_order(db, params) {
  const [p_orderGuid, p_cancelReason, p_actorUserId] = params;

  if (p_actorUserId != null) {
    const type = getUserType(db, p_actorUserId);
    if (type != null && type === 'employee') {
      throw new Error('Forbidden: canCancelInvoice');
    }
  }

  const inv = db.prepare('SELECT id FROM invoices WHERE invoiceGuid = ?').get(p_orderGuid);
  if (!inv) { return []; }

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE products SET isSold = 0
        WHERE id IN (SELECT productId FROM invoicelineitems
                      WHERE invoiceId = ? AND productId IS NOT NULL)`
    ).run(inv.id);
    db.prepare('DELETE FROM invoicelineitems WHERE invoiceId = ?').run(inv.id);
    db.prepare(
      'UPDATE invoices SET cancelledAt = CURRENT_TIMESTAMP, cancelReason = ? WHERE id = ?'
    ).run(nz(p_cancelReason), inv.id);
    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'cancel_order',
      entity: 'invoices',
      entityId: inv.id,
      after: { cancelReason: nz(p_cancelReason) },
    });
  });
  run();
  return [];
}

// =====================================================================
// get_all_orders — count + page (2 result sets), nested children in JS.
// =====================================================================
function get_all_orders(db, params) {
  const [itemsPerPage, pageNumber, searchQuery] = params;
  const pattern = likePattern(searchQuery);
  const { limit, offset } = pageBounds(itemsPerPage, pageNumber);

  // grandTotal is stored in paise; CAST to text mirrors the SP's LIKE on the
  // numeric column (see risk note — the searchable digits are paise, not rupees).
  const where =
    `WHERE (A.invoiceNumber LIKE @p OR B.firstName LIKE @p OR B.lastName LIKE @p
            OR B.phoneNumber LIKE @p OR CAST(A.grandTotal AS TEXT) LIKE @p)`;

  const count = db.prepare(
    `SELECT COUNT(A.id) AS totalRecords
       FROM invoices A INNER JOIN customers B ON A.soldToCustomer = B.id ${where}`
  ).get({ p: pattern });

  const rows = db.prepare(
    `SELECT A.id, A.invoiceGuid, A.invoiceNumber, A.hsn, A.placeOfSupply,
            A.subTotalTaxable, A.totalCgst, A.totalSgst, A.totalIgst, A.totalDiscount,
            A.totalMakingCharge, A.totalStoneCharge, A.totalWastageCharge,
            A.oldGoldCreditAmount, A.roundOffAmount, A.grandTotal, A.isPaymentDone,
            A.remarks, A.createdAt, A.updatedAt, A.cancelledAt, A.cancelReason,
            A.soldToCustomer
       FROM invoices A INNER JOIN customers B ON A.soldToCustomer = B.id ${where}
      ORDER BY A.createdAt DESC LIMIT @limit OFFSET @offset`
  ).all({ p: pattern, limit, offset });

  if (rows.length === 0) return [[count], []];

  // Batch-load all three child collections to avoid N×3 per-row queries.
  const invoiceIds = rows.map(r => r.id);
  const customerIds = [...new Set(rows.map(r => r.soldToCustomer))];
  const invPh  = invoiceIds.map(() => '?').join(',');
  const custPh = customerIds.map(() => '?').join(',');

  const rawLineItems = db.prepare(
    `SELECT li.invoiceId, li.lineType, li.description, li.productId,
            p.productGuid, p.sku, p.huid,
            li.purityCode, li.netWeight, li.ratePerGram, li.taxableAmount, li.lineTotal,
            m.masterCategoryName   AS masterCategory,
            s.subCategoryName      AS subCategory,
            pc.productCategoryName AS productCategory
       FROM invoicelineitems li
       LEFT JOIN products p           ON li.productId = p.id
       LEFT JOIN mastercategories m   ON p.mid = m.id
       LEFT JOIN subcategories s      ON p.sid = s.id
       LEFT JOIN productcategories pc ON p.pid = pc.id
      WHERE li.invoiceId IN (${invPh})`
  ).all(...invoiceIds);

  const rawPayments = db.prepare(
    `SELECT invoiceId, amount, paymentType, refNumber, remarks, receivedOn
       FROM payments WHERE invoiceId IN (${invPh})`
  ).all(...invoiceIds);

  const rawCustomers = db.prepare(
    `SELECT id AS customerId, customerGuid, firstName, lastName, gender, city, phoneNumber
       FROM customers WHERE id IN (${custPh})`
  ).all(...customerIds);

  const liByInvoice = new Map();
  for (const li of rawLineItems) {
    const { invoiceId, ...rest } = li;
    if (!liByInvoice.has(invoiceId)) liByInvoice.set(invoiceId, []);
    liByInvoice.get(invoiceId).push(rest);
  }

  const pmtByInvoice = new Map();
  for (const pmt of rawPayments) {
    const { invoiceId, ...rest } = pmt;
    if (!pmtByInvoice.has(invoiceId)) pmtByInvoice.set(invoiceId, []);
    pmtByInvoice.get(invoiceId).push(rest);
  }

  const custById = new Map(rawCustomers.map(c => [c.customerId, c]));

  const page = rows.map((raw) => {
    const row = hydrateRow(raw);
    const customerId = raw.soldToCustomer;
    delete row.soldToCustomer;
    const lis  = liByInvoice.get(raw.id)  || [];
    const pmts = pmtByInvoice.get(raw.id) || [];
    row.lineItems      = lis.length  ? hydrateRows(lis)  : null;
    row.payments       = pmts.length ? hydrateRows(pmts) : null;
    row.customerDetails = custById.has(customerId) ? hydrateRow(custById.get(customerId)) : null;
    return row;
  });

  return [[count], page];
}

// =====================================================================
// get_order_details — single invoice with full nested children.
// =====================================================================
function get_order_details(db, params) {
  const [orderGuid] = params;

  const raw = db.prepare(
    `SELECT A.id, A.invoiceGuid, A.invoiceNumber, A.hsn, A.placeOfSupply, A.rateSnapshot,
            A.createdAt AS orderDate, A.isPaymentDone, A.remarks,
            A.subTotalTaxable, A.totalCgst, A.totalSgst, A.totalIgst, A.totalDiscount,
            A.totalMakingCharge, A.totalStoneCharge, A.totalWastageCharge,
            A.oldGoldCreditAmount, A.roundOffAmount, A.grandTotal,
            A.updatedAt, A.cancelledAt, A.cancelReason, A.soldToCustomer
       FROM invoices A WHERE A.invoiceGuid = ?`
  ).get(orderGuid);

  if (!raw) { return [[]]; }

  const row = hydrateRow(raw);
  // mysql2 returns JSON columns pre-parsed; match that for rateSnapshot.
  if (row.rateSnapshot != null && typeof row.rateSnapshot === 'string') {
    try { row.rateSnapshot = JSON.parse(row.rateSnapshot); } catch (_) { /* leave as-is */ }
  }
  const customerId = raw.soldToCustomer;
  delete row.soldToCustomer; // not part of the SP's SELECT projection

  row.lineItems = lineItemsFull(db, raw.id);
  row.customerDetails = customerFull(db, customerId);
  row.payments = paymentsFull(db, raw.id);
  row.oldGoldReceipts = oldGoldReceiptsFor(db, raw.id);

  return [[row]];
}

// =====================================================================
// get_recent_orders
// =====================================================================
function get_recent_orders(db, params) {
  const [p_numberOfOrders] = params;
  const limit = Math.max(1, Number(p_numberOfOrders) || 10);

  const rows = db.prepare(
    `SELECT A.id, A.invoiceGuid, A.invoiceNumber, A.grandTotal, A.isPaymentDone,
            A.createdAt, A.cancelledAt,
            (SELECT COUNT(*) FROM invoicelineitems li WHERE li.invoiceId = A.id) AS totalLineItems,
            A.soldToCustomer
       FROM invoices A
      WHERE A.cancelledAt IS NULL
      ORDER BY A.createdAt DESC
      LIMIT ?`
  ).all(limit);

  const customerIds = [...new Set(rows.map(r => r.soldToCustomer))];
  const rawCustomers = customerIds.length
    ? db.prepare(
        `SELECT id AS customerId, firstName, lastName, gender, city
           FROM customers WHERE id IN (${customerIds.map(() => '?').join(',')})`
      ).all(...customerIds)
    : [];
  const custById = new Map(rawCustomers.map(c => [c.customerId, c]));

  const out = rows.map((raw) => {
    const customerId = raw.soldToCustomer;
    const row = hydrateRow(raw);
    delete row.soldToCustomer;
    const cust = custById.get(customerId);
    row.customerDetails = cust ? hydrateRow(cust) : null;
    return row;
  });

  return [out];
}

// =====================================================================
// get_revenue_of_six_months — single {total, percent_increase} row.
// =====================================================================
function get_revenue_of_six_months(db) {
  const current = db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS v FROM invoices
      WHERE createdAt >= datetime('now', '-1 months') AND cancelledAt IS NULL`
  ).get().v;

  const previous = db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS v FROM invoices
      WHERE createdAt >= datetime('now', '-6 months')
        AND createdAt <  datetime('now', '-1 months')
        AND cancelledAt IS NULL`
  ).get().v;

  const total = db.prepare(
    `SELECT COALESCE(SUM(grandTotal), 0) AS v FROM invoices
      WHERE createdAt >= datetime('now', '-6 months') AND cancelledAt IS NULL`
  ).get().v;

  // 'total' is a SUM alias (not a recognised money column) so hydrateRow won't
  // convert it — do it explicitly. percent_increase stays a plain number.
  return [[{ total: fromPaise(total), percent_increase: computeGrowth(current, previous) }]];
}

// =====================================================================
// get_sales_labour — monthly sales/labour, JSON-array shaped single row.
// =====================================================================
function get_sales_labour(db, params) {
  const [p_timeInterval] = params;
  const months = Math.max(0, Number(p_timeInterval) || 0);

  const rows = db.prepare(
    `SELECT strftime('%Y-%m', createdAt)               AS month_year,
            SUM(grandTotal)                            AS sales,
            SUM(totalMakingCharge + totalWastageCharge) AS labour
       FROM invoices
      WHERE createdAt >= datetime('now', ?) AND cancelledAt IS NULL
      GROUP BY strftime('%Y-%m', createdAt)
      HAVING SUM(grandTotal) > 0
      ORDER BY month_year`
  ).all(`-${months} months`);

  const agg = rows.length
    ? rows.map((r) => ({
      month_year: r.month_year,
      sales: fromPaise(r.sales),
      labour: fromPaise(r.labour),
    }))
    : null; // JSON_ARRAYAGG -> NULL when empty

  return [[{ monthlySalesAndLabour: agg }]];
}

module.exports = {
  save_order,
  record_payment,
  cancel_order,
  get_all_orders,
  get_order_details,
  get_recent_orders,
  get_revenue_of_six_months,
  get_sales_labour,
};
