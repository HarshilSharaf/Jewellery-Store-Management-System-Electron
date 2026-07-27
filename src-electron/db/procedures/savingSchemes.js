/**
 * Saving-scheme procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/SavingSchemes). Returns arrays of result sets in
 * the SAME order the SP emits its SELECTs; the router appends the mysql2
 * sentinel.
 *
 * MONEY: storage is INTEGER paise.
 *   savingschemes.monthlyAmount / totalPaid / redeemedAmount -> paise
 *   savingschemeinstallments.amount                          -> paise
 *   ON READ  every row passes through hydrateRow/hydrateRows (money.js) which
 *            converts the money columns back to the renderer's DECIMAL-string
 *            contract. Computed aliases that are NOT recognised money column
 *            names (expectedTotalContribution, bonusAmount, projectedCorpus,
 *            redeemedAmount return-alias in redeem) are converted explicitly
 *            with fromPaise() since money.js is not edited per the task rules.
 *   ON WRITE incoming rupee amounts are toPaise() before binding; sums the SP
 *            does over stored columns (totalPaid += amount, corpus math) stay
 *            in integer paise.
 *
 * ERROR MODEL: the MySQL SPs use SIGNAL/RESIGNAL, i.e. errors PROPAGATE to the
 * caller (they do NOT emit an {message:'Error:...'} row the way save_order's
 * EXIT HANDLER does). So the guards here THROW new Error(<exact SP MESSAGE_TEXT>),
 * matching cancel_order / delete_customer / the repair procs.
 *
 * IDIOMS: UUID()->newGuid(); CURDATE()->date('now'); DATE_ADD(d, INTERVAL n
 * MONTH)->date(d,'+n months'); YEAR()/MONTH() month-dedupe->strftime('%Y-%m');
 * next installmentNumber via MAX(installmentNumber)+1 inside the txn;
 * JSON_OBJECT audit->writeAudit; SELECT..INTO->resolveId/.get.
 */

const { hydrateRow, hydrateRows, toPaise, fromPaise } = require('../money');
const { newGuid, pageBounds, likePattern, writeAudit, resolveId, getUserType } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

// CONCAT(firstName, ' ', lastName) — COALESCE guards NULL lastName so search
// and display never collapse the whole name to NULL (SQLite || is NULL-poison).
const CUSTOMER_NAME_EXPR =
  "TRIM(COALESCE(c.firstName, '') || ' ' || COALESCE(c.lastName, ''))";

