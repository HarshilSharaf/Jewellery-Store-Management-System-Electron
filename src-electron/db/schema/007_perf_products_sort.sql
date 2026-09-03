-- Covering index for the inventory list query:
--   WHERE deletedAt IS NULL AND isSold = 0  ORDER BY createdAt DESC
-- Without it SQLite builds a temporary b-tree for the sort after filtering.
CREATE INDEX IF NOT EXISTS idx_products_deletedAt_isSold_createdAt
  ON products (deletedAt, isSold, createdAt);
