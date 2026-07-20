DROP procedure IF EXISTS `get_revenue_of_six_months`;
DELIMITER $$
CREATE PROCEDURE `get_revenue_of_six_months`()
BEGIN
  DECLARE current_count DECIMAL(14, 2);
  DECLARE previous_count DECIMAL(14, 2);
  DECLARE percent_increase DOUBLE(5, 2);
  DECLARE total DECIMAL(14, 2);

  SET time_zone = 'SYSTEM';

  SELECT COALESCE(SUM(grandTotal), 0) INTO current_count
    FROM invoices
   WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
     AND cancelledAt IS NULL;

  SELECT COALESCE(SUM(grandTotal), 0) INTO previous_count
    FROM invoices
   WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
     AND createdAt <  DATE_SUB(NOW(), INTERVAL 1 MONTH)
     AND cancelledAt IS NULL;

  IF previous_count = 0 THEN
    SET percent_increase = 100.0;
  ELSE
    SET percent_increase = ((current_count - previous_count) / previous_count) * 100.0;
  END IF;

  IF percent_increase IS NULL THEN
    SET percent_increase = 0;
  END IF;

  SELECT COALESCE(SUM(grandTotal), 0) INTO total
    FROM invoices
   WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
     AND cancelledAt IS NULL;

  SELECT total, percent_increase;
END$$
DELIMITER ;
