# API integration note for the frontend (backend->UI handoff)

Who reads this: UI lead. Everything below is live on `main` right now, backed by
tests. Shapes are contract-fixed (CONTRACTS.md); field naming matches the live
JSON byte-for-byte.

## Endpoints (same-origin `/api/...` in prod; add your dev proxy at 5173->8000)

| Route | Method | Purpose |
|---|---|---|
| `/api/today?lat=6.5244&lon=3.3792` | GET | verdict for right now (Lagos default) |
| `/api/ask` | POST | one question in, verdict that answers the PLAN out |
| `/api/why/{ledger_id}` | GET | evidence graph for a receipt (nodes/edges) |
| `/api/sources/status` | GET | armed/blind sources (failure-flex page) |
| `/api/proof` | GET | machine-readable self-audit for judges |
| `/api/health` | GET | liveness |

## POST /api/ask body

```json
{ "question": "can Chidi play football at 4 pm?",
  "lat": 6.5244, "lon": 3.3792,
  "profile": "asthma" | "pollen_allergy" | "copd" | "athlete" | "general" }
```

`profile` optional — detection falls back heuristically; send it when the kid
picks their tag in your onboarding.

## Verdict shape (the ONLY user-visible payload)

```json
{
  "schema_version": 1,
  "level": "good to go" | "be careful" | "stay in",
  "window": "at 4pm",
  "reason": "air is fine near you",        // <=1 sentence, kid-readable
  "aqi": 6,                                 // null when sources were stale/blind
  "evidence": [ <Evidence+> ],              // see below
  "blind_spots": ["we couldn't reach ..."],
  "ledger_id": "ledger-xxxxxxxx",
  "fallback": false
}
```

**`fallback: true` = fixture/demo data.** Style it differently (badge/eyebrow)
and never treat it as a live run — this is brand-critical.

## Evidence rows (for your cards)

```json
{ "claim": "city AQI 20 (~4 µg/m³ PM2.5-equivalent)",
  "source_id": "waqi:geo", "source_type": "station|satellite|forecast|advisory",
  "retrieved_at": "...", "observed_at": "...",
  "geo_distance_km": 1.04, "raw_value": 4.0, "unit": "µg/m³",
  "confidence": 0.5, "staleness_flag": true, "weight": 0.088 }
```

Card recipe used by the backend today: `source_type` -> icon;
`weight` -> glanceability; `staleness_flag` -> dashed/gray + age text.

## Error model (judge-visible, keep it)

Never a blank 500. Errors arrive as
`{"schema_version":1, "error": "plain words", "fallback": <verdict|null>}`
HTTP 503. Render `error` in plain words and the `fallback` verdict if present.

## Try it now (no-keys demo mode)

`uvicorn app.main:app` runs without any keys: verdicts come back honest-uncertain
with fixture answers labelled. Golden fixtures also live in
`backend/app/fixtures/{today,why}.json` if you need pure-frontend mock data.

## Copy tone

Persona: Chidi, 14, mild asthma, Lagos. Reason strings are already kid-readable —
don't paraphrase them; render verbatim.
