-- =====================================================================
-- SQLite migration version 4 — query-optimization indexes.
--
-- From the read/write query audit (EXPLAIN QUERY PLAN verified): two list
-- endpoints fell back to a temp b-tree sort because no index served their
-- "filter by column, ORDER BY createdAt" shape.
-- =====================================================================

-- get_customer_orders filters `soldToCustomer = ?` then ORDER BY createdAt DESC.
-- The single-column idx_invoices_soldToCustomer served the filter but not the
-- sort (temp b-tree). Replace it with a composite that serves both; the
-- composite still covers soldToCustomer-only equality lookups via its lead col.
DROP INDEX IF EXISTS idx_invoices_soldToCustomer;
CREATE INDEX IF NOT EXISTS idx_invoices_soldToCustomer_createdAt
  ON invoices (soldToCustomer, createdAt);

-- get_all_saving_schemes ORDER BY createdAt DESC had no supporting index.
CREATE INDEX IF NOT EXISTS idx_savingschemes_createdAt ON savingschemes (createdAt);
