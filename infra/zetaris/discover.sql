-- Read-only inspection of the local Zetaris install.
-- Run one statement per request: the SQL editor splits on semicolons.
-- The parser is strict: an unknown shape returns an empty 400, not a helpful error.

-- Databases registered in this install.
-- HAQI (815) holds our sources; NY_TAXI (6) and TPCDS_DB (307) are samples.
SHOW LIGHTNING DATABASES;

-- Tables inside one database, with provider and format. AIR_QUALITY shows as table_type=rest.
SHOW LIGHTNING TABLES HAQI;

-- Fully qualified identifiers only.
SHOW TABLES IN HAQI;

-- REST tables infer their columns from the JSON response; this one is a nested struct.
DESCRIBE HAQI.AIR_QUALITY;

-- The published recipe: a view shaped to the backend contract.
DESCRIBE haqi_views.air_quality_readings;

-- What the backend will run. Expect one row, observed_at within the hour.
SELECT source_id, raw_value, unit, distance_km, observed_at
FROM haqi_views.air_quality_readings;

-- Views registered in this organisation.
SHOW DATASOURCE VIEWS;

-- External JDBC sources. Empty here; REST sources do not appear in this list.
SHOW DATASOURCES;

-- Preview any new endpoint before creating an object (read-only, nothing persisted).
-- TEST REST REQUEST (
--   endpoint 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=6.5244&longitude=3.3792&current=pm2_5&timezone=UTC',
--   method 'GET', http_encoding 'URLENCODED', response_type 'JSON', insecure_ssl 'false'
-- ) HEADER () BODY ()