// =====================================================================
// enroll_saving_scheme
//   IN (p_customerGuid, p_planName, p_monthlyAmount, p_tenureMonths,
//       p_bonusInstallments, p_actorUserId)
// =====================================================================
function enroll_saving_scheme(db, params) {
  const [p_customerGuid, p_planName, p_monthlyAmount, p_tenureMonths, p_bonusInstallments, p_actorUserId] = params;

  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));
  if (customerId == null) {
    throw new Error('enroll_saving_scheme: customer not found');
  }

  const tenure = p_tenureMonths == null ? 11 : Number(p_tenureMonths);
  const bonus = p_bonusInstallments == null ? 1 : Number(p_bonusInstallments);
  const schemeGuid = newGuid();

  // CURDATE() / DATE_ADD(startDate, INTERVAL tenure MONTH)
  const dates = db.prepare(
    "SELECT date('now') AS startDate, date('now', ? ) AS maturityDate"
  ).get(`+${tenure} months`);
  const startDate = dates.startDate;
  const maturityDate = dates.maturityDate;

  const run = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO savingschemes
         (schemeGuid, customerId, planName, monthlyAmount, tenureMonths,
          bonusInstallments, startDate, expectedMaturityDate, totalPaid, status)
       VALUES (?,?,?,?,?, ?,?,?, 0, 'active')`
    ).run(
      schemeGuid, customerId, nz(p_planName), toPaise(p_monthlyAmount), tenure,
      bonus, startDate, maturityDate,
    );
    const schemeId = info.lastInsertRowid;

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'enroll_saving_scheme',
      entity: 'savingschemes',
      entityId: schemeId,
      after: {
        schemeGuid,
        planName: nz(p_planName),
        monthlyAmount: nz(p_monthlyAmount), // rupees, mirrors SP JSON_OBJECT
        tenureMonths: tenure,
      },
    });

    return { schemeId, schemeGuid, startDate, expectedMaturityDate: maturityDate };
  });

  return [[run()]];
}

// =====================================================================
// record_scheme_installment
//   IN (p_schemeGuid, p_amount, p_paymentMode, p_refNumber, p_receiptDate,
//       p_actorUserId, p_allowMultipleThisMonth)
// =====================================================================
function record_scheme_installment(db, params) {
  const [
    p_schemeGuid, p_amount, p_paymentMode, p_refNumber, p_receiptDate,
    p_actorUserId, p_allowMultipleThisMonth,
  ] = params;

  const scheme = db.prepare(
    'SELECT id, tenureMonths, status FROM savingschemes WHERE schemeGuid = ? LIMIT 1'
  ).get(nz(p_schemeGuid));
  if (!scheme) { throw new Error('record_scheme_installment: scheme not found'); }
  if (scheme.status !== 'active') {
    throw new Error('record_scheme_installment: scheme is not active');
  }
  const schemeId = scheme.id;
  const tenureMonths = scheme.tenureMonths;

  // COALESCE(p_receiptDate, CURDATE())
  const receipt = (p_receiptDate == null || p_receiptDate === '')
    ? db.prepare("SELECT date('now') AS d").get().d
    : p_receiptDate;

  const installmentCount = db.prepare(
    'SELECT COUNT(*) AS c FROM savingschemeinstallments WHERE schemeId = ?'
  ).get(schemeId).c;
  if (installmentCount >= tenureMonths) {
    throw new Error('record_scheme_installment: tenure already fulfilled');
  }

  // "already paid this month" dedupe via strftime('%Y-%m', ...) — unless bypassed.
  const allowMultiple = p_allowMultipleThisMonth === 1 || p_allowMultipleThisMonth === true
    || p_allowMultipleThisMonth === '1';
  if (!allowMultiple) {
    const thisMonth = db.prepare(
      `SELECT COUNT(*) AS c FROM savingschemeinstallments
        WHERE schemeId = ? AND strftime('%Y-%m', receiptDate) = strftime('%Y-%m', ?)`
    ).get(schemeId, receipt).c;
    if (thisMonth > 0) {
      throw new Error('record_scheme_installment: installment already recorded this month');
    }
  }

  const installmentGuid = newGuid();

  const run = db.transaction(() => {
    // next installmentNumber via MAX+1 inside the txn (serialised writes -> atomic)
    const nextInstallmentNumber = db.prepare(
      'SELECT COALESCE(MAX(installmentNumber), 0) + 1 AS n FROM savingschemeinstallments WHERE schemeId = ?'
    ).get(schemeId).n;

    db.prepare(
      `INSERT INTO savingschemeinstallments
         (installmentGuid, schemeId, installmentNumber, amount, paymentMode,
          refNumber, receiptDate, actorUserId)
       VALUES (?,?,?,?,?, ?,?,?)`
    ).run(
      installmentGuid, schemeId, nextInstallmentNumber, toPaise(p_amount),
      nz(p_paymentMode) || 'cash', nz(p_refNumber), receipt, nz(p_actorUserId),
    );

    // totalPaid += amount (integer paise); flip to matured when tenure reached.
    const newStatus = nextInstallmentNumber >= tenureMonths ? 'matured' : 'active';
    db.prepare(
      'UPDATE savingschemes SET totalPaid = totalPaid + ?, status = ? WHERE id = ?'
    ).run(toPaise(p_amount), newStatus, schemeId);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'record_scheme_installment',
      entity: 'savingschemes',
      entityId: schemeId,
      after: {
        installmentNumber: nextInstallmentNumber,
        amount: nz(p_amount), // rupees, mirrors SP JSON_OBJECT
        paymentMode: nz(p_paymentMode),
      },
    });

    const updated = db.prepare(
      'SELECT totalPaid, status FROM savingschemes WHERE id = ?'
    ).get(schemeId);

    // totalPaid is a recognised money column -> hydrate to a rupee string.
    return hydrateRow({
      installmentGuid,
      installmentNumber: nextInstallmentNumber,
      totalPaid: updated.totalPaid,
      status: updated.status,
    });
  });

  return [[run()]];
}

// =====================================================================
// redeem_saving_scheme
//   IN (p_schemeGuid, p_invoiceGuid, p_actorUserId)
//   corpus = totalPaid + monthlyAmount * bonusInstallments  (all paise)
// =====================================================================
function redeem_saving_scheme(db, params) {
  const [p_schemeGuid, p_invoiceGuid, p_actorUserId] = params;

  const scheme = db.prepare(
    `SELECT id, monthlyAmount, bonusInstallments, totalPaid, status
       FROM savingschemes WHERE schemeGuid = ? LIMIT 1`
  ).get(nz(p_schemeGuid));
  if (!scheme) { throw new Error('redeem_saving_scheme: scheme not found'); }
  if (scheme.status !== 'active' && scheme.status !== 'matured') {
    throw new Error('redeem_saving_scheme: scheme is not redeemable');
  }

  let invoiceId = null;
  if (p_invoiceGuid != null && p_invoiceGuid !== '') {
    const inv = db.prepare('SELECT id FROM invoices WHERE invoiceGuid = ? LIMIT 1').get(p_invoiceGuid);
    if (!inv) { throw new Error('redeem_saving_scheme: invoice not found'); }
    invoiceId = inv.id;
  }

  // integer paise math (monthlyAmount / totalPaid are stored in paise).
  const corpusPaise = (scheme.totalPaid || 0) + (scheme.monthlyAmount || 0) * (scheme.bonusInstallments || 0);

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE savingschemes
          SET status = 'redeemed', redeemedInvoiceId = ?, redeemedAmount = ?,
              redeemedAt = datetime('now')
        WHERE id = ?`
    ).run(invoiceId, corpusPaise, scheme.id);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'redeem_saving_scheme',
      entity: 'savingschemes',
      entityId: scheme.id,
      after: {
        invoiceId,
        corpus: Number(fromPaise(corpusPaise)), // rupees, mirrors SP JSON_OBJECT
      },
    });

    // redeemedAmount is a recognised money column -> hydrate to a rupee string.
    return hydrateRow({ schemeId: scheme.id, redeemedAmount: corpusPaise, invoiceId });
  });

  return [[run()]];
}

