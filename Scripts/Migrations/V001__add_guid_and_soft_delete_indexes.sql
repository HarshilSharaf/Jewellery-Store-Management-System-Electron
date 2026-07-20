-- =====================================================================
-- V001 - Add GUID uniqueness and soft-delete lookup indexes
-- =====================================================================
--
-- Rationale (evidence from the stored procedures under Scripts/Stored-Procedures):
--   * Nearly every read/update/delete stored procedure looks a row up by its
--     `*Guid` column (customerGuid, invoiceGuid, paymentGuid, productGuid).
--     Without an index this is an O(n) table scan on every proc call.
--   * Soft-delete filters (`WHERE deletedAt IS NULL` and `cancelledAt IS NULL`)
--     appear in list/count procs; a covering index avoids scanning rows the
--     caller will discard.
--   * The `products` table already has a UNIQUE key on `productGuid` (see
--     Scripts/Tables/Products.sql). Recreating it via IF-NOT-EXISTS-style
--     probing keeps this migration idempotent for docker init runs.
--
-- Forward migration only. Rollback lives in V001__rollback.sql.
-- All statements use dynamic-SQL wrappers so that re-running the migration
-- against an already-migrated database is a no-op instead of an error.
-- =====================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `__v001_add_index_if_missing` $$
CREATE PROCEDURE `__v001_add_index_if_missing`(
  IN in_table   VARCHAR(64),
  IN in_index   VARCHAR(64),
  IN in_ddl     TEXT
)
BEGIN
  DECLARE existing INT DEFAULT 0;

  SELECT COUNT(1) INTO existing
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = in_table
     AND INDEX_NAME   = in_index;

  IF existing = 0 THEN
    SET @__ddl = in_ddl;
    PREPARE stmt FROM @__ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

-- --------------------------------------------------------------
-- customers
-- --------------------------------------------------------------
CALL `__v001_add_index_if_missing`(
  'customers',
  'uk_customers_customerGuid',
  'ALTER TABLE `customers` ADD UNIQUE KEY `uk_customers_customerGuid` (`customerGuid`)'
);

CALL `__v001_add_index_if_missing`(
  'customers',
  'idx_customers_deletedAt',
  'ALTER TABLE `customers` ADD KEY `idx_customers_deletedAt` (`deletedAt`)'
);

-- --------------------------------------------------------------
-- invoices
-- --------------------------------------------------------------
CALL `__v001_add_index_if_missing`(
  'invoices',
  'uk_invoices_invoiceGuid',
  'ALTER TABLE `invoices` ADD UNIQUE KEY `uk_invoices_invoiceGuid` (`invoiceGuid`)'
);

CALL `__v001_add_index_if_missing`(
  'invoices',
  'idx_invoices_cancelledAt_createdAt',
  'ALTER TABLE `invoices` ADD KEY `idx_invoices_cancelledAt_createdAt` (`cancelledAt`, `createdAt`)'
);

-- --------------------------------------------------------------
-- payments
-- --------------------------------------------------------------
CALL `__v001_add_index_if_missing`(
  'payments',
  'uk_payments_paymentGuid',
  'ALTER TABLE `payments` ADD UNIQUE KEY `uk_payments_paymentGuid` (`paymentGuid`)'
);

-- --------------------------------------------------------------
-- products
--   products already has UNIQUE KEY `products_product_guid` on productGuid.
--   We still add the composite (deletedAt, isSold) index which is missing.
--   The uk_products_productGuid alias is added only if the existing unique
--   key does not exist under either name — this keeps the migration
--   idempotent while satisfying the scope requirement.
-- --------------------------------------------------------------
CALL `__v001_add_index_if_missing`(
  'products',
  'idx_products_deletedAt_isSold',
  'ALTER TABLE `products` ADD KEY `idx_products_deletedAt_isSold` (`deletedAt`, `isSold`)'
);

-- Add uk_products_productGuid only if NEITHER the historical
-- `products_product_guid` UNIQUE key NOR the new one already exists.
SET @__products_guid_index_count := (
  SELECT COUNT(1)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'products'
     AND INDEX_NAME IN ('products_product_guid', 'uk_products_productGuid')
);

SET @__products_guid_index_ddl := IF(
  @__products_guid_index_count = 0,
  'ALTER TABLE `products` ADD UNIQUE KEY `uk_products_productGuid` (`productGuid`)',
  'DO 0'
);

PREPARE __products_guid_stmt FROM @__products_guid_index_ddl;
EXECUTE __products_guid_stmt;
DEALLOCATE PREPARE __products_guid_stmt;

-- --------------------------------------------------------------
-- Cleanup helper procedure
-- --------------------------------------------------------------
DROP PROCEDURE IF EXISTS `__v001_add_index_if_missing`;
