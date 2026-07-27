-- =====================================================================
-- SQLite migration version 3 — targeted performance indexes.
--
-- The baseline schema already indexes FK columns, status/date filters,
-- soft-delete composites and unique constraints. These two fill real gaps
-- observed in the ported query patterns; kept minimal to avoid taxing the
-- single writer or bloating a small POS database with speculative indexes.
-- =====================================================================

-- get_all_orders lists invoices ORDER BY createdAt DESC with NO cancelledAt
-- predicate, so the (cancelledAt, createdAt) composite can't drive the sort.
-- A plain createdAt index lets the busiest list avoid a full sort.
CREATE INDEX IF NOT EXISTS idx_invoices_createdAt ON invoices (createdAt);

-- get_current_metal_rates (hot cart-open path) finds the latest rate per
-- (purityCode, session) via MAX(effectiveDate) grouped by those columns.
-- Leading with purityCode, session makes that an index-driven lookup; the
-- existing unique index leads with effectiveDate, which can't serve it.
CREATE INDEX IF NOT EXISTS idx_metalrates_purity_session_date
  ON metalrates (purityCode, session, effectiveDate);
