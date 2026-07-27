/**
 * Karigar (goldsmith) procedures — SQLite reimplementation of
 * Scripts/Stored-Procedures/Karigar. Returns arrays of result sets in the SAME
 * order the SP emits its SELECTs; the router appends the mysql2 sentinel.
 *
 * MONEY / WEIGHT: storage is INTEGER paise / milligrams.
 *   karigarjobcards.issuedGrossWeight / receivedGrossWeight / receivedNetWeight /
 *     receivedStoneWeight / wastageGramsActual -> mg (WEIGHT_COLUMNS)
 *   karigarjobcards.makingCharge / settlementAmount                -> paise (MONEY_COLUMNS)
 *   karigarledger.weightGrams -> mg, karigarledger.amount -> paise
 *   wastagePercentAllowed is REAL (a percentage), NOT converted — pass through.
 *   ON READ  rows pass through hydrateRow/hydrateRows (money.js) by column name.
 *   ON WRITE incoming gram/rupee values are toMg()/toPaise() before binding.
 *
 * get_karigar_ledger's rollup result set uses NON-standard aggregate aliases
 * (issuedGrams, makingAccrued, ...) that money.js does not recognise by name, so
 * those are hydrated MANUALLY with fromMg()/fromPaise() (money.js is not edited).
 *
 * ERROR MODEL: the MySQL SPs use SIGNAL/RESIGNAL, i.e. errors PROPAGATE to the
 * caller (they do NOT emit an {message:'Error:...'} row). So the guards here
 * THROW new Error(<exact SP MESSAGE_TEXT>), matching repair.js.
 *
 * Multi-statement writes run inside db.transaction() (better-sqlite3 serialises
 * writes) — the JS analogue of START TRANSACTION ... COMMIT.
 */

const {
  hydrateRow, hydrateRows, toPaise, toMg, fromPaise, fromMg,
} = require('../money');
const { newGuid, writeAudit, resolveId } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** COALESCE(v, 0) for numeric SP defaults. */
function num0(v) { return (v === undefined || v === null || v === '') ? 0 : Number(v); }

/** SELECT id INTO l_karigarId ... AND deletedAt IS NULL (add/update/delete/issue). */
function resolveLiveKarigarId(db, guid) {
  const row = db.prepare(
    'SELECT id FROM karigars WHERE karigarGuid = ? AND deletedAt IS NULL'
  ).get(nz(guid));
  return row ? row.id : null;
}

// =====================================================================
// add_karigar(name, phone, address, remarks, actorUserId)
// =====================================================================
function add_karigar(db, params) {
  const [p_name, p_phone, p_address, p_remarks, p_actorUserId] = params;
  const karigarGuid = newGuid();

  const run = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO karigars (karigarGuid, name, phone, address, remarks)
       VALUES (?, ?, ?, ?, ?)`
    ).run(karigarGuid, nz(p_name), nz(p_phone), nz(p_address), nz(p_remarks));
    const karigarId = info.lastInsertRowid;

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'add_karigar',
      entity: 'karigars',
      entityId: karigarId,
      after: { karigarGuid, name: nz(p_name), phone: nz(p_phone) },
    });
    return { karigarId, karigarGuid };
  });

  return [[run()]];
}

// =====================================================================
// update_karigar(karigarGuid, name, phone, address, remarks, actorUserId)
//   name = COALESCE(p_name, name); phone/address/remarks overwritten directly.
// =====================================================================
function update_karigar(db, params) {
  const [p_karigarGuid, p_name, p_phone, p_address, p_remarks, p_actorUserId] = params;

  const karigarId = resolveLiveKarigarId(db, p_karigarGuid);
  if (karigarId == null) {
    throw new Error('update_karigar: karigar not found');
  }

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE karigars
          SET name    = COALESCE(?, name),
              phone   = ?,
              address = ?,
              remarks = ?
        WHERE id = ?`
    ).run(nz(p_name), nz(p_phone), nz(p_address), nz(p_remarks), karigarId);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'update_karigar',
      entity: 'karigars',
      entityId: karigarId,
      after: { name: nz(p_name), phone: nz(p_phone) },
    });
  });
  run();

  return [[{ karigarId }]];
}

