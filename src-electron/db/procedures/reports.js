/**
 * Reports procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Reports). Read-only: no transactions, no audit.
 *
 * Each proc returns an array of result sets in the SP's SELECT order; the
 * router appends the mysql2 sentinel. Single-SELECT reports return [rows];
 * get_gstr1_export_rows returns two sets (line detail + HSN summary).
 *
 * Money/weight boundary (see money.js): storage is INTEGER paise / milligrams,
 * and all aggregation stays in integer paise/mg inside SQL. ON READ every row
 * passes through hydrateRow (money.js) so schema-named money/weight columns
 * (e.g. subTotalTaxable, grandTotal) become DECIMAL/gram strings; report
 * ALIASES whose names are not in money.js's sets (e.g. totalSales, taxableValue,
 * cgstAmount, netWeightGrams) are converted explicitly with fromPaise()/fromMg().
 *
 * Default date ranges are computed in JS (UTC, matching SQLite date('now')),
 * mirroring the SPs' COALESCE(p_..., DATE_SUB(CURDATE(), ...)) defaults.
 */

const { hydrateRow, fromPaise, fromMg } = require('../money');
const { resolveId } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** YYYY-MM-DD for "today" in UTC (matches SQLite date('now')). */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD for n days before today in UTC (matches date('now','-N days')). */
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 2-digit zero pad (replaces MySQL LPAD(x,2,'0')). */
function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * Hydrates report rows: hydrateRow handles schema-named money/weight columns,
 * then any aggregate ALIAS columns not in money.js's sets are converted here.
 */
function hydrateReport(rows, { money = [], weight = [] } = {}) {
  return rows.map((r) => {
    const h = hydrateRow(r);
    for (const k of money) { h[k] = fromPaise(r[k]); }
    for (const k of weight) { h[k] = fromMg(r[k]); }
    return h;
  });
}

/**
 * get_day_book(p_dateFrom, p_dateTo)
 * Daily payment tender-type pivot (cash/cheque/upi/card/online) + total +
 * distinct invoice count, LEFT JOINed to each day's taxable value from
 * non-cancelled invoices. Defaults: last 30 days .. today.
 * All money output columns are aggregate ALIASES (cash, total,
 * totalTaxableValue, ...) not in money.js, so each is fromPaise()'d.
 */
function get_day_book(db, params) {
  const [dateFrom, dateTo] = params;
  const from = nz(dateFrom) != null ? dateFrom : daysAgo(30);
  const to = nz(dateTo) != null ? dateTo : today();

  const rows = db.prepare(
    `SELECT
        pays.txDate,
        pays.cash,
        pays.cheque,
        pays.upi,
        pays.card,
        pays.online,
        pays.total,
        pays.invoiceCount,
        COALESCE(inv.totalTaxableValue, 0) AS totalTaxableValue
      FROM (
        SELECT
          date(p.receivedOn) AS txDate,
          COALESCE(SUM(CASE WHEN p.paymentType = 'cash'   THEN p.amount END), 0) AS cash,
          COALESCE(SUM(CASE WHEN p.paymentType = 'cheque' THEN p.amount END), 0) AS cheque,
          COALESCE(SUM(CASE WHEN p.paymentType = 'upi'    THEN p.amount END), 0) AS upi,
          COALESCE(SUM(CASE WHEN p.paymentType = 'card'   THEN p.amount END), 0) AS card,
          COALESCE(SUM(CASE WHEN p.paymentType = 'online' THEN p.amount END), 0) AS online,
          COALESCE(SUM(p.amount), 0) AS total,
          COUNT(DISTINCT p.invoiceId) AS invoiceCount
        FROM payments p
        WHERE date(p.receivedOn) BETWEEN @from AND @to
        GROUP BY date(p.receivedOn)
      ) pays
      LEFT JOIN (
        SELECT date(i.createdAt) AS invDate,
               COALESCE(SUM(i.subTotalTaxable), 0) AS totalTaxableValue
        FROM invoices i
        WHERE date(i.createdAt) BETWEEN @from AND @to
          AND i.cancelledAt IS NULL
        GROUP BY date(i.createdAt)
      ) inv ON inv.invDate = pays.txDate
      ORDER BY pays.txDate ASC`
  ).all({ from, to });

  return [hydrateReport(rows, {
    money: ['cash', 'cheque', 'upi', 'card', 'online', 'total', 'totalTaxableValue'],
  })];
}

/**
 * get_gstr1_export_rows(p_monthYear)  — TWO result sets.
 * Set 1: per-invoice B2B/B2CS detail for the month.
 * Set 2: HSN-wise summary for the month.
 * Period start/end (LAST_DAY) computed in JS; defaults to current month.
 * Tax RATE columns divide paise/paise (a ratio) forced to float (SQLite would
 * otherwise do integer division), ROUNDed in SQL — they stay numbers.
 * Money aliases (taxableValue, cgstAmount, ..., invoiceValue) are fromPaise()'d.
 */
