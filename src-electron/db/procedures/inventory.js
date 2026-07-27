/**
 * Inventory (products) procedures — SQLite reimplementation of
 * Scripts/Stored-Procedures/Inventory. Each function returns an array of
 * result sets (array-of-arrays of row objects); the router wraps it in the
 * mysql2-compatible envelope.
 *
 * Money/weight boundary (products): storage is INTEGER paise/mg.
 *   money  cols: stoneCharges, makingValue, costPrice, tagPrice
 *   weight cols: grossWeight, netWeight, stoneWeight
 *   wastagePercent is REAL — passed through unchanged.
 * Rows are hydrated back to DECIMAL strings on read (hydrateRow/hydrateRows)
 * and rupee/gram inputs are dehydrated to integers on write (toPaise/toMg).
 */

const { hydrateRow, hydrateRows, toPaise, toMg, fromMg } = require('../money');
const {
  newGuid, likePattern, pageBounds, truthy, writeAudit, getUserType, computeGrowth,
} = require('../helpers');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/** COALESCE(x, fallback) for JS (only NULL/undefined trigger the fallback). */
function coalesce(v, fallback) { return v === null || v === undefined ? fallback : v; }

/**
 * Local helper — replaces the product image-name idiom
 *   CONCAT(UNIX_TIMESTAMP(), '-product-', <guid>, '.', SUBSTRING_INDEX(name,'.',-1))
 * used by add_product / update_product_image. NOTE: this format is product-
 * specific and intentionally differs from helpers.buildImageName() (which
 * produces the customer/user `<guid>-<tag>-<original>` shape). The renderer's
 * FileSystemService resolves the *exact* returned string against the pictures
 * directory, so the original `<unixTimestamp>-product-<guid>.<ext>` format must
 * be preserved verbatim or product images break.
 */
function buildProductImageName(productGuid, originalName) {
  if (!originalName) { return null; }
  const ext = String(originalName).split('.').pop(); // SUBSTRING_INDEX(.,-1)
  return `${Math.floor(Date.now() / 1000)}-product-${productGuid}.${ext}`;
}

/**
 * add_product(sku, huid, purityCode, productDescription, grossWeight, netWeight,
 *   stoneWeight, stoneCharges, makingMode, makingValue, wastagePercent, costPrice,
 *   tagPrice, hsnCode, masterCategoryId, subCategoryId, productCategoryId,
 *   imageFileName)
 * Generates GUID + product image name in JS, converts money/weight to integers,
 * inserts, then re-selects the new row (was SELECT * WHERE id=LAST_INSERT_ID()).
 */
