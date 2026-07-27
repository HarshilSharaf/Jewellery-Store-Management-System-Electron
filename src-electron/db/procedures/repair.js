/**
 * Repair-ticket procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Repair). Returns arrays of result sets in the
 * SAME order the SP emits its SELECTs; the router appends the mysql2 sentinel.
 *
 * MONEY / WEIGHT: storage is INTEGER paise / milligrams.
 *   repairtickets.weight            -> mg    (WEIGHT_COLUMNS 'weight')
 *   repairtickets.estimatedCharge   -> paise (MONEY_COLUMNS  'estimatedCharge')
 *   repairtickets.actualCharge      -> paise (MONEY_COLUMNS  'actualCharge')
 *   ON READ  every row passes through hydrateRow/hydrateRows (money.js) which
 *            converts these back to the renderer's DECIMAL-string contract.
 *   ON WRITE incoming rupee/gram values are toPaise()/toMg() before binding.
 *
 * ERROR MODEL: the MySQL SPs use SIGNAL/RESIGNAL, i.e. errors PROPAGATE to the
 * caller (they do NOT emit an {message:'Error:...'} row the way save_order's
 * EXIT HANDLER does). So the guards here THROW new Error(<exact SP MESSAGE_TEXT>),
 * matching cancel_order / delete_customer.
 *
 * COUNTER: create_repair_ticket replaces `SELECT ... FOR UPDATE` on shopsettings
 * with a read+increment of currentRepairCounter INSIDE db.transaction(); better-
 * sqlite3 serialises writes so this is atomic without FOR UPDATE (same idiom as
 * orders.nextInvoiceNumber). ticketNumber = repairPrefix + padStart(counter,5,'0').
 */

const { hydrateRow, hydrateRows, toPaise, toMg } = require('../money');
const {
  newGuid, pageBounds, writeAudit, getUserType, resolveId,
} = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * Reads shopsettings id=1 and formats the next repair ticket number
 * (repairPrefix + LPAD(currentRepairCounter,5,'0')). MUST be called inside the
 * write transaction; better-sqlite3 serialises writes so read+increment is
 * atomic (no FOR UPDATE). Falls back to the schema defaults ('REP/', 1) when the
 * singleton row is absent.
 */
function nextRepairNumber(db) {
  const row = db.prepare(
    'SELECT repairPrefix, currentRepairCounter FROM shopsettings WHERE id = 1'
  ).get();
  const prefix = row && row.repairPrefix != null ? row.repairPrefix : 'REP/';
  const counter = row && row.currentRepairCounter != null ? row.currentRepairCounter : 1;
  return {
    prefix,
    counter,
    hasRow: !!row,
    ticketNumber: `${prefix}${String(counter).padStart(5, '0')}`,
  };
}

// CONCAT_WS(' ', firstName, lastName) — skips NULLs, no stray separators.
const CUSTOMER_NAME_EXPR =
  "TRIM(COALESCE(c.firstName, '') || ' ' || COALESCE(c.lastName, ''))";

/**
 * update_repair_status transition table (the SP's IF/ELSEIF ladder).
 * 'declined' is reachable from ANY current status (the SP tests p_newStatus
 * first, unconditionally); every other transition must be an explicit edge.
 */
const ALLOWED_TRANSITIONS = {
  received: ['in_progress'],
  in_progress: ['ready'],
  ready: ['delivered'],
};
function isAllowedTransition(currStatus, newStatus) {
  if (newStatus === 'declined') { return true; }
  return (ALLOWED_TRANSITIONS[currStatus] || []).includes(newStatus);
}

