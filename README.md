# haqi — Healthy Air Quality Intelligence

A kid asks "can I play outside?" — haqi investigates live air-quality data across
scattered sources and answers with a one-glance verdict a 14-year-old understands,
plus the weighted evidence chain behind it, every receipt logged.

Built for [Open Agent Hackathon 2026](https://hackathon.genai.works/event/open-agent-hackathon-2026), Track 02 — **The Agent That Can Explain Why**.

[Live API](https://haqi-api.onrender.com) · [Frontend](https://haqi-one.vercel.app) · [Slide deck](https://xarkgg.github.io/haqi-deck/) · [Self-audit route](https://haqi-api.onrender.com/proof) · [Setup](#try-the-backend) · [Rubric map](#how-this-fits-the-judging-rubric)

**Status (judge-facing honest split):**

| What is real | What is pending |
|---|---|
| Live API on Render: `/today`, `/ask`, `/why/{id}`, `/sources/status`, `/proof`, `/api/proof`, `/health` | Demo video (pending — will be linked here once it exists) |
| 5 evidence sources live: OpenAQ, WAQI, OpenWeather, NASA FIRMS, Zetaris sponsor view | Demo video in production with the UI lead |
| Trust ledger: every verdict has a receipt; `/why/{id}` renders the graph | Bright Data advisory slot awaits its key (honest `false` until then) |
| NVIDIA Nemotron parse lane (live) | Pollen is `false` by design: CAMS data is Europe-only, the pilot city Lagos is not |
| Meterless Nightshift narration lane: code shipped and tested; the slot reports `configured:false` until the Nightshift host is up (weights download was paused; demo-day plan re-arms it) | Frontend API wiring in progress by the UI lead (fixtures currently) |

## Why build this

Air-quality dashboards tell adults who already know what "PM2.5" means how things
probably are. A kid asking "can I play football at 4" gets raw numbers instead of an
answer. haqi turns the question around: the agent investigates first (ground
stations, satellite fire hotspots, wind dispersion, a sponsor SQL view, a
short-horizon forecast), weighs the readings against each other — trust weights,
staleness, unit conflicts — and answers with good to go / careful / stay in.

Two survivor rules define the product, and they are the opposite of what a
hackathon demo usually does: **partial evidence never becomes a clean answer** (a
stale or missing source is disclosed, never blended away), and **verdict text is
deterministic** — the LLM parses and narrates, it never authors the safety call.

## Try it — no registration route

1. `GET https://haqi-api.onrender.com/today` — the now-verdict for Lagos (Chidi, 14, mild asthma).
2. `POST /ask` with `{"question": "can I cycle in 2 hours", "lat": 6.5244, "lon": 3.3792, "profile": "asthma"}` — the window answers the named plan, including a forecast-horizon honesty check.
3. Take `ledger_id` from any `/ask` response and open `/why/{id}` — the exact evidence graph the frontend renders.
4. `GET /sources/status` — armed/blind state of every source; Zetaris states `reachable` separately from its env-armed state.
5. `GET /proof` — the machine-readable self-audit; each claim names the test that enforces it.

Worked samples: "can I cycle in 2 hours" answers from the forecast bucket covering
that hour; "football at 9 pm" answers "come back nearer the time" — beyond the
forecast horizon the series does not pretend.

## The agent loop

`investigate()` (backend/app/agent.py):

1. **Parse**: NVIDIA Nemotron extracts activity and time. Deterministic time rules
   (`_time_floor()`) always win over the model's time decode — horizon honesty
   depends on the time being exactly right.
2. **Investigate**: one adapter per source, in parallel. The Zetaris adapter joins
   the loop only when its env is present, with a short REST timeout so a down
   tunnel degrades the row honestly instead of stalling the verdict.
3. **Weigh**: consensus per unit group (never blends µg/m³ with AQI); unknown units
   are rejected loudly; stale readings are down-weighted and disclosed — they can
   never produce a green light alone. Profile lungs (asthma first-class) scale the
   exertion dose.
4. **Decide**: threshold model, deterministic strings, zero LLM in the verdict.
5. **Prove**: verdict + evidence + conflicts appended to an append-only JSONL
   ledger; `/why/{id}` serves the receipt as a nodes/edges graph.
6. **Narrate**: Meterless Nightshift reads **only the ledger** and writes one
   kid-readable paragraph (the `/why` `story` field). The prompt forbids new
   facts; any failure and the graph ships without the story field.

## How the sponsor stack is used

The submission-grade write-up is [SPONSOR.md](SPONSOR.md). Summary:

| Sponsor | Where it runs | What it does | Integration artifact |
|---|---|---|---|
| Zetaris Lightning | infra PC, REST tunnel | recipe view `haqi_views.air_quality_readings` — one row = [source_id, raw_value, unit, distance_km, observed_at] | `ZetarisAdapter._sql_for()` emits the exact recipe SQL; `_to_evidence()` quarantines malformed rows visibly (weight 0) instead of silently dropping them; `tests/test_zetaris.py` |
| Meterless Nightshift | infra PC, REST tunnel (port 8088) | one OpenAI-compatible host for the narration lane | `narrate_why()` (agent/llm.py) uses only `chat.completions`; `/why` gains `story` + `story_by`; `tests/test_meterless_narration.py` |
| NVIDIA Nemotron | NVIDIA hosted API (build.nvidia.com) | parse lane | `parse_question()` (agent/llm.py) with deterministic time override; model `nvidia/nemotron-3.5-bolt-e4b` verified live against `/v1/models` (bolt over lightning-30b: lightning keeps its reasoning channel on and burns tokens per reply) |

## Proof table

| Claim | Where it is enforced |
|---|---|
| No empty 500s — errors return a contract body | `never_500_empty` (app/main.py) · `tests/test_offline_guarantees.py` |
| Fixture answers are labelled, never shown as live | `fallback` field (app/schemas.py) · `tests/test_offline_guarantees.py` |
| Stale readings can never alone produce a green | stale-only guard (app/agent.py) · `tests/test_staleness_honesty.py` |
| Units never blend; unknown units rejected | consensus rules (app/trust.py) · `tests/test_consensus.py` |
| Beyond-horizon plan asks are refused honestly | hard ceiling (app/adapters/weather.py) · `tests/test_horizon.py`, `tests/test_two_regressions.py` |
| Every verdict writes a receipt; `/why/{id}` renders it | app/ledger.py · regression test for stale entries |
| Sponsor recipe SQL loads; malformed rows quarantined | app/adapters/zetaris.py · `tests/test_zetaris.py` |

## Negative proofs (attempts to break it)

| Attack | Outcome |
|---|---|
| Ask the weather lane for "9 pm tonight" (beyond the 3 h horizon) | adapter raises; verdict = "come back nearer the time" — never a fabricated forecast · `tests/test_two_regressions.py` |
| Feed the Zetaris mapper a row in the wrong column order | row is quarantined visibly at weight 0, never blended · `tests/test_zetaris.py` |
| Kill sources mid-run (tunnel down, keys missing) | blind rows disclosed; verdict degrades to "treat as uncertain" — never invents · live-verified Oct 26 |
| Parse a question whose hour is impossible ("at 27 o'clock") | rejected as no-inferable-time, defaults to now-window · parse guardrail tests |
| Clamp test: ask for a far target using a wrapped hour | ceiling still fires for every device clock · clock-independent test fix Oct 26 |

## Honest limitations

- Zetaris and Meterless Nightshift run on the team's infra PC. When the tunnel is
  down, both slots read armed-but-unreachable (`reachable:false`), and the verdict
  degrades honestly rather than erroring. During the judged demo both run live.
- Pollen (CAMS open dataset) is Europe-only — the pilot city, Lagos, is a disclosed
  blind for that slot by design.
- The free-tier Render ledger lives in the container filesystem: `/why/{id}`
  receipts are self-consistent per session but do not survive a redeploy.
- The Bright Data advisory slot still awaits its provider-side key (dashboard
  outage); `AdvisoryAdapter` reads `configured:false` until it lands.

## How this fits the judging rubric

| Criterion | Where it is answered |
|---|---|
| Impact (30) | a real user (asthma kid, Lagos) making a real decision; "why" is the product, not a feature |
| Technical (20) | 69 tests incl. adversarial units horizons + ledger regressions; contract-versioned API |
| Innovation (15) | evidence-chain-as-UI; unit-aware consensus; deterministic-verdict / LLM-narrates split |
| Demo (15) | judge-testable at every step of the numbered route; live failure-flex on `/sources/status` |
| Product & UX (10) | one question in, verdict + why out; no dashboard literacy required |
| Sponsor tech (10) | Zetaris (SQL recipe live), Meterless (narration lane), Nemotron (parse lane) — all load-bearing, table above |

## Try the backend

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
# GET http://localhost:8000/today?lat=6.5244&lon=3.3792
```

With no keys set, `/today` falls back to the golden fixture — the service still
answers, it just says what it could not see. Health probe: `/health`.

## Environment variables

Full list: `.env.example` (root, canonical) and `backend/.env.example`
(backend-scoped). Every missing source degrades gracefully: the verdict lists the
blind spot in plain words instead of guessing.

## Tests

```bash
cd backend && python -m pytest tests
```

69 tests, offline-deterministic (the parse layer runs heuristics in tests so the
suite is never polluted by live keys; live-key behaviors are exercised with fake
clients).

## Layout

```
backend/    FastAPI service: adapters (data sources), trust scoring, verdicts
frontend/   fixtures + 3D map UI
infra/      deployment + sponsor-platform setup notes
```

## Workflow (strict)

- `main` is golden — feature branches `feat/backend-*` / `feat/frontend-*` /
  `feat/infra-*` with tests green, PR into `main`. The coordinator may merge on
  command.
- One logical unit of work per commit; plain-language messages; production files only.
- Never stage: secrets (`*.env`), planning docs, or agent scratch notes.
- Tests must pass before any push. Backend: `pytest backend/tests`.
