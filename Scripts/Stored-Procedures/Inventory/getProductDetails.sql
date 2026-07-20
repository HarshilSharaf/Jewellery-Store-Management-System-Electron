DROP procedure IF EXISTS `get_product_details`;
DELIMITER $$
CREATE PROCEDURE `get_product_details` (
  IN p_productGuid CHAR(36)
)
BEGIN
  SELECT
    p.id,
    p.productGuid,
    p.sku,
    p.huid,
    p.purityCode,
    pu.label            AS purityLabel,
    pu.metalType        AS metalType,
    pu.fineness         AS purityFineness,
    p.productDescription,
    p.grossWeight,
    p.netWeight,
    p.stoneWeight,
    p.stoneCharges,
    p.makingMode,
    p.makingValue,
    p.wastagePercent,
    p.costPrice,
    p.tagPrice,
    p.hsnCode,
    p.imagePath,
    p.mid               AS masterCategoryId,
    p.sid               AS subCategoryId,
    p.pid               AS productCategoryId,
    m.masterCategoryName,
    s.subCategoryName,
    pc.productCategoryName,
    p.isSold,
    p.createdAt,
    p.updatedAt
  FROM products p
  LEFT JOIN purities        pu ON p.purityCode = pu.code
  LEFT JOIN mastercategories m ON p.mid = m.id
  LEFT JOIN subcategories    s ON p.sid = s.id
  LEFT JOIN productcategories pc ON p.pid = pc.id
  WHERE p.productGuid = p_productGuid;
END$$
DELIMITER ;
