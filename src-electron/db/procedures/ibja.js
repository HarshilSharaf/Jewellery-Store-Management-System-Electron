/**
 * IBJA rate-snapshot procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Ibja). Returns arrays of result sets in the SP's
 * SELECT order; the router appends the mysql2 sentinel.
 *
 * No money/weight columns on ibjaratesnapshots, so rows pass through
 * hydrateRows only for shape-parity (it is a harmless identity here).
 * rawResponse is TEXT; parsedRates is JSON-as-TEXT — it was a MySQL JSON
 * column, which mysql2 returned pre-parsed, so on read we JSON.parse it to
 * preserve the renderer contract (same idiom as orders.get_order_details's
 * rateSnapshot). rawResponsePreview stays a plain truncated string.
 */

const { hydrateRow, hydrateRows } = require('../money');
const { newGuid, pageBounds } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * save_ibja_snapshot(p_session, p_rawResponse, p_status, p_errorMessage)
 * Validates session/status (the SP SIGNALs SQLSTATE 45000 and its EXIT HANDLER
 * RESIGNALs, i.e. propagates), inserts one snapshot row, and returns
 * {snapshotId, snapshotGuid}. UUID() -> newGuid(); LAST_INSERT_ID() ->
 * info.lastInsertRowid. Validation failures throw to mirror the RESIGNAL.
 */
function save_ibja_snapshot(db, params) {
  const [session, rawResponse, status, errorMessage] = params;

  if (session !== 'AM' && session !== 'PM') {
    throw new Error('Error: save_ibja_snapshot: session must be AM or PM');
  }
  if (status !== 'success' && status !== 'parse_failure' && status !== 'network_error') {
    throw new Error('Error: save_ibja_snapshot: invalid status');
  }

  const snapshotGuid = newGuid();
  const run = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO ibjaratesnapshots
         (snapshotGuid, session, rawResponse, status, errorMessage)
       VALUES (?, ?, ?, ?, ?)`
    ).run(snapshotGuid, session, nz(rawResponse), status, nz(errorMessage));
    return info.lastInsertRowid;
  });
  const snapshotId = run();

  return [[hydrateRow({ snapshotId, snapshotGuid })]];
}

/**
 * get_ibja_snapshots(p_status, p_dateFrom, p_dateTo, p_pageSize, p_page)
 * Two result sets in SP SELECT order: [rows] then [{totalRecords}]. (The SP
 * emits the paged rows first, the count second — this is NOT the usual
 * count-first shape; see the port report.) Filters are all optional; empty/null
 * status is ignored, dates compare against DATE(fetchedAt). LEFT(rawResponse,500)
 * -> substr(...,1,500); LIMIT/OFFSET via pageBounds (== GREATEST(1,COALESCE...)).
 */
function get_ibja_snapshots(db, params) {
  const [status, dateFrom, dateTo, pageSize, page] = params;
  const { limit, offset } = pageBounds(pageSize, page);

  const s = nz(status);
  const from = nz(dateFrom);
  const to = nz(dateTo);

  const where =
    `WHERE (@status IS NULL OR @status = '' OR s.status = @status)
       AND (@from IS NULL OR date(s.fetchedAt) >= @from)
       AND (@to   IS NULL OR date(s.fetchedAt) <= @to)`;

  const bind = { status: s, from, to };

  const rows = db.prepare(
    `SELECT s.id, s.snapshotGuid, s.fetchedAt, s.session, s.status, s.errorMessage,
            substr(s.rawResponse, 1, 500) AS rawResponsePreview,
            s.parsedRates, s.createdAt
       FROM ibjaratesnapshots s
       ${where}
      ORDER BY s.fetchedAt DESC, s.id DESC
      LIMIT @limit OFFSET @offset`
  ).all({ ...bind, limit, offset });

  const page_rows = hydrateRows(rows).map((row) => {
    // parsedRates was a MySQL JSON column (mysql2 pre-parsed); match that shape.
    if (row.parsedRates != null && typeof row.parsedRates === 'string') {
      try { row.parsedRates = JSON.parse(row.parsedRates); } catch (_) { /* leave as-is */ }
    }
    return row;
  });

  const count = db.prepare(
    `SELECT COUNT(*) AS totalRecords FROM ibjaratesnapshots s ${where}`
  ).get(bind);

  return [page_rows, [count]];
}

module.exports = {
  save_ibja_snapshot,
  get_ibja_snapshots,
};
