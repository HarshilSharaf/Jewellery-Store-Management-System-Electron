/**
 * Categories procedures (SQLite reimplementation of
 * Scripts/Stored-Procedures/Categories, incl. MasterCategories,
 * SubCategories, ProductCategories and the top-level getAllCategories).
 * Each function returns an array of result sets (array-of-arrays of row
 * objects), matching the order of the original SP's SELECTs. The router
 * appends the mysql2-compatible sentinel.
 */

const { hydrateRows, fromMg } = require('../money');

/** undefined -> null (better-sqlite3 rejects undefined binds). */
function nz(v) { return v === undefined ? null : v; }

/**
 * get_all_categories()
 * The MySQL SP emitted THREE result sets, each a single row holding a
 * JSON_ARRAYAGG blob (MasterCategoriesData / SubCategoriesData /
 * ProductCategoriesData). Per the migration contract we drop the JSON and
 * return the plain rows as three separate result sets, in the same order:
 * [masterRows, subRows, productRows]. The renderer's flatten() concatenates
 * them and discriminates by column name (masterCategoryName /
 * subCategoryName / productCategoryName), so column selection is kept exact.
 */
function get_all_categories(db) {
  const master = db.prepare(
    'SELECT id, masterCategoryName FROM mastercategories'
  ).all();
  const sub = db.prepare(
    'SELECT id, subCategoryName FROM subcategories'
  ).all();
  const product = db.prepare(
    'SELECT id, productCategoryName FROM productcategories'
  ).all();
  return [hydrateRows(master), hydrateRows(sub), hydrateRows(product)];
}

/** add_master_category(masterCategoryName, masterCategoryDescription) — INSERT only, no SELECT. */
function add_master_category(db, params) {
  const [masterCategoryName, masterCategoryDescription] = params;
  db.prepare(
    `INSERT INTO mastercategories (masterCategoryName, masterCategoryDescription)
     VALUES (?, ?)`
  ).run(nz(masterCategoryName), nz(masterCategoryDescription));
  return [];
}

/** get_master_categories() — SELECT * FROM mastercategories. */
function get_master_categories(db) {
  const rows = db.prepare('SELECT * FROM mastercategories').all();
  return [hydrateRows(rows)];
}

/** add_product_category(productCategoryName, productCategoryDescription) — INSERT only, no SELECT. */
function add_product_category(db, params) {
  const [productCategoryName, productCategoryDescription] = params;
  db.prepare(
    `INSERT INTO productcategories (productCategoryName, productCategoryDescription)
     VALUES (?, ?)`
  ).run(nz(productCategoryName), nz(productCategoryDescription));
  return [];
}

/** get_product_categories() — SELECT * FROM productcategories. */
function get_product_categories(db) {
  const rows = db.prepare('SELECT * FROM productcategories').all();
  return [hydrateRows(rows)];
}

/**
 * get_top_product_categories(numberOfCategories)
 * Aggregates sold-product net weights per product category. The original SP
 * computed ROUND(SUM(netWeight) * 100 / totalWeight, 2) in SQL; here we sum
 * total (integer milligrams) first, then compute each percentage in JS.
 * `total_weight` is a weight column not covered by hydrateRows' name map, so
 * we convert it to the grams string (fromMg) explicitly to match the old
 * mysql2 DECIMAL(14,3) shape. Div-by-zero guarded exactly as the SP (total
 * of 0 becomes 1).
 */
function get_top_product_categories(db, params) {
  const [numberOfCategories] = params;
  const limit = Number.isFinite(Number(numberOfCategories))
    ? Math.trunc(Number(numberOfCategories))
    : -1; // SQLite: LIMIT -1 == unlimited

  const totalRow = db.prepare(
    `SELECT COALESCE(SUM(netWeight), 0) AS total
       FROM products
      WHERE isSold = 1 AND deletedAt IS NULL`
  ).get();
  let totalWeight = Number(totalRow.total) || 0;
  if (totalWeight === 0) { totalWeight = 1; }

  const rows = db.prepare(
    `SELECT B.productCategoryName AS productCategoryName,
            SUM(A.netWeight) AS total_weight
       FROM products A
       INNER JOIN productcategories B ON A.pid = B.id
      WHERE A.isSold = 1 AND A.deletedAt IS NULL
      GROUP BY A.pid, B.productCategoryName
      ORDER BY total_weight DESC
      LIMIT ?`
  ).all(limit);

  const result = rows.map((r) => {
    const rawMg = Number(r.total_weight) || 0;
    const percentage = Math.round((rawMg * 100 / totalWeight) * 100) / 100;
    return {
      productCategoryName: r.productCategoryName,
      total_weight: fromMg(rawMg),
      percentage,
    };
  });

  // Pass through hydrateRows for safety (no-op on these column names).
  return [hydrateRows(result)];
}

/** add_sub_category(subCategoryName, subCategoryDescription) — INSERT only, no SELECT. */
function add_sub_category(db, params) {
  const [subCategoryName, subCategoryDescription] = params;
  db.prepare(
    `INSERT INTO subcategories (subCategoryName, subCategoryDescription)
     VALUES (?, ?)`
  ).run(nz(subCategoryName), nz(subCategoryDescription));
  return [];
}

/** get_sub_categories() — SELECT * FROM subcategories. */
function get_sub_categories(db) {
  const rows = db.prepare('SELECT * FROM subcategories').all();
  return [hydrateRows(rows)];
}

module.exports = {
  get_all_categories,
  add_master_category,
  get_master_categories,
  add_product_category,
  get_product_categories,
  get_top_product_categories,
  add_sub_category,
  get_sub_categories,
};