function get_gstr1_export_rows(db, params) {
  const [monthYear] = params;

  let year;
  let month;
  if (monthYear == null || monthYear === '') {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  } else {
    year = parseInt(String(monthYear).substring(0, 4), 10);
    month = parseInt(String(monthYear).substring(5, 7), 10);
  }
  const periodStart = `${year}-${pad2(month)}-01`;
  // Date.UTC(year, month, 0) -> last day of `month` (1-based) => LAST_DAY().
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const moneyCols = ['taxableValue', 'cgstAmount', 'sgstAmount', 'igstAmount', 'invoiceValue'];

  const detail = db.prepare(
    `SELECT
        i.invoiceNumber,
        date(i.createdAt) AS invoiceDate,
        c.gstin           AS customerGstin,
        CASE WHEN c.gstin IS NOT NULL AND c.gstin <> '' THEN 'B2B' ELSE 'B2CS' END AS invoiceType,
        (c.stateCode || '-' || c.state) AS placeOfSupply,
        i.placeOfSupply   AS invoicePlaceOfSupply,
        i.hsn             AS hsnCode,
        i.subTotalTaxable AS taxableValue,
        CASE WHEN i.totalIgst > 0 THEN 0 ELSE ROUND(
          CASE WHEN i.subTotalTaxable = 0 THEN 0
               ELSE (i.totalCgst * 100.0 / i.subTotalTaxable) END, 2) END AS cgstRate,
        CASE WHEN i.totalIgst > 0 THEN 0 ELSE ROUND(
          CASE WHEN i.subTotalTaxable = 0 THEN 0
               ELSE (i.totalSgst * 100.0 / i.subTotalTaxable) END, 2) END AS sgstRate,
        ROUND(CASE WHEN i.subTotalTaxable = 0 THEN 0
                   ELSE (i.totalIgst * 100.0 / i.subTotalTaxable) END, 2) AS igstRate,
        i.totalCgst  AS cgstAmount,
        i.totalSgst  AS sgstAmount,
        i.totalIgst  AS igstAmount,
        i.grandTotal AS invoiceValue
      FROM invoices i
      JOIN customers c ON c.id = i.soldToCustomer
      WHERE date(i.createdAt) BETWEEN @from AND @to
        AND i.cancelledAt IS NULL
      ORDER BY i.createdAt ASC`
  ).all({ from: periodStart, to: periodEnd });

  const summary = db.prepare(
    `SELECT
        i.hsn AS hsnCode,
        COUNT(*) AS invoiceCount,
        COALESCE(SUM(i.subTotalTaxable), 0) AS taxableValue,
        COALESCE(SUM(i.totalCgst), 0)  AS cgstAmount,
        COALESCE(SUM(i.totalSgst), 0)  AS sgstAmount,
        COALESCE(SUM(i.totalIgst), 0)  AS igstAmount,
        COALESCE(SUM(i.grandTotal), 0) AS invoiceValue
      FROM invoices i
      WHERE date(i.createdAt) BETWEEN @from AND @to
        AND i.cancelledAt IS NULL
      GROUP BY i.hsn
      ORDER BY i.hsn ASC`
  ).all({ from: periodStart, to: periodEnd });

  return [
    hydrateReport(detail, { money: moneyCols }),
    hydrateReport(summary, { money: moneyCols }),
  ];
}

/**
 * get_low_stock_by_category(p_thresholdCount)
 * CROSS JOIN of the three category dimensions, LEFT JOINed to in-stock
 * (isSold=0, not deleted) products, filtered to combinations whose in-stock
 * count is below the threshold (default 3). The HAVING/ORDER BY repeat the
 * COUNT() expression (SQLite-safe rather than relying on the alias).
 * totalNetWeight is a SUM(mg) alias -> fromMg().
 */
function get_low_stock_by_category(db, params) {
  const [thresholdCount] = params;
  const threshold = nz(thresholdCount) != null ? Number(thresholdCount) : 3;

  const rows = db.prepare(
    `SELECT
        mc.id                  AS masterCategoryId,
        mc.masterCategoryName  AS masterCategoryName,
        sc.id                  AS subCategoryId,
        sc.subCategoryName     AS subCategoryName,
        pc.id                  AS productCategoryId,
        pc.productCategoryName AS productCategoryName,
        COUNT(pr.id)           AS inStockCount,
        COALESCE(SUM(pr.netWeight), 0) AS totalNetWeight
      FROM mastercategories mc
      CROSS JOIN subcategories sc
      CROSS JOIN productcategories pc
      LEFT JOIN products pr
        ON pr.mid = mc.id AND pr.sid = sc.id AND pr.pid = pc.id
       AND pr.isSold = 0 AND pr.deletedAt IS NULL
      GROUP BY mc.id, mc.masterCategoryName, sc.id, sc.subCategoryName,
               pc.id, pc.productCategoryName
      HAVING COUNT(pr.id) < @threshold
      ORDER BY COUNT(pr.id) ASC, mc.masterCategoryName ASC`
  ).all({ threshold });

  return [hydrateReport(rows, { weight: ['totalNetWeight'] })];
}

