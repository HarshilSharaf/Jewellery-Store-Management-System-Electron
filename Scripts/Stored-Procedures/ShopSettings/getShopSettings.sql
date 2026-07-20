DROP procedure IF EXISTS `get_shop_settings`;
DELIMITER $$
CREATE PROCEDURE `get_shop_settings`()
BEGIN
  SELECT * FROM shopsettings WHERE id = 1;
END$$
DELIMITER ;