// =====================================================================
// forfeit_saving_scheme
//   IN (p_schemeGuid, p_reason, p_actorUserId)
//   RBAC: a non-admin actor is forbidden (SP SIGNALs; null actor allowed).
// =====================================================================
function forfeit_saving_scheme(db, params) {
  const [p_schemeGuid, p_reason, p_actorUserId] = params;

  if (p_actorUserId != null) {
    const type = getUserType(db, p_actorUserId);
    if (type != null && type !== 'admin') {
      throw new Error('Forbidden: canForfeitSavingScheme');
    }
  }

  const scheme = db.prepare(
    'SELECT id, status FROM savingschemes WHERE schemeGuid = ? LIMIT 1'
  ).get(nz(p_schemeGuid));
  if (!scheme) { throw new Error('forfeit_saving_scheme: scheme not found'); }
  if (scheme.status === 'redeemed') {
    throw new Error('forfeit_saving_scheme: scheme already redeemed');
  }

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE savingschemes
          SET status = 'forfeited', forfeitedAt = datetime('now'), forfeitReason = ?
        WHERE id = ?`
    ).run(nz(p_reason), scheme.id);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'forfeit_saving_scheme',
      entity: 'savingschemes',
      entityId: scheme.id,
      after: { reason: nz(p_reason) },
    });
  });
  run();

  return [[{ schemeId: scheme.id, status: 'forfeited' }]];
}

// =====================================================================
// get_all_saving_schemes
//   IN (p_itemsPerPage, p_pageNumber, p_statusFilter, p_searchQuery)
//   SP SELECT order: ROWS first, then COUNT.
// =====================================================================
function get_all_saving_schemes(db, params) {
  const [p_itemsPerPage, p_pageNumber, p_statusFilter, p_searchQuery] = params;
  const { limit, offset } = pageBounds(p_itemsPerPage, p_pageNumber);
  const search = (p_searchQuery == null || p_searchQuery === '') ? null : likePattern(p_searchQuery);

  const binds = { status: nz(p_statusFilter), search, limit, offset };

  const where =
    `WHERE s.deletedAt IS NULL
       AND (@status IS NULL OR @status = '' OR s.status = @status)
       AND (@search IS NULL OR ${CUSTOMER_NAME_EXPR} LIKE @search
                            OR c.phoneNumber LIKE @search
                            OR s.planName    LIKE @search)`;

  const rows = db.prepare(
    `SELECT s.id, s.schemeGuid, s.customerId, c.customerGuid,
            ${CUSTOMER_NAME_EXPR} AS customerName, c.phoneNumber,
            s.planName, s.monthlyAmount, s.tenureMonths, s.bonusInstallments,
            s.startDate, s.expectedMaturityDate, s.totalPaid, s.status, s.redeemedAt,
            (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
            s.createdAt
       FROM savingschemes s
       JOIN customers c ON c.id = s.customerId
       ${where}
      ORDER BY s.createdAt DESC
      LIMIT @limit OFFSET @offset`
  ).all(binds);

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords
       FROM savingschemes s
       JOIN customers c ON c.id = s.customerId
       ${where}`
  ).get(binds);

  return [hydrateRows(rows), [count]];
}

