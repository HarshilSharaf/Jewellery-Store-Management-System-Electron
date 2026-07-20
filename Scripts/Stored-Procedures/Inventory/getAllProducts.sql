DROP procedure IF EXISTS `get_all_products`;
DELIMITER $$
CREATE PROCEDURE `get_all_products`(
  IN p_fetchSoldProducts TINYINT(1),
  IN itemsPerPage        INT,
  IN pageNumber          INT,
  IN searchQuery         VARCHAR(255)
)
BEGIN
  DECLARE startIndex INT;
  DECLARE searchPattern VARCHAR(255);

  SET searchPattern = CONCAT('%', searchQuery, '%');
  SET startIndex = (pageNumber - 1) * itemsPerPage;

  IF p_fetchSoldProducts = 0 THEN
    SELECT COUNT(A.id) AS totalRecords
      FROM products A
      INNER JOIN mastercategories B ON A.mid = B.id
      INNER JOIN subcategories    C ON A.sid = C.id
      INNER JOIN productcategories D ON A.pid = D.id
     WHERE (A.productDescription LIKE searchPattern
            OR A.sku LIKE searchPattern
            OR A.huid LIKE searchPattern
            OR A.netWeight LIKE searchPattern
            OR B.masterCategoryName LIKE searchPattern
            OR C.subCategoryName LIKE searchPattern
            OR D.productCategoryName LIKE searchPattern)
       AND A.isSold = 0
       AND A.deletedAt IS NULL;

    SELECT
      A.id,
      A.productGuid,
      A.sku,
      A.huid,
      A.purityCode,
      A.productDescription,
      A.grossWeight,
      A.netWeight,
      A.stoneWeight,
      A.stoneCharges,
      A.makingMode,
      A.makingValue,
      A.wastagePercent,
      A.tagPrice,
      A.hsnCode,
      B.masterCategoryName AS masterCategory,
      C.subCategoryName    AS subCategory,
      D.productCategoryName AS productCategory,
      A.imagePath,
      A.createdAt,
      A.isSold
    FROM products A
    INNER JOIN mastercategories B ON A.mid = B.id
    INNER JOIN subcategories    C ON A.sid = C.id
    INNER JOIN productcategories D ON A.pid = D.id
    WHERE (A.productDescription LIKE searchPattern
           OR A.sku LIKE searchPattern
           OR A.huid LIKE searchPattern
           OR A.netWeight LIKE searchPattern
           OR B.masterCategoryName LIKE searchPattern
           OR C.subCategoryName LIKE searchPattern
           OR D.productCategoryName LIKE searchPattern)
      AND A.isSold = 0
      AND A.deletedAt IS NULL
    ORDER BY A.createdAt DESC
    LIMIT itemsPerPage OFFSET startIndex;
  ELSE
    SELECT COUNT(A.id) AS totalRecords
      FROM products A
      INNER JOIN mastercategories B ON A.mid = B.id
      INNER JOIN subcategories    C ON A.sid = C.id
      INNER JOIN productcategories D ON A.pid = D.id
     WHERE (A.productDescription LIKE searchPattern
            OR A.sku LIKE searchPattern
            OR A.huid LIKE searchPattern
            OR A.netWeight LIKE searchPattern
            OR B.masterCategoryName LIKE searchPattern
            OR C.subCategoryName LIKE searchPattern
            OR D.productCategoryName LIKE searchPattern)
       AND A.deletedAt IS NULL;

    SELECT
      A.id,
      A.productGuid,
      A.sku,
      A.huid,
      A.purityCode,
      A.productDescription,
      A.grossWeight,
      A.netWeight,
      A.stoneWeight,
      A.stoneCharges,
      A.makingMode,
      A.makingValue,
      A.wastagePercent,
      A.tagPrice,
      A.hsnCode,
      B.masterCategoryName AS masterCategory,
      C.subCategoryName    AS subCategory,
      D.productCategoryName AS productCategory,
      A.imagePath,
      A.createdAt,
      A.isSold
    FROM products A
    INNER JOIN mastercategories B ON A.mid = B.id
    INNER JOIN subcategories    C ON A.sid = C.id
    INNER JOIN productcategories D ON A.pid = D.id
    WHERE (A.productDescription LIKE searchPattern
           OR A.sku LIKE searchPattern
           OR A.huid LIKE searchPattern
           OR A.netWeight LIKE searchPattern
           OR B.masterCategoryName LIKE searchPattern
           OR C.subCategoryName LIKE searchPattern
           OR D.productCategoryName LIKE searchPattern)
      AND A.deletedAt IS NULL
    ORDER BY A.createdAt DESC
    LIMIT itemsPerPage OFFSET startIndex;
  END IF;
END$$
DELIMITER ;
