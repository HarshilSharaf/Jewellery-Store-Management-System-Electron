DROP procedure IF EXISTS `get_top_product_categories`;
DELIMITER $$
CREATE PROCEDURE `get_top_product_categories`(
  IN p_numberOfCategories INT
)
BEGIN
  DECLARE l_totalWeight DECIMAL(14, 3);

  SELECT COALESCE(SUM(A.netWeight), 0) INTO l_totalWeight
    FROM products A
   WHERE A.isSold = 1
     AND A.deletedAt IS NULL;

  IF l_totalWeight = 0 THEN
    SET l_totalWeight = 1;
  END IF;

  SELECT
    B.productCategoryName,
    SUM(A.netWeight) AS total_weight,
    ROUND(SUM(A.netWeight) * 100 / l_totalWeight, 2) AS percentage
  FROM products A
  INNER JOIN productcategories B ON A.pid = B.id
  WHERE A.isSold = 1
    AND A.deletedAt IS NULL
  GROUP BY A.pid
  ORDER BY total_weight DESC
  LIMIT p_numberOfCategories;
END$$
DELIMITER ;
