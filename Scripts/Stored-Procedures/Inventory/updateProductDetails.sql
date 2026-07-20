DROP procedure IF EXISTS `update_product_details`;
DELIMITER $$
CREATE PROCEDURE `update_product_details` (
  IN p_productGuid        CHAR(36),
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
  IN p_mid                INT,
  IN p_sid                INT,
  IN p_pid                INT
)
BEGIN
  UPDATE products
     SET sku                = p_sku,
         huid               = p_huid,
         purityCode         = p_purityCode,
         productDescription = p_productDescription,
         grossWeight        = p_grossWeight,
         netWeight          = p_netWeight,
         stoneWeight        = p_stoneWeight,
         stoneCharges       = p_stoneCharges,
         makingMode         = COALESCE(p_makingMode, makingMode),
         makingValue        = p_makingValue,
         wastagePercent     = p_wastagePercent,
         costPrice          = p_costPrice,
         tagPrice           = p_tagPrice,
         hsnCode            = COALESCE(p_hsnCode, hsnCode),
         mid                = p_mid,
         sid                = p_sid,
         pid                = p_pid
   WHERE productGuid = p_productGuid;
END$$
DELIMITER ;