// =====================================================================
// delete_karigar(karigarGuid, actorUserId) — soft delete (deletedAt stamp).
// =====================================================================
function delete_karigar(db, params) {
  const [p_karigarGuid, p_actorUserId] = params;

  const karigarId = resolveLiveKarigarId(db, p_karigarGuid);
  if (karigarId == null) {
    throw new Error('delete_karigar: karigar not found');
  }

  const run = db.transaction(() => {
    db.prepare("UPDATE karigars SET deletedAt = datetime('now') WHERE id = ?")
      .run(karigarId);
    const del = db.prepare('SELECT deletedAt FROM karigars WHERE id = ?')
      .get(karigarId).deletedAt;

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'delete_karigar',
      entity: 'karigars',
      entityId: karigarId,
      after: { deletedAt: del },
    });
  });
  run();

  return [[{ karigarId }]];
}

// =====================================================================
// get_all_karigars(itemsPerPage, pageNumber, searchQuery)
//   SP emits ROWS first, then COUNT. Preserved.
// =====================================================================
function get_all_karigars(db, params) {
  const [p_itemsPerPage, p_pageNumber, p_searchQuery] = params;
  const limit = Math.max(1, Number(p_itemsPerPage) || 20);
  const page = Math.max(1, Number(p_pageNumber) || 1);
  const offset = (page - 1) * limit;
  const search = p_searchQuery == null ? '' : String(p_searchQuery);
  const pattern = `%${search}%`;

  const where =
    `WHERE k.deletedAt IS NULL
       AND (@search = '' OR k.name LIKE @pattern OR k.phone LIKE @pattern)`;

  const binds = { search, pattern, limit, offset };

  const rows = db.prepare(
    `SELECT
        k.id, k.karigarGuid, k.name, k.phone, k.address, k.remarks,
        (SELECT COUNT(*) FROM karigarjobcards j
          WHERE j.karigarId = k.id AND j.deletedAt IS NULL) AS totalJobs,
        (SELECT COUNT(*) FROM karigarjobcards j
          WHERE j.karigarId = k.id AND j.status = 'issued' AND j.deletedAt IS NULL) AS openJobs,
        k.createdAt, k.updatedAt
       FROM karigars k
       ${where}
      ORDER BY k.name ASC
      LIMIT @limit OFFSET @offset`
  ).all(binds);

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords FROM karigars k ${where}`
  ).get(binds);

  return [rows, [count]];
}

// =====================================================================
// issue_karigar_job(karigarGuid, issueDate, issuedGrossWeight, issuedPurityCode,
//                   issuedStones, expectedReturnDate, description, actorUserId)
// =====================================================================
function issue_karigar_job(db, params) {
  const [
    p_karigarGuid, p_issueDate, p_issuedGrossWeight, p_issuedPurityCode,
    p_issuedStones, p_expectedReturnDate, p_description, p_actorUserId,
  ] = params;

  const karigarId = resolveLiveKarigarId(db, p_karigarGuid);
  if (karigarId == null) {
    throw new Error('issue_karigar_job: karigar not found');
  }

  const jobGuid = newGuid();
  const ledgerGuid = newGuid();
  const issuedGrams = num0(p_issuedGrossWeight);

  const run = db.transaction(() => {
    const issueDate = nz(p_issueDate) || db.prepare("SELECT date('now') AS d").get().d;

    const info = db.prepare(
      `INSERT INTO karigarjobcards
         (jobGuid, karigarId, issueDate, expectedReturnDate,
          issuedGrossWeight, issuedPurityCode, issuedStones, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued')`
    ).run(
      jobGuid, karigarId, issueDate, nz(p_expectedReturnDate),
      toMg(issuedGrams), nz(p_issuedPurityCode), nz(p_issuedStones),
      nz(p_description),
    );
    const jobId = info.lastInsertRowid;

    db.prepare(
      `INSERT INTO karigarledger
         (ledgerGuid, karigarId, jobId, entryType, direction,
          weightGrams, amount, txnDate, notes, actorUserId)
       VALUES (?, ?, ?, 'issue', 'debit', ?, 0, ?, ?, ?)`
    ).run(
      ledgerGuid, karigarId, jobId, toMg(issuedGrams), issueDate,
      `Gold issued for job ${jobGuid}`, nz(p_actorUserId),
    );

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'issue_karigar_job',
      entity: 'karigarjobcards',
      entityId: jobId,
      after: { jobGuid, karigarId, issuedGrossWeight: nz(p_issuedGrossWeight) },
    });

    return { jobId, jobGuid };
  });

  return [[run()]];
}

