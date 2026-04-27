-- Drop the api_keys table created by 20260427_api_keys.sql.
--
-- Rationale: the UI surface that read/wrote this table revealed which providers
-- the app uses (mask + provider slug), which is itself an attack signal.
-- Removed in favor of plain process.env reads. The corresponding UI/API/lib
-- code was deleted in the same change.

DROP TRIGGER IF EXISTS trg_api_keys_touch ON api_keys;
DROP FUNCTION IF EXISTS api_keys_touch_updated_at();
DROP TABLE IF EXISTS api_keys;
