/**
 * Metal-rates procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/MetalRates). Each function returns an array of
 * result sets (array-of-arrays of row objects); the router wraps it in the
 * mysql2-compatible envelope.
 *
 * MONEY: metalrates.ratePerGram is stored as INTEGER paise. hydrateRows()
 * converts it back to a DECIMAL string on read; toPaise() dehydrates the
 * incoming rupees on write (save_metal_rates).
 */

const { hydrateRows, toPaise } = require('../money');
const { writeAudit, getUserType } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * Replicates the SP's RBAC guard:
 *   IF actor.type = 'employee' THEN SIGNAL 'Forbidden: canEditShopSettings'.
 * A null actor (system/IBJA writes) is allowed, matching the SP.
 */
function assertCanEditShopSettings(db, userId) {
  if (userId == null) { return; }
  const type = getUserType(db, userId);
  if (type != null && type === 'employee') {
    throw new Error('Forbidden: canEditShopSettings');
  }
}

/**
 * get_current_metal_rates() — the latest AM row AND the latest PM row per
 * purity (most-recent effectiveDate per purity+session), joined to purities.
 * Single result set.
 */
function get_current_metal_rates(db) {
  const rows = db.prepare(
    `SELECT
        r.id,
        r.effectiveDate,
        r.session,
        r.purityCode,
        p.label       AS purityLabel,
        p.metalType,
        r.ratePerGram,
        r.source,
        r.setByUserId,
        r.createdAt
       FROM metalrates r
       INNER JOIN purities p ON r.purityCode = p.code
       INNER JOIN (
         SELECT purityCode, session, MAX(effectiveDate) AS latestDate
           FROM metalrates
          GROUP BY purityCode, session
       ) latest
         ON latest.purityCode = r.purityCode
        AND latest.session    = r.session
        AND latest.latestDate = r.effectiveDate
      ORDER BY p.sortOrder, r.session`
  ).all();
  return [hydrateRows(rows)];
}

/**
 * get_metal_rates_history(days) — rates set within the last `days` days
 * (GREATEST(1, COALESCE(days, 30))), with the setter's userName. Single set.
 * CURDATE()/DATE_SUB -> date('now') / date('now','-N days').
 */
function get_metal_rates_history(db, params) {
  const [p_days] = params;
  const days = Math.max(1, p_days == null ? 30 : Number(p_days));

  const rows = db.prepare(
    `SELECT
        m.id,
        m.effectiveDate,
        m.session,
        m.purityCode,
        p.label AS purityLabel,
        p.metalType,
        m.ratePerGram,
        m.source,
        m.setByUserId,
        u.userName AS setByUserName,
        m.createdAt
       FROM metalrates m
       JOIN purities p ON p.code = m.purityCode
       LEFT JOIN users u ON u.uid = m.setByUserId
      WHERE m.effectiveDate >= date('now', '-' || @days || ' days')
      ORDER BY m.effectiveDate DESC, m.session DESC, p.sortOrder ASC`
  ).all({ days });
  return [hydrateRows(rows)];
}

/**
 * save_metal_rates(effectiveDate, session, source, setByUserId, ratesJson)
 * `ratesJson` is a JSON string of [{purityCode, ratePerGram}] where
 * ratePerGram is RUPEES. Each row is upserted (dehydrated to paise) inside a
 * single transaction, an audit row is written, then the current rates are
 * returned (the SP CALLs get_current_metal_rates at the end).
 */
function save_metal_rates(db, params) {
  const [effectiveDate, session, source, setByUserId, ratesJson] = params;

  assertCanEditShopSettings(db, setByUserId);

  const rates = ratesJson ? JSON.parse(ratesJson) : [];
  const src = source == null ? 'manual' : source;

  const upsert = db.prepare(
    `INSERT INTO metalrates
        (effectiveDate, session, purityCode, ratePerGram, source, setByUserId)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(effectiveDate, session, purityCode) DO UPDATE SET
        ratePerGram = excluded.ratePerGram,
        source      = excluded.source,
        setByUserId = excluded.setByUserId`
  );

  const run = db.transaction(() => {
    for (const rate of rates) {
      upsert.run(
        nz(effectiveDate),
        nz(session),
        nz(rate.purityCode),
        toPaise(rate.ratePerGram),   // rupees -> integer paise
        src,
        nz(setByUserId),
      );
    }
    writeAudit(db, {
      actorUserId: nz(setByUserId),
      action: 'save_metal_rates',
      entity: 'metalrates',
      entityId: `${effectiveDate}/${session}`,
      after: rates,
    });
  });
  run();

  return get_current_metal_rates(db);
}

module.exports = {
  get_current_metal_rates,
  get_metal_rates_history,
  save_metal_rates,
};
