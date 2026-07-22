DROP procedure IF EXISTS `get_stock_summary_by_purity`;
DELIMITER $$
CREATE PROCEDURE `get_stock_summary_by_purity`(
  IN p_asOfDate DATE
)
BEGIN
  DECLARE l_asOfDate DATE;

  SET time_zone = 'SYSTEM';
  SET l_asOfDate = COALESCE(p_asOfDate, CURDATE());

  SELECT
    pu.code               AS purityCode,
    pu.label              AS purityLabel,
    pu.metalType,
    pu.fineness,
    COUNT(pr.id)          AS unitCount,
    COALESCE(SUM(pr.netWeight), 0)   AS netWeightGrams,
    COALESCE(SUM(pr.grossWeight), 0) AS grossWeightGrams,
    COALESCE(SUM(pr.tagPrice), 0)    AS totalTagPrice,
    COALESCE(SUM(pr.costPrice), 0)   AS totalCostPrice
  FROM purities pu
  LEFT JOIN products pr
    ON pr.purityCode = pu.code
   AND pr.isSold = 0
   AND pr.deletedAt IS NULL
   AND DATE(pr.createdAt) <= l_asOfDate
  WHERE pu.active = 1
  GROUP BY pu.code, pu.label, pu.metalType, pu.fineness
  ORDER BY pu.metalType ASC, pu.sortOrder ASC;
END$$
DELIMITER ;
