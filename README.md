# haqi — Healthy Air Quality Intelligence

A kid asks "can I play outside?" — haqi investigates live air-quality data across
scattered sources and answers with a verdict a 14-year-old understands in one glance,
plus the evidence chain behind it.

Built for Open Agent Hackathon 2026, Track 02 (The Agent That Can Explain Why).

## Layout

```
backend/    FastAPI service: adapters (data sources), trust scoring, verdicts
frontend/   fixtures the UI renders before/independent of the backend
infra/      deployment + sponsor-platform setup notes
```

## Try the backend

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
# GET http://localhost:8000/today?lat=28.61&lon=77.21
```

With no keys set, `/today` falls back to the golden fixture — the service still
answers, it just says what it could not see. Health probe: `/health`.

## Environment variables (set in your own .env, never committed)

| Variable | Source | Needed for |
|---|---|---|
| `OPENAQ_API_KEY` | openaq.org | ground stations primary |
| `WAQI_TOKEN` | waqi.info | ground stations fallback |
| `OPENWEATHER_API_KEY` | openweathermap.org | wind/dispersion |
| `NASA_FIRMS_MAP_KEY` | firms.modaps.eosdis.nasa.gov | wildfire smoke |
| `ZETARIS_REST_URL` | sponsor platform | SQL over structured env data |
| `ZETARIS_ORG_ID` | sponsor platform | ditto |
| `ZETARIS_API_KEY` | sponsor platform | ditto |
| `MODEL_BASE_URL` | Meterless or build.nvidia.com | agent reasoning route |
| `MODEL_API_KEY` | same route as above | ditto |
| `NEMOTRON_MODEL` | same route as above | ditto |

Every missing source degrades gracefully: the verdict lists the blind spot in
plain words instead of guessing.

## Workflow (strict)

- `main` is golden — no direct pushes. Branch `feat/backend-*` / `feat/frontend-*` /
  `feat/infra-*`, push the branch only with tests green, PR into `main`.
- One logical unit of work per commit; plain-language messages; production files only.
- Never stage: secrets (`*.env`), planning docs, or agent scratch notes.
- Tests must pass before any push. Backend: `pytest backend/tests`.

## Team coordination

The detailed ground truth (SPEC, decisions log, contracts) lives outside this repo
with the coordinator. Ask before you touch another area's files.