// =====================================================================
// get_saving_scheme_details
//   IN (p_schemeGuid)
//   Two SELECTs: [scheme (0/1 row with computed cols)], [installments].
// =====================================================================
function get_saving_scheme_details(db, params) {
  const [p_schemeGuid] = params;
  const guid = nz(p_schemeGuid);

  const raw = db.prepare(
    `SELECT s.id, s.schemeGuid, s.customerId, c.customerGuid,
            ${CUSTOMER_NAME_EXPR} AS customerName, c.phoneNumber,
            s.planName, s.monthlyAmount, s.tenureMonths, s.bonusInstallments,
            s.startDate, s.expectedMaturityDate, s.totalPaid, s.status,
            s.redeemedInvoiceId,
            (SELECT invoiceNumber FROM invoices WHERE id = s.redeemedInvoiceId) AS redeemedInvoiceNumber,
            s.redeemedAmount, s.redeemedAt, s.forfeitedAt, s.forfeitReason,
            (s.monthlyAmount * s.tenureMonths)      AS expectedTotalContribution,
            (s.monthlyAmount * s.bonusInstallments) AS bonusAmount,
            (s.totalPaid + (s.monthlyAmount * s.bonusInstallments)) AS projectedCorpus,
            (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
            (s.tenureMonths - (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id)) AS installmentsRemaining,
            (CASE WHEN (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) >= s.tenureMonths
                  THEN 1 ELSE 0 END) AS isEligibleForRedemption,
            s.createdAt
       FROM savingschemes s
       JOIN customers c ON c.id = s.customerId
      WHERE s.schemeGuid = ?`
  ).get(guid);

  let schemeRow = null;
  if (raw) {
    // recognised money cols (monthlyAmount, totalPaid, redeemedAmount) auto-hydrate;
    // computed paise aliases below are not in MONEY_COLUMNS, convert explicitly.
    schemeRow = hydrateRow(raw);
    schemeRow.expectedTotalContribution = fromPaise(raw.expectedTotalContribution);
    schemeRow.bonusAmount = fromPaise(raw.bonusAmount);
    schemeRow.projectedCorpus = fromPaise(raw.projectedCorpus);
  }

  const installments = db.prepare(
    `SELECT i.id, i.installmentGuid, i.installmentNumber, i.amount, i.paymentMode,
            i.refNumber, i.receiptDate, i.actorUserId, u.userName AS actorUserName,
            i.createdAt
       FROM savingschemeinstallments i
       LEFT JOIN users u ON u.uid = i.actorUserId
      WHERE i.schemeId = (SELECT id FROM savingschemes WHERE schemeGuid = ?)
      ORDER BY i.installmentNumber ASC`
  ).all(guid);

  return [schemeRow ? [schemeRow] : [], hydrateRows(installments)];
}

// =====================================================================
// get_saving_schemes_by_customer
//   IN (p_customerGuid) — single SELECT.
// =====================================================================
function get_saving_schemes_by_customer(db, params) {
  const [p_customerGuid] = params;
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));

  const rows = db.prepare(
    `SELECT s.id, s.schemeGuid, s.customerId, s.planName, s.monthlyAmount,
            s.tenureMonths, s.bonusInstallments, s.startDate, s.expectedMaturityDate,
            s.totalPaid, s.status, s.redeemedInvoiceId,
            (SELECT invoiceNumber FROM invoices WHERE id = s.redeemedInvoiceId) AS redeemedInvoiceNumber,
            s.redeemedAmount, s.redeemedAt, s.forfeitedAt, s.forfeitReason,
            (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
            s.createdAt
       FROM savingschemes s
      WHERE s.customerId = ? AND s.deletedAt IS NULL
      ORDER BY s.createdAt DESC`
  ).all(customerId);

  return [hydrateRows(rows)];
}

module.exports = {
  enroll_saving_scheme,
  record_scheme_installment,
  redeem_saving_scheme,
  forfeit_saving_scheme,
  get_all_saving_schemes,
  get_saving_scheme_details,
  get_saving_schemes_by_customer,
};
