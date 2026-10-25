# Zetaris Lightning recipes

The backend adapter at `backend/app/adapters/zetaris.py` raises
`zetaris: Lightning table recipes pending from infra` until infra publishes a queryable name
whose first five columns are, in this order:

| # | Column | Type | Meaning |
|---|---|---|---|
| 1 | `source_id` | string | stable source id, e.g. `open-meteo:lagos` |
| 2 | `raw_value` | double | the number as the source reported it |
| 3 | `unit` | string | `ugm3`, `ppb`, `c`, `mw`, … — never guessed |
| 4 | `distance_km` | double, nullable | distance from the queried point, null when unknown |
| 5 | `observed_at` | string | ISO-8601 timestamp from the source, not ingest time |

Extra columns may follow; the adapter reads the first five and ignores the rest.

## The recipe (registered and live, 25 Oct)

```
haqi_views.air_quality_readings
```

| Property | Value |
|---|---|
| Query name | `haqi_views.air_quality_readings` |
| Kind | schema-store view over a Lightning REST table |
| Underlying table | `HAQI.AIR_QUALITY` (Lightning database `HAQI`, table id 816) |
| Source | Open-Meteo air quality, point 6.5244 N / 3.3792 E (Lagos), `timezone=UTC` |
| Credential | none — this endpoint is keyless, which is why it could be built today |
| Freshness | hourly; `observed_at` is the source's hour stamp, UTC |
| Row count | exactly one per query (the endpoint returns its `current` object) |

Verified output:

```
source_id        raw_value  unit   distance_km  observed_at
open-meteo:lagos  15.0       ugm3   (null)       2026-10-25T15:00:00Z
```

`infra/zetaris/check-recipe.ps1 -Table haqi_views.air_quality_readings` exits 0.

### How it was built

```sql
-- 1. container for source tables
CREATE LIGHTNING DATABASE HAQI DESCRIBE BY 'Haqi live sources'

-- 2. REST table: the endpoint is called and the JSON schema is inferred
CREATE LIGHTNING REST TABLE AIR_QUALITY FROM HAQI REQUEST (
  endpoint 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=6.5244&longitude=3.3792&current=pm2_5,pm10,us_aqi&timezone=UTC',
  method 'GET',
  http_encoding 'URLENCODED',
  response_type 'JSON',
  insecure_ssl 'false'
) HEADER () BODY ()

-- 3. the inferred table is nested: a single struct column `current` holds the reading
--    (DESCRIBE HAQI.AIR_QUALITY shows current struct<interval,pm10,pm2_5,time,us_aqi>)

-- 4. a view reshapes it to the backend contract, in order
CREATE SCHEMASTORE CONTAINER haqi_views
CREATE SCHEMASTORE VIEW air_quality_readings WITH CONTAINER haqi_views AS
SELECT 'open-meteo:lagos'               AS source_id,
       current.pm2_5                    AS raw_value,
       'ugm3'                           AS unit,
       CAST(NULL AS DOUBLE)             AS distance_km,
       concat(current.time, ':00Z')     AS observed_at
FROM HAQI.AIR_QUALITY
```

Notes that cost time and are worth keeping:

- The syntax is in the vendor's public **Lightning Command Reference**
  (`zetaris/getting-started`, section 6). It is not in `zetaris-platform.zip`, and the bundle's
  UI has no REST wizard, so the command has to be typed into the SQL editor.
- Statements run **one per request**; the editor splits on semicolons.
- `CREATE LIGHTNING REST TABLE` does **not** let you name the columns. It infers them from the
  JSON, so a nested response becomes struct columns. The contract is met by a view on top, not
  by the REST table itself.
- `TEST REST REQUEST (…) HEADER () BODY ()` previews status, headers and body without creating
  anything. Use it first on every new endpoint.
- `current.time` is minute precision (`2026-10-25T15:00`); `:00Z` makes it a real ISO instant.
  A plain string would compare as text and break window filters.
- Reads appear to hit the endpoint per query (0.7–1.6 s, live `observed_at`), not a stored copy.
  Open-Meteo's free tier is roughly 10k requests a day — fine for a demo, not for a polling loop.

Discovery, still valid:

| Statement | Result |
|---|---|
| `SHOW LIGHTNING DATABASES` | `HAQI` (815), `NY_TAXI` (6), `TPCDS_DB` (307) |
| `SHOW LIGHTNING TABLES <DB>` | tables with `table_type` (`filestore`, `rest`) and `format` |
| `SHOW TABLES IN <DB>` | `table_identifier`, `catalog_name`, `catalog_type` |
| `DESCRIBE <DB>.<TABLE>` | `col_name`, `data_type`, `comment` |
| `DESCRIBE DATASOURCE TABLE <DB>.<TABLE>` | same, works for REST and file tables |
| `SHOW DATASOURCE VIEWS` | `AIR_QUALITY_READINGS | Schema Store View | query_builder` |
| `SHOW DATASOURCES` | external JDBC sources — empty here, and not needed for REST |

`SHOW DATABASES` and `SHOW LIGHTNING TABLES IN <DB>` are invalid and return an empty `400`.
That is the parser, not auth.

## Still open

The recipe unblocks the backend, but only for one metric and one point:

- **PM2.5 only.** `raw_value` is `current.pm2_5`. PM10 and the US AQI are present in the
  source response; adding them means extra rows with their own `source_id` suffix (e.g.
  `open-meteo:lagos:pm10`) and their own unit, not extra columns.
- **REST sources with credentials are not registered.** WAQI, OpenAQ, OpenWeather and NASA
  FIRMS all need keys from `.env` that are still blank. Once they land, the pattern is the
  same: `TEST REST REQUEST`, `CREATE LIGHTNING REST TABLE`, then a view that maps to the
  contract. WAQI/OpenAQ responses are JSON arrays, so the inferred table will have one row per
  station reading rather than one struct row.
- **Filters.** WAQI takes `lat/lng` per request, so a per-question radius needs either one table
  per city or a materialised table refreshed on a schedule. Decide with backend before adding.
- **Drop / update.** `DROP LIGHTNING DATABASE TABLE <DB>.<TABLE>` removes a table;
  `UPDATE LIGHTNING FILESTORE TABLE` has a documented path-required quirk on 2.4.3.1. Nothing
  here has been dropped or updated yet.

## Definition of done

- [x] A Lightning database for our sources exists (`HAQI`).
- [x] One table matching the contract (`haqi_views.air_quality_readings`).
- [x] `check-recipe.ps1 -Table haqi_views.air_quality_readings` exits 0.
- [x] A query returns `observed_at` within the last hour.
- [ ] Remaining sources registered (blocked on their API keys).
- [ ] Backend adapter pointed at the recipe and `smoke_test.py` re-run.

## Validate

```powershell
# rules only, no network
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -SelfTest

# the live recipe
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -Table haqi_views.air_quality_readings
```

It runs `SELECT 1` first, so "bad key" and "no such table" never look the same.

`discover.sql` is the same inspection as a runnable script.

## Rules

- Never paste the API key into a recipe, a query, this file, a commit or a chat message.
  `check-recipe.ps1` reads it from `.env`.
- Never edit the `metastore` database by hand. Read-only inspection is fine.
- Keep `TEST REST REQUEST` as the first step for any new endpoint: it shows the body without
  creating an object you then have to drop.
