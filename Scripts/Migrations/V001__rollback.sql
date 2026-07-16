-- =====================================================================
-- V001 - Rollback
-- =====================================================================
-- Reverses V001__add_guid_and_soft_delete_indexes.sql.
-- Uses a dynamic-SQL wrapper so a partial roll-forward can still be rolled
-- back cleanly (missing indexes are silently skipped).
--
-- Note: `products_product_guid` (the historical unique key defined in
-- Scripts/Tables/Products.sql) is intentionally NOT dropped here; it was
-- created outside this migration.
-- =====================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `__v001_drop_index_if_present` $$
CREATE PROCEDURE `__v001_drop_index_if_present`(
  IN in_table VARCHAR(64),
  IN in_index VARCHAR(64)
)
BEGIN
  DECLARE existing INT DEFAULT 0;

  SELECT COUNT(1) INTO existing
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = in_table
     AND INDEX_NAME   = in_index;

  IF existing > 0 THEN
    SET @__ddl = CONCAT('ALTER TABLE `', in_table, '` DROP INDEX `', in_index, '`');
    PREPARE stmt FROM @__ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL `__v001_drop_index_if_present`('customers', 'uk_customers_customerGuid');
CALL `__v001_drop_index_if_present`('customers', 'idx_customers_deletedAt');

CALL `__v001_drop_index_if_present`('invoices',  'uk_invoices_invoiceGuid');
CALL `__v001_drop_index_if_present`('invoices',  'idx_invoices_cancelledAt_createdAt');

CALL `__v001_drop_index_if_present`('payments',  'uk_payments_paymentGuid');

CALL `__v001_drop_index_if_present`('products',  'idx_products_deletedAt_isSold');
CALL `__v001_drop_index_if_present`('products',  'uk_products_productGuid');

DROP PROCEDURE IF EXISTS `__v001_drop_index_if_present`;