// =====================================================================
// create_repair_ticket
// =====================================================================
function create_repair_ticket(db, params) {
  const [
    p_customerGuid, p_receivedByUserId, p_itemDescription, p_itemPhotoPath,
    p_weight, p_estimatedCharge, p_estimatedReturnDate, p_notes, p_karigarGuid,
  ] = params;

  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));
  if (customerId == null) {
    throw new Error('create_repair_ticket: customer not found');
  }

  let karigarId = null;
  if (p_karigarGuid != null && p_karigarGuid !== '') {
    const k = db.prepare(
      'SELECT id FROM karigars WHERE karigarGuid = ? AND deletedAt IS NULL'
    ).get(p_karigarGuid);
    if (!k) { throw new Error('create_repair_ticket: karigar not found'); }
    karigarId = k.id;
  }

  const ticketGuid = newGuid();

  const run = db.transaction(() => {
    const { counter, hasRow, ticketNumber } = nextRepairNumber(db);

    const info = db.prepare(
      `INSERT INTO repairtickets
         (ticketGuid, ticketNumber, customerId, receivedByUserId, itemDescription,
          itemPhotoPath, weight, estimatedCharge, estimatedReturnDate, status,
          notes, karigarId)
       VALUES (?,?,?,?,?, ?,?,?,?, 'received', ?,?)`
    ).run(
      ticketGuid, ticketNumber, customerId, nz(p_receivedByUserId), nz(p_itemDescription),
      nz(p_itemPhotoPath), toMg(p_weight), toPaise(p_estimatedCharge), nz(p_estimatedReturnDate),
      nz(p_notes), karigarId,
    );
    const ticketId = info.lastInsertRowid;

    // increment counter (no-op if the singleton row is absent, as in the SP)
    if (hasRow) {
      db.prepare('UPDATE shopsettings SET currentRepairCounter = ? WHERE id = 1')
        .run(counter + 1);
    }

    writeAudit(db, {
      actorUserId: nz(p_receivedByUserId),
      action: 'create_repair_ticket',
      entity: 'repairtickets',
      entityId: ticketId,
      after: {
        ticketGuid,
        ticketNumber,
        customerId,
        karigarId,
        estimatedCharge: nz(p_estimatedCharge), // rupees, mirrors SP JSON_OBJECT
      },
    });

    return { ticketId, ticketGuid, ticketNumber };
  });

  return [[run()]];
}

// =====================================================================
// delete_repair_ticket — RBAC guard + soft delete (deletedAt stamp).
// =====================================================================
function delete_repair_ticket(db, params) {
  const [p_ticketGuid, p_actorUserId] = params;

  // RBAC: an 'employee' actor is forbidden (SP SIGNALs). null actor is allowed.
  if (p_actorUserId != null) {
    const type = getUserType(db, p_actorUserId);
    if (type != null && type === 'employee') {
      throw new Error('Forbidden: canDeleteRepair');
    }
  }

  const ticket = db.prepare(
    'SELECT id FROM repairtickets WHERE ticketGuid = ? AND deletedAt IS NULL'
  ).get(nz(p_ticketGuid));
  if (!ticket) { throw new Error('delete_repair_ticket: ticket not found'); }
  const ticketId = ticket.id;

  const run = db.transaction(() => {
    db.prepare("UPDATE repairtickets SET deletedAt = datetime('now') WHERE id = ?")
      .run(ticketId);
    const del = db.prepare('SELECT deletedAt FROM repairtickets WHERE id = ?')
      .get(ticketId).deletedAt;

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'delete_repair_ticket',
      entity: 'repairtickets',
      entityId: ticketId,
      after: { deletedAt: del },
    });
  });
  run();

  return [[{ ticketId }]];
}

// =====================================================================
// link_repair_to_karigar
// =====================================================================
function link_repair_to_karigar(db, params) {
  const [p_ticketGuid, p_karigarGuid, p_karigarJobGuid, p_actorUserId] = params;

  const ticket = db.prepare(
    'SELECT id FROM repairtickets WHERE ticketGuid = ? AND deletedAt IS NULL'
  ).get(nz(p_ticketGuid));
  if (!ticket) { throw new Error('link_repair_to_karigar: ticket not found'); }
  const ticketId = ticket.id;

  const karigar = db.prepare(
    'SELECT id FROM karigars WHERE karigarGuid = ? AND deletedAt IS NULL'
  ).get(nz(p_karigarGuid));
  if (!karigar) { throw new Error('link_repair_to_karigar: karigar not found'); }
  const karigarId = karigar.id;

  let jobId = null;
  if (p_karigarJobGuid != null && p_karigarJobGuid !== '') {
    const job = db.prepare(
      'SELECT id FROM karigarjobcards WHERE jobGuid = ?'
    ).get(p_karigarJobGuid);
    if (!job) { throw new Error('link_repair_to_karigar: karigar job not found'); }
    jobId = job.id;
  }

  const run = db.transaction(() => {
    db.prepare(
      'UPDATE repairtickets SET karigarId = ?, karigarJobId = ? WHERE id = ?'
    ).run(karigarId, jobId, ticketId);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'link_repair_to_karigar',
      entity: 'repairtickets',
      entityId: ticketId,
      after: { karigarId, karigarJobId: jobId },
    });
  });
  run();

  return [[{ ticketId, karigarId, karigarJobId: jobId }]];
}

