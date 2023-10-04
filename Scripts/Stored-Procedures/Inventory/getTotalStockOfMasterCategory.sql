DROP procedure IF EXISTS `get_total_stock_of_master_category`;
DELIMITER $$
CREATE PROCEDURE `get_total_stock_of_master_category` (
IN p_categoryId INT
)
BEGIN
	DECLARE current_count INT;
    DECLARE previous_count INT;
	DECLARE percent_increase DOUBLE(5, 2);
    DECLARE total INT;
	
	-- Get the current weight of products
    SELECT SUM(productWeight) INTO current_count FROM products WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    AND isSold = 0
    AND mid = p_categoryId
    AND deletedAt IS NULL;
    
	-- Get the weight of products 6 months ago
    SELECT SUM(productWeight) INTO previous_count FROM products WHERE createdAt < DATE_SUB(NOW(), INTERVAL 6 MONTH)
	AND mid = p_categoryId
    AND deletedAt IS NULL;

	IF previous_count = 0 THEN
        SET percent_increase = 100.0;
    ELSE
        SET percent_increase = ((current_count - previous_count) / previous_count) * 100.0;
    END IF;
    
    IF percent_increase IS NULL THEN
		SET percent_increase = 0;
    END IF;
    
    SELECT SUM(productWeight) INTO total FROM products WHERE isSold = 0 AND deletedAt IS NULL AND mid = p_categoryId;
    
	SELECT total, percent_increase;
    
END$$

DELIMITER ;

