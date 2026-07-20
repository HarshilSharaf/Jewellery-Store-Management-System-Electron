DROP procedure IF EXISTS `add_product`;
DELIMITER $$
CREATE PROCEDURE `add_product`(
  IN p_sku                VARCHAR(40),
  IN p_huid               CHAR(6),
  IN p_purityCode         VARCHAR(10),
  IN p_productDescription TEXT,
  IN p_grossWeight        DECIMAL(10, 3),
  IN p_netWeight          DECIMAL(10, 3),
  IN p_stoneWeight        DECIMAL(10, 3),
  IN p_stoneCharges       DECIMAL(12, 2),
  IN p_makingMode         VARCHAR(10),
  IN p_makingValue        DECIMAL(12, 2),
  IN p_wastagePercent     DECIMAL(5, 2),
  IN p_costPrice          DECIMAL(12, 2),
  IN p_tagPrice           DECIMAL(12, 2),
  IN p_hsnCode            VARCHAR(8),
  IN p_masterCategoryId   INT,
  IN p_subCategoryId      INT,
  IN p_productCategoryId  INT,
  IN p_imageFileName      TEXT
)
BEGIN
  DECLARE l_imageFileName TEXT DEFAULT NULL;
  DECLARE fileExtension VARCHAR(6) DEFAULT NULL;
  DECLARE l_productGuid CHAR(36);

  SET l_productGuid = UUID();
  SET time_zone = 'SYSTEM';

  IF p_imageFileName IS NOT NULL THEN
    SET fileExtension = SUBSTRING_INDEX(p_imageFileName, '.', -1);
    SET l_imageFileName = CONCAT(UNIX_TIMESTAMP(), '-product-', l_productGuid, '.', fileExtension);
  END IF;

  INSERT INTO products
    (productGuid, sku, huid, purityCode, productDescription,
     grossWeight, netWeight, stoneWeight, stoneCharges,
     makingMode, makingValue, wastagePercent, costPrice, tagPrice,
     hsnCode, imagePath, isSold, mid, sid, pid)
  VALUES
    (l_productGuid, p_sku, p_huid, p_purityCode, p_productDescription,
     p_grossWeight, p_netWeight, p_stoneWeight, p_stoneCharges,
     COALESCE(p_makingMode, 'perGram'), p_makingValue, p_wastagePercent,
     p_costPrice, p_tagPrice, COALESCE(p_hsnCode, '7113'),
     l_imageFileName, 0, p_masterCategoryId, p_subCategoryId, p_productCategoryId);

  SELECT * FROM products WHERE id = LAST_INSERT_ID();
END$$
DELIMITER ;