// =====================================================================
// receive_karigar_job(jobGuid, receivedDate, receivedGrossWeight,
//   receivedNetWeight, receivedStoneWeight, wastagePercentAllowed,
//   wastageGramsActual, makingCharge, remarks, actorUserId)
//   Guard: job must be in 'issued'. Extra ledger row when makingCharge > 0.
// =====================================================================
function receive_karigar_job(db, params) {
  const [
    p_jobGuid, p_receivedDate, p_receivedGrossWeight, p_receivedNetWeight,
    p_receivedStoneWeight, p_wastagePercentAllowed, p_wastageGramsActual,
    p_makingCharge, p_remarks, p_actorUserId,
  ] = params;

  const job = db.prepare(
    'SELECT id, karigarId, status FROM karigarjobcards WHERE jobGuid = ? LIMIT 1'
  ).get(nz(p_jobGuid));
  if (!job) {
    throw new Error('receive_karigar_job: job not found');
  }
  if (job.status !== 'issued') {
    throw new Error('receive_karigar_job: job is not in issued state');
  }
  const { id: jobId, karigarId } = job;

  const ledgerGuid = newGuid();
  const makingLedgerGuid = newGuid();
  const makingCharge = num0(p_makingCharge);
  const wastageGrams = num0(p_wastageGramsActual);
  const receivedGrams = num0(p_receivedGrossWeight);

  const run = db.transaction(() => {
    const receivedDate = nz(p_receivedDate) || db.prepare("SELECT date('now') AS d").get().d;

    db.prepare(
      `UPDATE karigarjobcards
          SET receivedDate = ?,
              receivedGrossWeight   = ?,
              receivedNetWeight     = ?,
              receivedStoneWeight   = ?,
              wastagePercentAllowed = ?,
              wastageGramsActual    = ?,
              makingCharge          = ?,
              remarks               = ?,
              status                = 'received'
        WHERE id = ?`
    ).run(
      receivedDate,
      toMg(receivedGrams),
      toMg(num0(p_receivedNetWeight)),
      toMg(num0(p_receivedStoneWeight)),
      num0(p_wastagePercentAllowed), // REAL percent — pass through
      toMg(wastageGrams),
      toPaise(makingCharge),
      nz(p_remarks),
      jobId,
    );

    db.prepare(
      `INSERT INTO karigarledger
         (ledgerGuid, karigarId, jobId, entryType, direction,
          weightGrams, amount, txnDate, notes, actorUserId)
       VALUES (?, ?, ?, 'receive', 'credit', ?, 0, ?, ?, ?)`
    ).run(
      ledgerGuid, karigarId, jobId, toMg(receivedGrams), receivedDate,
      `Job received (wastage ${wastageGrams}g)`, nz(p_actorUserId),
    );

    if (makingCharge > 0) {
      db.prepare(
        `INSERT INTO karigarledger
           (ledgerGuid, karigarId, jobId, entryType, direction,
            weightGrams, amount, txnDate, notes, actorUserId)
         VALUES (?, ?, ?, 'adjustment', 'credit', NULL, ?, ?, 'Making charge accrued', ?)`
      ).run(
        makingLedgerGuid, karigarId, jobId, toPaise(makingCharge),
        receivedDate, nz(p_actorUserId),
      );
    }

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'receive_karigar_job',
      entity: 'karigarjobcards',
      entityId: jobId,
      after: {
        receivedGrossWeight: nz(p_receivedGrossWeight),
        wastageGramsActual: nz(p_wastageGramsActual),
        makingCharge: nz(p_makingCharge),
      },
    });
  });
  run();

  return [[{ jobId }]];
}