/**
 * get_sales_register(p_dateFrom, p_dateTo, p_customerGuid, p_statusFilter)
 * Per-invoice register with computed status + B2B/B2CS classification, optional
 * customer + status filters. Defaults: last 30 days .. today.
 * Schema-named money columns (subTotalTaxable, totalMakingCharge, ...,
 * grandTotal) hydrate automatically; the aliases cgstAmount/sgstAmount/
 * igstAmount/oldGoldCredit are fromPaise()'d explicitly.
 */
function get_sales_register(db, params) {
  const [dateFrom, dateTo, customerGuid, statusFilter] = params;
  const from = nz(dateFrom) != null ? dateFrom : daysAgo(30);
  const to = nz(dateTo) != null ? dateTo : today();

  let customerId = null;
  if (customerGuid != null && customerGuid !== '') {
    customerId = resolveId(db, 'customers', 'customerGuid', customerGuid);
  }
  const status = nz(statusFilter);

  const rows = db.prepare(
    `SELECT
        i.id,
        i.invoiceGuid,
        i.invoiceNumber,
        date(i.createdAt) AS invoiceDate,
        (c.firstName || ' ' || c.lastName) AS customerName,
        c.gstin     AS customerGstin,
        c.pan       AS customerPan,
        c.state     AS customerState,
        c.stateCode AS customerStateCode,
        i.placeOfSupply,
        i.hsn,
        i.subTotalTaxable,
        i.totalCgst AS cgstAmount,
        i.totalSgst AS sgstAmount,
        i.totalIgst AS igstAmount,
        i.totalMakingCharge,
        i.totalStoneCharge,
        i.totalWastageCharge,
        i.totalDiscount,
        i.oldGoldCreditAmount AS oldGoldCredit,
        i.roundOffAmount,
        i.grandTotal,
        CASE
          WHEN i.cancelledAt IS NOT NULL THEN 'cancelled'
          WHEN i.isPaymentDone = 1        THEN 'paid'
          ELSE 'pending'
        END AS status,
        CASE WHEN c.gstin IS NOT NULL AND c.gstin <> '' THEN 'B2B' ELSE 'B2CS' END AS invoiceType
      FROM invoices i
      JOIN customers c ON c.id = i.soldToCustomer
      WHERE date(i.createdAt) BETWEEN @from AND @to
        AND (@cid IS NULL OR i.soldToCustomer = @cid)
        AND (@status IS NULL OR @status = ''
             OR (@status = 'paid'      AND i.cancelledAt IS NULL AND i.isPaymentDone = 1)
             OR (@status = 'pending'   AND i.cancelledAt IS NULL AND i.isPaymentDone = 0)
             OR (@status = 'cancelled' AND i.cancelledAt IS NOT NULL))
      ORDER BY i.createdAt ASC`
  ).all({ from, to, cid: customerId, status });

  return [hydrateReport(rows, {
    money: ['cgstAmount', 'sgstAmount', 'igstAmount', 'oldGoldCredit'],
  })];
}

/**
 * get_stock_summary_by_purity(p_asOfDate)
 * In-stock (isSold=0, not deleted) product roll-up per active purity, counting
 * only products created on/before the as-of date (default today).
 * netWeightGrams/grossWeightGrams are SUM(mg) aliases -> fromMg();
 * totalTagPrice/totalCostPrice are SUM(paise) aliases -> fromPaise().
 */
function get_stock_summary_by_purity(db, params) {
  const [asOfDate] = params;
  const asOf = nz(asOfDate) != null ? asOfDate : today();

  const rows = db.prepare(
    `SELECT
        pu.code      AS purityCode,
        pu.label     AS purityLabel,
        pu.metalType,
        pu.fineness,
        COUNT(pr.id) AS unitCount,
        COALESCE(SUM(pr.netWeight), 0)   AS netWeightGrams,
        COALESCE(SUM(pr.grossWeight), 0) AS grossWeightGrams,
        COALESCE(SUM(pr.tagPrice), 0)    AS totalTagPrice,
        COALESCE(SUM(pr.costPrice), 0)   AS totalCostPrice
      FROM purities pu
      LEFT JOIN products pr
        ON pr.purityCode = pu.code
       AND pr.isSold = 0
       AND pr.deletedAt IS NULL
       AND date(pr.createdAt) <= @asOf
      WHERE pu.active = 1
      GROUP BY pu.code, pu.label, pu.metalType, pu.fineness
      ORDER BY pu.metalType ASC, pu.sortOrder ASC`
  ).all({ asOf });

  return [hydrateReport(rows, {
    money: ['totalTagPrice', 'totalCostPrice'],
    weight: ['netWeightGrams', 'grossWeightGrams'],
  })];
}

module.exports = {
  get_day_book,
  get_gstr1_export_rows,
  get_low_stock_by_category,
  get_sales_register,
  get_stock_summary_by_purity,
};