// =====================================================================
// settle_repair_ticket — only from 'ready'; requires actualCharge + paymentMode.
// =====================================================================
function settle_repair_ticket(db, params) {
  const [p_ticketGuid, p_actualCharge, p_paymentMode, p_paymentRef, p_actorUserId] = params;

  const ticket = db.prepare(
    'SELECT id, status FROM repairtickets WHERE ticketGuid = ? AND deletedAt IS NULL LIMIT 1'
  ).get(nz(p_ticketGuid));
  if (!ticket) { throw new Error('settle_repair_ticket: ticket not found'); }
  if (ticket.status !== 'ready') {
    throw new Error('settle_repair_ticket: ticket is not in ready state');
  }
  if (p_actualCharge == null || p_paymentMode == null || p_paymentMode === '') {
    throw new Error('settle_repair_ticket: actualCharge and paymentMode required');
  }
  const ticketId = ticket.id;
  const currStatus = ticket.status;

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE repairtickets
          SET status = 'delivered', actualCharge = ?, paymentMode = ?,
              paymentRef = ?, deliveredAt = datetime('now')
        WHERE id = ?`
    ).run(toPaise(p_actualCharge), nz(p_paymentMode), nz(p_paymentRef), ticketId);

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'settle_repair_ticket',
      entity: 'repairtickets',
      entityId: ticketId,
      before: { status: currStatus },
      after: {
        status: 'delivered',
        actualCharge: nz(p_actualCharge), // rupees, mirrors SP JSON_OBJECT
        paymentMode: nz(p_paymentMode),
        paymentRef: nz(p_paymentRef),
      },
    });
  });
  run();

  return [[{ ticketId, status: 'delivered' }]];
}

// =====================================================================
// update_repair_status — validated transition + conditional deliveredAt/charges.
// =====================================================================
function update_repair_status(db, params) {
  const [p_ticketGuid, p_newStatus, p_actorUserId, p_actualCharge, p_paymentMode, p_paymentRef] = params;

  const ticket = db.prepare(
    'SELECT id, status FROM repairtickets WHERE ticketGuid = ? AND deletedAt IS NULL LIMIT 1'
  ).get(nz(p_ticketGuid));
  if (!ticket) { throw new Error('update_repair_status: ticket not found'); }
  const ticketId = ticket.id;
  const currStatus = ticket.status;

  if (!isAllowedTransition(currStatus, p_newStatus)) {
    throw new Error('update_repair_status: invalid transition');
  }

  if (p_newStatus === 'delivered') {
    if (p_actualCharge == null || p_paymentMode == null || p_paymentMode === '') {
      throw new Error('update_repair_status: delivered requires actualCharge and paymentMode');
    }
  }

  const run = db.transaction(() => {
    // COALESCE(?, col): only overwrite when a new value is supplied.
    db.prepare(
      `UPDATE repairtickets
          SET status       = ?,
              actualCharge = COALESCE(?, actualCharge),
              paymentMode  = COALESCE(?, paymentMode),
              paymentRef   = COALESCE(?, paymentRef),
              deliveredAt  = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE deliveredAt END
        WHERE id = ?`
    ).run(
      p_newStatus, toPaise(p_actualCharge), nz(p_paymentMode), nz(p_paymentRef),
      p_newStatus, ticketId,
    );

    writeAudit(db, {
      actorUserId: nz(p_actorUserId),
      action: 'update_repair_status',
      entity: 'repairtickets',
      entityId: ticketId,
      before: { status: currStatus },
      after: {
        status: p_newStatus,
        actualCharge: nz(p_actualCharge), // rupees, mirrors SP JSON_OBJECT
        paymentMode: nz(p_paymentMode),
        paymentRef: nz(p_paymentRef),
      },
    });
  });
  run();

  return [[{ ticketId, status: p_newStatus }]];
}

// =====================================================================
// get_all_repair_tickets — SP emits ROWS first, then COUNT. Preserved.
// =====================================================================
function get_all_repair_tickets(db, params) {
  const [p_status, p_customerSearch, p_dateFrom, p_dateTo, p_pageSize, p_page] = params;
  const { limit, offset } = pageBounds(p_pageSize, p_page);
  const search = (p_customerSearch == null || p_customerSearch === '')
    ? null
    : `%${p_customerSearch}%`;

  const binds = {
    status: nz(p_status),
    search,
    dateFrom: nz(p_dateFrom),
    dateTo: nz(p_dateTo),
    limit,
    offset,
  };

  const where =
    `WHERE t.deletedAt IS NULL
       AND (@status IS NULL OR @status = '' OR t.status = @status)
       AND (@search IS NULL OR ${CUSTOMER_NAME_EXPR} LIKE @search
                            OR c.phoneNumber LIKE @search
                            OR t.ticketNumber LIKE @search)
       AND (@dateFrom IS NULL OR date(t.receivedAt) >= @dateFrom)
       AND (@dateTo   IS NULL OR date(t.receivedAt) <= @dateTo)`;

  const rows = db.prepare(
    `SELECT t.id, t.ticketGuid, t.ticketNumber, t.customerId, c.customerGuid,
            ${CUSTOMER_NAME_EXPR} AS customerName,
            c.phoneNumber AS customerPhone,
            t.receivedAt, t.itemDescription, t.weight, t.estimatedCharge,
            t.estimatedReturnDate, t.status, t.actualCharge, t.deliveredAt,
            t.karigarId, k.name AS karigarName, t.createdAt
       FROM repairtickets t
       JOIN customers c     ON c.id = t.customerId
       LEFT JOIN karigars k ON k.id = t.karigarId
       ${where}
      ORDER BY t.receivedAt DESC, t.id DESC
      LIMIT @limit OFFSET @offset`
  ).all(binds);

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords
       FROM repairtickets t
       JOIN customers c ON c.id = t.customerId
       ${where}`
  ).get(binds);

  // SP SELECT order: rows first, then count. The renderer's normalise()/flatten
  // is order-agnostic (filters by r.ticketGuid; reads totalRecords separately).
  return [hydrateRows(rows), [count]];
}