// =====================================================================
// settle_karigar_job(jobGuid, settlementAmount, paymentMode, refNumber, actorUserId)
//   Guard: job must be in 'received'.
// =====================================================================
function settle_karigar_job(db, params) {
  const [p_jobGuid, p_settlementAmount, p_paymentMode, p_refNumber, p_actorUserId] = params;

  const job = db.prepare(
    'SELECT id, karigarId, status FROM karigarjobcards WHERE jobGuid = ? LIMIT 1'
  ).get(nz(p_jobGuid));
  if (!job) {
    throw new Error('settle_karigar_job: job not found');
  }
  if (job.status !== 'received') {
    throw new Error('settle_karigar_job: job is not in received state');
  }
  const { id: jobId, karigarId } = job;

  const ledgerGuid = newGuid();
  const settlementAmount = num0(p_settlementAmount);

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE karigarjobcards
          SET settlementAmount      = ?,
              settlementPaymentMode = ?,
              settlementRefNumber   = ?,
              settledAt             = datetime('now'),
              status                = 'settled'
        WHERE id = ?`
    ).run(toPaise(settlementAmount), nz(p_paymentMode), nz(p_refNumber), jobId);

    const txnDate = db.prepare("SELECT date('now') AS d").get().d;
    const refPart = (p_refNumber == null || p_refNumber === '')
      ? '' : ` ref ${p_refNumber}`;
    const notes = `Settlement ${p_paymentMode == null ? 'cash' : p_paymentMode}${refPart}`;

    db.prepare(
      `INSERT INTO karigarledger
         (ledgerGuid, karigarId, jobId, entryType, direction,
          weightGrams, amount, txnDate, notes, actorUserId)
       VALUES (?, ?, ?, 'payment', 'debit', NULL, ?, ?, ?, ?)`
    ).run(ledgerGuid, karigarId, jobId, toPaise(settlementAmount), txnDate, notes, nz(p_actorUserId));

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'settle_karigar_job',
      entity: 'karigarjobcards',
      entityId: jobId,
      after: { settlementAmount: nz(p_settlementAmount), paymentMode: nz(p_paymentMode) },
    });
  });
  run();

  return [[{ jobId }]];
}

// =====================================================================
// get_karigar_job_card_details(jobGuid) — 2 result sets: job, then ledger.
// =====================================================================
function get_karigar_job_card_details(db, params) {
  const [p_jobGuid] = params;
  const jobGuid = nz(p_jobGuid);

  const jobRows = db.prepare(
    `SELECT
        j.id, j.jobGuid, j.karigarId, k.karigarGuid,
        k.name AS karigarName, k.phone AS karigarPhone,
        j.issueDate, j.expectedReturnDate, j.receivedDate,
        j.issuedGrossWeight, j.issuedPurityCode, j.issuedStones,
        j.receivedGrossWeight, j.receivedNetWeight, j.receivedStoneWeight,
        j.wastagePercentAllowed, j.wastageGramsActual, j.makingCharge,
        j.settlementAmount, j.settlementPaymentMode, j.settlementRefNumber,
        j.settledAt, j.productId, p.sku AS productSku, p.productDescription,
        j.description, j.remarks, j.status, j.createdAt, j.updatedAt
       FROM karigarjobcards j
       JOIN karigars k       ON k.id = j.karigarId
       LEFT JOIN products p  ON p.id = j.productId
      WHERE j.jobGuid = ?`
  ).all(jobGuid);

  const ledgerRows = db.prepare(
    `SELECT
        l.id, l.ledgerGuid, l.entryType, l.direction, l.weightGrams, l.amount,
        l.txnDate, l.notes, l.actorUserId, u.userName AS actorUserName, l.createdAt
       FROM karigarledger l
       LEFT JOIN users u ON u.uid = l.actorUserId
      WHERE l.jobId = (SELECT id FROM karigarjobcards WHERE jobGuid = ?)
      ORDER BY l.txnDate ASC, l.id ASC`
  ).all(jobGuid);

  return [hydrateRows(jobRows), hydrateRows(ledgerRows)];
}

// =====================================================================
// get_all_karigar_jobs(itemsPerPage, pageNumber, karigarGuid, statusFilter)
//   SP emits ROWS first, then COUNT. Preserved.
// =====================================================================
function get_all_karigar_jobs(db, params) {
  const [p_itemsPerPage, p_pageNumber, p_karigarGuid, p_statusFilter] = params;
  const limit = Math.max(1, Number(p_itemsPerPage) || 20);
  const page = Math.max(1, Number(p_pageNumber) || 1);
  const offset = (page - 1) * limit;

  let karigarId = null;
  if (p_karigarGuid != null && p_karigarGuid !== '') {
    karigarId = resolveId(db, 'karigars', 'karigarGuid', p_karigarGuid);
  }
  const statusFilter = (p_statusFilter == null || p_statusFilter === '') ? null : p_statusFilter;

  const where =
    `WHERE j.deletedAt IS NULL
       AND (@karigarId IS NULL OR j.karigarId = @karigarId)
       AND (@statusFilter IS NULL OR j.status = @statusFilter)`;

  const binds = { karigarId, statusFilter, limit, offset };

  const rows = db.prepare(
    `SELECT
        j.id, j.jobGuid, j.karigarId, k.karigarGuid, k.name AS karigarName,
        j.issueDate, j.expectedReturnDate, j.receivedDate,
        j.issuedGrossWeight, j.issuedPurityCode, j.receivedGrossWeight,
        j.receivedNetWeight, j.wastageGramsActual, j.makingCharge,
        j.settlementAmount, j.status, j.createdAt
       FROM karigarjobcards j
       JOIN karigars k ON k.id = j.karigarId
       ${where}
      ORDER BY j.issueDate DESC, j.id DESC
      LIMIT @limit OFFSET @offset`
  ).all(binds);

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords FROM karigarjobcards j ${where}`
  ).get(binds);

  return [hydrateRows(rows), [count]];
}

