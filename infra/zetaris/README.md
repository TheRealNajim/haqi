# Zetaris Lightning recipes

The backend adapter at `backend/app/adapters/zetaris.py` is fully built but refuses to run:
it raises `zetaris: Lightning table recipes pending from infra` until infra publishes

1. a table name, and
2. the fact that its first five columns are, in this order:

| # | Column | Type | Meaning |
|---|---|---|---|
| 1 | `source_id` | string | stable source id, e.g. `waqi:lagos-1417` |
| 2 | `raw_value` | double | the number as the source reported it |
| 3 | `unit` | string | `ugm3`, `ppb`, `c`, `mw`, … — never guessed |
| 4 | `distance_km` | double, nullable | distance from the queried point, null when unknown |
| 5 | `observed_at` | string | ISO-8601 timestamp from the source, not ingest time |

Extra columns may follow; the adapter reads the first five and ignores the rest.

This folder holds the evidence and the acceptance test for that handoff. It does **not**
contain the recipe yet, because no REST table exists in this install — see "The gap" below.

## What is registered right now (verified 25 Oct)

```sql
SHOW LIGHTNING DATABASES;
-- NY_TAXI   | NY Taxi sample data          | 6
-- TPCDS_DB  | TPC-DS benchmark sample data  | 307

SHOW LIGHTNING TABLES NY_TAXI;
-- name       | materialized_table | source_table                                    | table_type | format | id
-- customers  |                    | s3a://zetaris-public-dataset/ny_taxi/customers  | filestore  | csv    | 7
-- ... 15 rows total

SHOW TABLES IN NY_TAXI;
-- table_identifier       | catalog_name | catalog_type
-- NY_TAXI.customers      | NY_TAXI      | Lightning Database

DESCRIBE NY_TAXI.customers;
-- col_name | data_type | comment
```

Command shapes that are **confirmed** on the local REST API (`:8888`):

| Statement | Result |
|---|---|
| `SHOW LIGHTNING DATABASES` | one row per Lightning database |
| `SHOW LIGHTNING TABLES <DB>` | tables in that database, with `table_type` and `format` |
| `SHOW TABLES IN <DB>` | `table_identifier`, `catalog_name`, `catalog_type` |
| `DESCRIBE <DB>.<TABLE>` | `col_name`, `data_type`, `comment` |
| `SHOW COLUMNS IN <DB>.<TABLE>` | column names only |
| `SHOW DATASOURCES` | registered non-Lightning data sources (currently none) |

`SHOW DATABASES` and `SHOW LIGHTNING TABLES IN <DB>` are **not** valid and return an empty
`400`. That is not an auth problem; it is the parser.

Metastore counts, read directly from the `metastore` database:

| Table | Rows |
|---|---|
| `lightning_database` | 2 |
| `filestore_table` | 39 |
| `lightning_rest_table` | 0 |
| `lightning_rest_table_schema` | 0 |
| `datasource` | 0 |
| `datasource_relation` | 0 |

## The gap

The platform models REST tables — `lightning_rest_table`, `lightning_rest_table_schema`,
`lightning_rest_table_option`, `http_request_param`, and the `datasource*` family all exist
in the metastore. What is missing is a supported way to create one in this build
(API `2.4.3.1`, UI bundle served from `:3000`):

- the UI's source tour covers file sources only (`CREATE LIGHTNING DATABASE`, then
  `CREATE LIGHTNING FILESTORE TABLE`); no REST-source wizard string exists in the bundle;
- the SQL parser rejects `CREATE LIGHTNING REST TABLE`, `CREATE LIGHTNING`, and
  `SHOW LIGHTNING` with an empty `400` — so the exact grammar is unknown, not merely unused;
- no example of a REST registration exists in `zetaris-platform.zip`, and the API ships no
  OpenAPI document (`/v3/api-docs`, `/swagger-ui`, `/openapi.json` are all 404).

So the recipe cannot be produced by guessing. Writing rows straight into
`lightning_rest_table` is also not an option: the engine reads its own in-memory/Spark
catalogue, so hand-inserted metadata would look registered and fail at query time.

**Ask the Zetaris coordinator (one message, all three questions):**

1. In 2.4.3.1, what is the supported way to register a REST/HTTP table — UI path, SQL
   grammar, or REST endpoint?
2. Is a REST table queried live per request, or must it be materialised first?
3. Does the live query path require an outbound proxy allow-list entry for
   `api.waqi.info`, `api.openweathermap.org`, `firms.modaps.eosdis.nasa.gov`?

Record the answer here, then register exactly what was documented.

## Definition of done

- [ ] A Lightning database for our sources exists (proposal: `HAQI`).
- [ ] One table per source, first five columns matching the contract above.
- [ ] `check-recipe.ps1 -Table <DB>.<TABLE>` exits 0.
- [ ] A representative query returns rows whose `observed_at` is within the last hour.
- [ ] The table name and column order are added to this file and to `infra/RUNBOOK.md`.
- [ ] Backend lead is told the recipe; `smoke_test.py` still passes the Zetaris check.

Proposed naming (needs backend sign-off, do not register yet):

| Contract | Proposed table | Source |
|---|---|---|
| air-quality readings | `HAQI.AIR_QUALITY` | WAQI / OpenAQ |
| fire detections | `HAQI.FIRE_DETECTIONS` | NASA FIRMS |
| weather | `HAQI.WEATHER` | OpenWeather |

`source_id` keeps OpenAQ and WAQI in one table without duplicating the schema.

## Validate the contract

```powershell
# rules only, no network - proves the checker matches the backend contract
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -SelfTest

# the real test, once a table exists
powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -Table HAQI.AIR_QUALITY
```

It runs `SELECT 1` first, so "bad key" and "no such table" never look the same. Exit code 0
means the backend adapter can be unblocked by publishing the table name; nothing else is
needed from Zetaris.

`discover.sql` in this folder is the same inspection as a runnable script.

## Rules

- Never paste the API key into a recipe, a query, this file, a commit or a chat message.
  `check-recipe.ps1` reads it from `.env`.
- Never edit the `metastore` database by hand. Read-only inspection is fine.
- Do not register sources before the build window opens; recipes and checks only.