// =====================================================================
// get_repair_ticket_details — single SELECT (0 or 1 rows).
// =====================================================================
function get_repair_ticket_details(db, params) {
  const [p_ticketGuid] = params;

  const rows = db.prepare(
    `SELECT t.id, t.ticketGuid, t.ticketNumber, t.customerId, c.customerGuid,
            ${CUSTOMER_NAME_EXPR} AS customerName,
            c.phoneNumber AS customerPhone,
            c.email       AS customerEmail,
            t.receivedAt, t.receivedByUserId, u.userName AS receivedByUserName,
            t.itemDescription, t.itemPhotoPath, t.weight, t.estimatedCharge,
            t.estimatedReturnDate, t.status, t.actualCharge, t.paymentMode,
            t.paymentRef, t.deliveredAt, t.notes, t.karigarId,
            k.karigarGuid, k.name AS karigarName, k.phone AS karigarPhone,
            t.karigarJobId, j.jobGuid AS karigarJobGuid,
            t.createdAt, t.updatedAt
       FROM repairtickets t
       JOIN customers c            ON c.id  = t.customerId
       LEFT JOIN users u           ON u.uid = t.receivedByUserId
       LEFT JOIN karigars k        ON k.id  = t.karigarId
       LEFT JOIN karigarjobcards j ON j.id  = t.karigarJobId
      WHERE t.ticketGuid = ? AND t.deletedAt IS NULL`
  ).all(nz(p_ticketGuid));

  return [hydrateRows(rows)];
}

// =====================================================================
// get_repair_tickets_by_customer — single SELECT.
// =====================================================================
function get_repair_tickets_by_customer(db, params) {
  const [p_customerGuid] = params;
  const customerId = resolveId(db, 'customers', 'customerGuid', nz(p_customerGuid));

  const rows = db.prepare(
    `SELECT t.id, t.ticketGuid, t.ticketNumber, t.customerId,
            t.receivedAt, t.itemDescription, t.weight, t.estimatedCharge,
            t.estimatedReturnDate, t.status, t.actualCharge, t.paymentMode,
            t.deliveredAt, t.karigarId, k.name AS karigarName, t.createdAt
       FROM repairtickets t
       LEFT JOIN karigars k ON k.id = t.karigarId
      WHERE t.customerId = ? AND t.deletedAt IS NULL
      ORDER BY t.receivedAt DESC, t.id DESC`
  ).all(customerId);

  return [hydrateRows(rows)];
}

module.exports = {
  create_repair_ticket,
  delete_repair_ticket,
  get_all_repair_tickets,
  get_repair_ticket_details,
  get_repair_tickets_by_customer,
  link_repair_to_karigar,
  settle_repair_ticket,
  update_repair_status,
};