function add_product(db, params) {
  const [
    sku, huid, purityCode, productDescription, grossWeight, netWeight,
    stoneWeight, stoneCharges, makingMode, makingValue, wastagePercent, costPrice,
    tagPrice, hsnCode, masterCategoryId, subCategoryId, productCategoryId,
    imageFileName,
  ] = params;

  const guid = newGuid();
  const imagePath = buildProductImageName(guid, imageFileName);

  const info = db.prepare(
    `INSERT INTO products (
        productGuid, sku, huid, purityCode, productDescription,
        grossWeight, netWeight, stoneWeight, stoneCharges,
        makingMode, makingValue, wastagePercent, costPrice, tagPrice,
        hsnCode, imagePath, isSold, mid, sid, pid
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    guid, nz(sku), nz(huid), nz(purityCode), nz(productDescription),
    toMg(grossWeight), toMg(netWeight), toMg(stoneWeight), toPaise(stoneCharges),
    coalesce(makingMode, 'perGram'), toPaise(makingValue), nz(wastagePercent),
    toPaise(costPrice), toPaise(tagPrice), coalesce(hsnCode, '7113'),
    imagePath, nz(masterCategoryId), nz(subCategoryId), nz(productCategoryId),
  );

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  return [[hydrateRow(row)]];
}

/**
 * get_all_products(fetchSoldProducts, itemsPerPage, pageNumber, searchQuery)
 * The original SP's IF/ELSE only differs by the `isSold = 0` filter; collapsed
 * to one parameterized query. Returns 2 result sets ([{totalRecords}], [rows]).
 * When fetchSoldProducts is truthy the sold filter is dropped (shows all).
 */
function get_all_products(db, params) {
  const [fetchSoldProducts, itemsPerPage, pageNumber, searchQuery] = params;
  const pattern = likePattern(searchQuery);
  const soldFilter = truthy(fetchSoldProducts) ? '' : 'AND A.isSold = 0';

  const where =
    `WHERE (A.productDescription LIKE @p
            OR A.sku LIKE @p
            OR A.huid LIKE @p
            OR A.netWeight LIKE @p
            OR B.masterCategoryName LIKE @p
            OR C.subCategoryName LIKE @p
            OR D.productCategoryName LIKE @p)
       ${soldFilter}
       AND A.deletedAt IS NULL`;

  const joins =
    `FROM products A
     INNER JOIN mastercategories B ON A.mid = B.id
     INNER JOIN subcategories    C ON A.sid = C.id
     INNER JOIN productcategories D ON A.pid = D.id`;

  const count = db.prepare(
    `SELECT COUNT(A.id) AS totalRecords ${joins} ${where}`
  ).get({ p: pattern });

  const { limit, offset } = pageBounds(itemsPerPage, pageNumber);
  const rows = db.prepare(
    `SELECT
        A.id, A.productGuid, A.sku, A.huid, A.purityCode, A.productDescription,
        A.grossWeight, A.netWeight, A.stoneWeight, A.stoneCharges,
        A.makingMode, A.makingValue, A.wastagePercent, A.tagPrice, A.hsnCode,
        B.masterCategoryName AS masterCategory,
        C.subCategoryName    AS subCategory,
        D.productCategoryName AS productCategory,
        A.imagePath, A.createdAt, A.isSold
     ${joins} ${where}
     ORDER BY A.createdAt DESC
     LIMIT @limit OFFSET @offset`
  ).all({ p: pattern, limit, offset });

  return [[count], hydrateRows(rows)];
}

/**
 * get_product_details(productGuid) — single joined SELECT (0 or 1 row).
 */
function get_product_details(db, params) {
  const [productGuid] = params;
  const rows = db.prepare(
    `SELECT
        p.id, p.productGuid, p.sku, p.huid, p.purityCode,
        pu.label     AS purityLabel,
        pu.metalType AS metalType,
        pu.fineness  AS purityFineness,
        p.productDescription, p.grossWeight, p.netWeight, p.stoneWeight,
        p.stoneCharges, p.makingMode, p.makingValue, p.wastagePercent,
        p.costPrice, p.tagPrice, p.hsnCode, p.imagePath,
        p.mid AS masterCategoryId, p.sid AS subCategoryId, p.pid AS productCategoryId,
        m.masterCategoryName, s.subCategoryName, pc.productCategoryName,
        p.isSold, p.createdAt, p.updatedAt
     FROM products p
     LEFT JOIN purities         pu ON p.purityCode = pu.code
     LEFT JOIN mastercategories m  ON p.mid = m.id
     LEFT JOIN subcategories    s  ON p.sid = s.id
     LEFT JOIN productcategories pc ON p.pid = pc.id
     WHERE p.productGuid = ?`
  ).all(productGuid);
  return [hydrateRows(rows)];
}

/**
 * update_product_details(...) — UPDATE only (original SP returns no result set).
 * Money/weight inputs converted to integers; makingMode/hsnCode keep the
 * existing value when the incoming param is NULL (COALESCE).
 */
function update_product_details(db, params) {
  const [
    productGuid, sku, huid, purityCode, productDescription, grossWeight, netWeight,
    stoneWeight, stoneCharges, makingMode, makingValue, wastagePercent, costPrice,
    tagPrice, hsnCode, mid, sid, pid,
  ] = params;

  db.prepare(
    `UPDATE products
        SET sku                = ?,
            huid               = ?,
            purityCode         = ?,
            productDescription = ?,
            grossWeight        = ?,
            netWeight          = ?,
            stoneWeight        = ?,
            stoneCharges       = ?,
            makingMode         = COALESCE(?, makingMode),
            makingValue        = ?,
            wastagePercent     = ?,
            costPrice          = ?,
            tagPrice           = ?,
            hsnCode            = COALESCE(?, hsnCode),
            mid                = ?,
            sid                = ?,
            pid                = ?
      WHERE productGuid = ?`
  ).run(
    nz(sku), nz(huid), nz(purityCode), nz(productDescription),
    toMg(grossWeight), toMg(netWeight), toMg(stoneWeight), toPaise(stoneCharges),
    nz(makingMode), toPaise(makingValue), nz(wastagePercent),
    toPaise(costPrice), toPaise(tagPrice), nz(hsnCode),
    nz(mid), nz(sid), nz(pid), nz(productGuid),
  );

  return [];
}

/**
 * delete_product(hardDelete, productGuid, actorUserId)
 * RBAC: an 'employee' actor is forbidden (original SIGNAL). Hard delete removes
 * the row; soft delete stamps deletedAt. Always writes an audit row. The
 * delete/update + audit insert run in one transaction.
 */
function delete_product(db, params) {
  const [hardDelete, productGuid, actorUserId] = params;

  if (actorUserId != null) {
    const actorType = getUserType(db, actorUserId);
    if (actorType === 'employee') {
      throw new Error('Forbidden: canDeleteProduct');
    }
  }

  const hard = truthy(hardDelete);
  db.transaction(() => {
    if (hard) {
      db.prepare('DELETE FROM products WHERE productGuid = ?').run(nz(productGuid));
    } else {
      db.prepare(
        `UPDATE products SET deletedAt = CURRENT_TIMESTAMP WHERE productGuid = ?`
      ).run(nz(productGuid));
    }
    writeAudit(db, {
      actorUserId: nz(actorUserId),
      action: 'delete_product',
      entity: 'products',
      entityId: productGuid,
      after: { hardDelete: hard ? 1 : 0 },
    });
  })();

  return [];
}

/**
 * get_product_image(productGuid) — single SELECT of imagePath.
 */
function get_product_image(db, params) {
  const [productGuid] = params;
  const rows = db.prepare(
    'SELECT imagePath FROM products WHERE productGuid = ?'
  ).all(productGuid);
  return [rows];
}

/**
 * delete_product_image(productGuid) — captures the old filename, nulls the
 * column, and returns { oldFileName }. Read + write run in one transaction.
 */
function delete_product_image(db, params) {
  const [productGuid] = params;
  const oldFileName = db.transaction(() => {
    const existing = db.prepare(
      'SELECT imagePath FROM products WHERE productGuid = ?'
    ).get(productGuid);
    db.prepare('UPDATE products SET imagePath = NULL WHERE productGuid = ?').run(nz(productGuid));
    return existing ? existing.imagePath : null;
  })();
  return [[{ oldFileName }]];
}

/**
 * update_product_image(productGuid, imageFileName) — captures the old filename,
 * builds a new product image name in JS, updates imagePath, and re-selects
 * { imagePath, oldFileName }. Returns [] if the product does not exist.
 */
function update_product_image(db, params) {
  const [productGuid, imageFileName] = params;
  const rows = db.transaction(() => {
    const existing = db.prepare(
      'SELECT imagePath FROM products WHERE productGuid = ?'
    ).get(productGuid);
    const oldFileName = existing ? existing.imagePath : null;
    const newName = buildProductImageName(productGuid, imageFileName);
    db.prepare('UPDATE products SET imagePath = ? WHERE productGuid = ?')
      .run(newName, nz(productGuid));
    return db.prepare(
      'SELECT imagePath FROM products WHERE productGuid = ?'
    ).all(productGuid).map((r) => ({ imagePath: r.imagePath, oldFileName }));
  })();
  return [rows];
}

/** Shared SUM-of-netWeight growth computation for the two stock procs. */
function stockResult(db, extraFilter, arg) {
  const filter = extraFilter ? `AND ${extraFilter}` : '';
  const bind = arg == null ? [] : [arg];

  const current = db.prepare(
    `SELECT COALESCE(SUM(netWeight), 0) AS s FROM products
      WHERE createdAt >= datetime('now', '-6 months') AND isSold = 0
        AND deletedAt IS NULL ${filter}`
  ).get(...bind).s;

  const previous = db.prepare(
    `SELECT COALESCE(SUM(netWeight), 0) AS s FROM products
      WHERE createdAt < datetime('now', '-6 months')
        AND deletedAt IS NULL ${filter}`
  ).get(...bind).s;

  const total = db.prepare(
    `SELECT COALESCE(SUM(netWeight), 0) AS s FROM products
      WHERE isSold = 0 AND deletedAt IS NULL ${filter}`
  ).get(...bind).s;

  // netWeight is mg -> `total` hydrates to a 3dp gram string (not a named
  // WEIGHT column, so convert explicitly). Growth is a ratio, unit-invariant.
  return [[{ total: fromMg(total), percent_increase: computeGrowth(current, previous) }]];
}

/** get_total_stock() — net-weight in stock + 6-month growth %. */
function get_total_stock(db) {
  return stockResult(db, null, null);
}

/** get_total_stock_of_master_category(categoryId) — same, scoped to a mid. */
function get_total_stock_of_master_category(db, params) {
  const [categoryId] = params;
  return stockResult(db, 'mid = ?', nz(categoryId));
}

module.exports = {
  add_product,
  get_all_products,
  get_product_details,
  update_product_details,
  delete_product,
  get_product_image,
  delete_product_image,
  update_product_image,
  get_total_stock,
  get_total_stock_of_master_category,
};
