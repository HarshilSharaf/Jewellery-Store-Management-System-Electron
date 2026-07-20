DROP procedure IF EXISTS `get_purities`;
DELIMITER $$
CREATE PROCEDURE `get_purities`()
BEGIN
  SELECT code, label, metalType, fineness, sortOrder, active
    FROM purities
   WHERE active = 1
   ORDER BY metalType, sortOrder;
END$$
DELIMITER ;
