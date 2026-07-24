/**
 * Shop-settings procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/ShopSettings). Returns arrays of result sets;
 * the router wraps them in the mysql2-compatible envelope.
 *
 * shopsettings is a singleton (id = 1) and has NO money/weight columns, so
 * hydrateRows() is a pass-through here — kept for shape consistency.
 */

const { hydrateRows } = require('../money');
const { writeAudit, getUserType } = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** COALESCE(v, d): treat undefined/null as absent, mirroring the SP defaults. */
function def(v, d) { return v === undefined || v === null ? d : v; }

/**
 * Replicates the SP's RBAC guard:
 *   IF actor.type = 'employee' THEN SIGNAL 'Forbidden: canEditShopSettings'.
 * A null actor is allowed, matching the SP.
 */
function assertCanEditShopSettings(db, userId) {
  if (userId == null) { return; }
  const type = getUserType(db, userId);
  if (type != null && type === 'employee') {
    throw new Error('Forbidden: canEditShopSettings');
  }
}

/** get_shop_settings() — the singleton row (id = 1). Single result set. */
function get_shop_settings(db) {
  const rows = db.prepare('SELECT * FROM shopsettings WHERE id = 1').all();
  return [hydrateRows(rows)];
}

/**
 * reset_invoice_counter(newCounter, actorUserId)
 * Sets both currentInvoiceCounter and invoiceStartFrom to COALESCE(newCounter,1),
 * audits, then returns the two counter columns.
 */
function reset_invoice_counter(db, params) {
  const [newCounter, actorUserId] = params;

  assertCanEditShopSettings(db, actorUserId);

  const counter = def(newCounter, 1);
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE shopsettings
          SET currentInvoiceCounter = ?,
              invoiceStartFrom      = ?
        WHERE id = 1`
    ).run(counter, counter);

    writeAudit(db, {
      actorUserId: nz(actorUserId),
      action: 'reset_invoice_counter',
      entity: 'shopsettings',
      entityId: '1',
      after: { newCounter: nz(newCounter) },
    });
  });
  run();

  const rows = db.prepare(
    'SELECT currentInvoiceCounter, invoiceStartFrom FROM shopsettings WHERE id = 1'
  ).all();
  return [hydrateRows(rows)];
}

/**
 * save_shop_settings(...22 params, actorUserId)
 * Singleton upsert on id = 1. Params are positional in the SP's exact IN order.
 *
 * NOTE: the update branch intentionally mirrors the MySQL SP, which does NOT
 * refresh addressLine1, addressLine2, city or email on conflict (they are only
 * set on first insert). See risks in the porting notes.
 */
function save_shop_settings(db, params) {
  const [
    shopName, gstin, pan, addressLine1, addressLine2, city, state, stateCode,
    pincode, phone, email, logoPath, invoicePrefix, invoiceStartFrom,
    currentInvoiceCounter, defaultCurrency, timezone, roundOffEnabled,
    backupDir, defaultPrintVariant, typographyPreset, actorUserId,
  ] = params;

  assertCanEditShopSettings(db, actorUserId);

  db.prepare(
    `INSERT INTO shopsettings
        (id, shopName, gstin, pan, addressLine1, addressLine2, city, state,
         stateCode, pincode, phone, email, logoPath, invoicePrefix,
         invoiceStartFrom, currentInvoiceCounter, defaultCurrency, timezone,
         roundOffEnabled, backupDir, defaultPrintVariant, typographyPreset)
      VALUES
        (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shopName              = excluded.shopName,
        gstin                 = excluded.gstin,
        pan                   = excluded.pan,
        state                 = excluded.state,
        stateCode             = excluded.stateCode,
        pincode               = excluded.pincode,
        phone                 = excluded.phone,
        logoPath              = excluded.logoPath,
        invoicePrefix         = excluded.invoicePrefix,
        invoiceStartFrom      = excluded.invoiceStartFrom,
        currentInvoiceCounter = excluded.currentInvoiceCounter,
        defaultCurrency       = excluded.defaultCurrency,
        timezone              = excluded.timezone,
        roundOffEnabled       = excluded.roundOffEnabled,
        backupDir             = excluded.backupDir,
        defaultPrintVariant   = excluded.defaultPrintVariant,
        typographyPreset      = excluded.typographyPreset`
  ).run(
    nz(shopName), nz(gstin), nz(pan), nz(addressLine1), nz(addressLine2),
    nz(city), nz(state), nz(stateCode), nz(pincode), nz(phone), nz(email),
    nz(logoPath),
    def(invoicePrefix, 'INV/'),
    def(invoiceStartFrom, 1),
    def(currentInvoiceCounter, 1),
    def(defaultCurrency, 'INR'),
    def(timezone, 'Asia/Kolkata'),
    def(roundOffEnabled, 1),
    nz(backupDir),
    def(defaultPrintVariant, 'a4'),
    def(typographyPreset, 'editorial'),
  );

  const rows = db.prepare('SELECT * FROM shopsettings WHERE id = 1').all();
  return [hydrateRows(rows)];
}

module.exports = {
  get_shop_settings,
  reset_invoice_counter,
  save_shop_settings,
};
