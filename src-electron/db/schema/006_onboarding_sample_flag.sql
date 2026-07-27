-- =====================================================================
-- SQLite migration version 6 — onboarding sample-data flag
--
-- Adds a flag recording that demo/sample data was loaded into this shop via
-- the in-app "Load sample data" action. It gates the Settings "Remove sample
-- data" control (only offered while sample data is present) and lets the app
-- distinguish a sample-populated shop from a real one (seeded rows are not
-- individually tagged).
-- =====================================================================

ALTER TABLE onboarding_state
  ADD COLUMN sampleDataLoaded INTEGER NOT NULL DEFAULT 0 CHECK (sampleDataLoaded IN (0, 1));