// =====================================================================
// get_karigar_ledger(karigarGuid, dateFrom, dateTo)
//   2 result sets: (1) balance rollup, (2) entry list.
//   Rollup aliases are non-standard, hydrated manually (fromMg/fromPaise).
// =====================================================================
function get_karigar_ledger(db, params) {
  const [p_karigarGuid, p_dateFrom, p_dateTo] = params;

  const karigarId = resolveId(db, 'karigars', 'karigarGuid', nz(p_karigarGuid));
  const from = nz(p_dateFrom)
    || db.prepare("SELECT date('now','-90 days') AS d").get().d;
  const to = nz(p_dateTo) || db.prepare("SELECT date('now') AS d").get().d;

  const binds = { karigarId, from, to };

  // Result set 1: balance rollup (sums in mg/paise -> hydrate manually).
  const rollup = db.prepare(
    `SELECT
        k.id AS karigarId, k.karigarGuid, k.name AS karigarName,
        COALESCE(SUM(CASE WHEN l.entryType = 'issue'   THEN l.weightGrams END), 0) AS issuedGrams,
        COALESCE(SUM(CASE WHEN l.entryType = 'receive' THEN l.weightGrams END), 0) AS receivedGrams,
        COALESCE(SUM(CASE WHEN l.entryType = 'issue'   THEN l.weightGrams END), 0)
          - COALESCE(SUM(CASE WHEN l.entryType = 'receive' THEN l.weightGrams END), 0) AS netMetalOutstandingGrams,
        COALESCE(SUM(CASE WHEN l.entryType = 'adjustment' AND l.direction = 'credit' THEN l.amount END), 0) AS makingAccrued,
        COALESCE(SUM(CASE WHEN l.entryType = 'payment' THEN l.amount END), 0) AS paymentsMade,
        COALESCE(SUM(CASE WHEN l.entryType = 'adjustment' AND l.direction = 'credit' THEN l.amount END), 0)
          - COALESCE(SUM(CASE WHEN l.entryType = 'payment' THEN l.amount END), 0) AS balanceDue
       FROM karigars k
       LEFT JOIN karigarledger l
         ON l.karigarId = k.id AND l.txnDate BETWEEN @from AND @to
      WHERE k.id = @karigarId
      GROUP BY k.id, k.karigarGuid, k.name`
  ).get(binds);

  let rollupOut = null;
  if (rollup) {
    rollupOut = {
      karigarId: rollup.karigarId,
      karigarGuid: rollup.karigarGuid,
      karigarName: rollup.karigarName,
      dateFrom: from,
      dateTo: to,
      issuedGrams: fromMg(rollup.issuedGrams),
      receivedGrams: fromMg(rollup.receivedGrams),
      netMetalOutstandingGrams: fromMg(rollup.netMetalOutstandingGrams),
      makingAccrued: fromPaise(rollup.makingAccrued),
      paymentsMade: fromPaise(rollup.paymentsMade),
      balanceDue: fromPaise(rollup.balanceDue),
    };
  }

  // Result set 2: entry list (weightGrams/amount hydrate by column name).
  const entries = db.prepare(
    `SELECT
        l.id, l.ledgerGuid, l.jobId, j.jobGuid, l.entryType, l.direction,
        l.weightGrams, l.amount, l.txnDate, l.notes, l.actorUserId,
        u.userName AS actorUserName, l.createdAt
       FROM karigarledger l
       LEFT JOIN karigarjobcards j ON j.id = l.jobId
       LEFT JOIN users u           ON u.uid = l.actorUserId
      WHERE l.karigarId = @karigarId
        AND l.txnDate BETWEEN @from AND @to
      ORDER BY l.txnDate ASC, l.id ASC`
  ).all(binds);

  const rollupSet = rollupOut ? [rollupOut] : [];
  return [rollupSet, hydrateRows(entries)];
}

module.exports = {
  add_karigar,
  update_karigar,
  delete_karigar,
  get_all_karigars,
  issue_karigar_job,
  receive_karigar_job,
  settle_karigar_job,
  get_karigar_job_card_details,
  get_all_karigar_jobs,
  get_karigar_ledger,
};
