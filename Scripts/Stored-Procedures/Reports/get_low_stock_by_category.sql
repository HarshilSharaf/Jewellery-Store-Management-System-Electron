DROP procedure IF EXISTS `get_low_stock_by_category`;
DELIMITER $$
CREATE PROCEDURE `get_low_stock_by_category`(
  IN p_thresholdCount INT
)
BEGIN
  DECLARE l_threshold INT;

  SET time_zone = 'SYSTEM';
  SET l_threshold = COALESCE(p_thresholdCount, 3);

  SELECT
    mc.id                       AS masterCategoryId,
    mc.masterCategoryName       AS masterCategoryName,
    sc.id                       AS subCategoryId,
    sc.subCategoryName          AS subCategoryName,
    pc.id                       AS productCategoryId,
    pc.productCategoryName      AS productCategoryName,
    COUNT(pr.id)                AS inStockCount,
    COALESCE(SUM(pr.netWeight), 0) AS totalNetWeight
  FROM mastercategories mc
  JOIN subcategories sc
  JOIN productcategories pc
  LEFT JOIN products pr
    ON pr.mid = mc.id AND pr.sid = sc.id AND pr.pid = pc.id
   AND pr.isSold = 0 AND pr.deletedAt IS NULL
  GROUP BY mc.id, mc.masterCategoryName, sc.id, sc.subCategoryName, pc.id, pc.productCategoryName
  HAVING inStockCount < l_threshold
  ORDER BY inStockCount ASC, mc.masterCategoryName ASC;
END$$
DELIMITER ;
