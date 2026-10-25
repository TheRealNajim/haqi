-- Read-only inspection of the local Zetaris install.
-- Run one statement at a time through the SQL editor (UI :3000) or the REST API (:8888).
-- The parser is strict: an unknown shape returns an empty 400, not a helpful error.

-- Databases registered in this install.
SHOW LIGHTNING DATABASES;

-- Tables inside one database, with their provider and storage format.
SHOW LIGHTNING TABLES NY_TAXI;

-- Same set, alternative shape: fully qualified identifiers only.
SHOW TABLES IN NY_TAXI;

-- Columns of one table: col_name | data_type | comment.
DESCRIBE NY_TAXI.customers;

-- Column names only.
SHOW COLUMNS IN NY_TAXI.customers;

-- Non-Lightning sources. Empty on a fresh install; sample data is filestore only.
SHOW DATASOURCES;

-- After a recipe lands, this must return rows whose observed_at is recent.
-- Replace HAQI.AIR_QUALITY with the registered name.
-- SELECT source_id, raw_value, unit, distance_km, observed_at
-- FROM HAQI.AIR_QUALITY
-- ORDER BY observed_at DESC
-- LIMIT 10;
