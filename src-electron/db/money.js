/**
 * Money / weight boundary for the SQLite data layer.
 *
 * Storage is integer minor units (see project_sqlite_migration decision):
 *   money  -> INTEGER paise      (₹1 = 100)
 *   weight -> INTEGER milligrams (1 g = 1000)
 *
 * The Angular renderer was written against the old MySQL DECIMAL columns,
 * which mysql2 returns as *strings* ("12345.00"). To keep the renderer
 * contract unchanged we hydrate on read back into fixed-precision strings
 * (2dp money, 3dp weight) and dehydrate user input into integers on write.
 *
 * Conversion is column-NAME based: the money/weight column names in this
 * schema are distinctive and unambiguous across tables, so a name lookup
 * hydrates joined result rows correctly without per-query metadata.
 */

const MONEY_COLUMNS = new Set([
  'creditBalance', 'ratePerGram', 'stoneCharges', 'makingValue', 'costPrice',
  'tagPrice', 'amount', 'metalValue', 'makingCharge', 'stoneCharge',
  'wastageCharge', 'discountAmount', 'taxableAmount', 'cgst', 'sgst', 'igst',
  'lineTotal', 'subTotalTaxable', 'totalCgst', 'totalSgst', 'totalIgst',
  'totalDiscount', 'totalMakingCharge', 'totalStoneCharge', 'totalWastageCharge',
  'oldGoldCreditAmount', 'roundOffAmount', 'grandTotal', 'creditAmount',
  'settlementAmount', 'estimatedCharge', 'actualCharge', 'monthlyAmount',
  'totalPaid', 'redeemedAmount',
]);

const WEIGHT_COLUMNS = new Set([
  'grossWeight', 'netWeight', 'stoneWeight', 'weightGrams', 'netWeightDelta',
  'wastageGramsActual', 'issuedGrossWeight', 'receivedGrossWeight',
  'receivedNetWeight', 'receivedStoneWeight', 'weight',
]);

// ---- scalar conversions -------------------------------------------------

/** rupees (number|string) -> integer paise. null/undefined pass through. */
function toPaise(v) {
  if (v === null || v === undefined || v === '') { return null; }
  return Math.round(Number(v) * 100);
}

/** integer paise -> "0.00" string (matches old mysql2 DECIMAL shape). */
function fromPaise(v) {
  if (v === null || v === undefined) { return null; }
  return (Number(v) / 100).toFixed(2);
}

/** grams (number|string) -> integer milligrams. */
function toMg(v) {
  if (v === null || v === undefined || v === '') { return null; }
  return Math.round(Number(v) * 1000);
}

/** integer milligrams -> "0.000" string. */
function fromMg(v) {
  if (v === null || v === undefined) { return null; }
  return (Number(v) / 1000).toFixed(3);
}

// ---- row hydration (read path) -----------------------------------------

/** Returns a new row object with money/weight integers converted to strings. */
function hydrateRow(row) {
  if (!row || typeof row !== 'object') { return row; }
  const out = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (MONEY_COLUMNS.has(key)) { out[key] = fromPaise(val); }
    else if (WEIGHT_COLUMNS.has(key)) { out[key] = fromMg(val); }
    else { out[key] = val; }
  }
  return out;
}

/** hydrateRow across an array of rows. */
function hydrateRows(rows) {
  return Array.isArray(rows) ? rows.map(hydrateRow) : rows;
}

module.exports = {
  MONEY_COLUMNS,
  WEIGHT_COLUMNS,
  toPaise,
  fromPaise,
  toMg,
  fromMg,
  hydrateRow,
  hydrateRows,
};
