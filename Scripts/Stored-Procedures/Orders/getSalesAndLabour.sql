DROP procedure IF EXISTS `get_sales_labour`;
DELIMITER $$
CREATE PROCEDURE `get_sales_labour`(
  IN p_timeInterval INT
)
BEGIN
  DECLARE cutoffDate DATE;
  DECLARE monthYearFormat CHAR(7) DEFAULT '%Y-%m';

  SET cutoffDate = DATE_SUB(NOW(), INTERVAL p_timeInterval MONTH);

  SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'month_year', month_year,
      'sales', sales,
      'labour', labour
    )
  ) AS monthlySalesAndLabour
  FROM (
    SELECT DATE_FORMAT(createdAt, monthYearFormat) AS month_year,
           SUM(grandTotal) AS sales,
           SUM(totalMakingCharge + totalWastageCharge) AS labour
      FROM invoices
     WHERE createdAt >= cutoffDate
       AND cancelledAt IS NULL
     GROUP BY DATE_FORMAT(createdAt, monthYearFormat)
     HAVING SUM(grandTotal) > 0
     ORDER BY month_year
  ) AS sales_labour;
END$$
DELIMITER ;
