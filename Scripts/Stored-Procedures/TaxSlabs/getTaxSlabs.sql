DROP procedure IF EXISTS `get_tax_slabs`;
DELIMITER $$
CREATE PROCEDURE `get_tax_slabs`()
BEGIN
  SELECT id, hsnCode, name, cgstRate, sgstRate, igstRate, active, effectiveFrom
    FROM taxslabs
   WHERE active = 1
   ORDER BY hsnCode, effectiveFrom DESC;
END$$
DELIMITER ;
