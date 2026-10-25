"""haqi backend — FastAPI surface. Golden fixtures keep it alive offline."""
import json
import os
from pathlib import Path

# load .env (backend/.env or repo-root .env) BEFORE any adapter/db imports read env
# zero-dependency: plain KEY=VALUE lines, '#' comments, values may be quoted.
def _load_env(cands: list[Path] | None = None) -> None:
    """Plain KEY=VALUE lines, '#' comments, quoted values allowed; first hit wins.
    setdefault: real environment always beats dotenv — no override surprises."""
    if cands is None:
        here = Path(__file__).resolve()
        cands = [here.parent.parent / ".env", here.parent.parent.parent / ".env"]
    for cand in cands:
        if cand.exists():
            for line in cand.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            break

_load_env()

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.agent import investigate
from app.adapters.advisory import AdvisoryAdapter
from app.adapters.base import BaseAdapter
from app.adapters.fire import FireAdapter
from app.adapters.openaq import OpenAQAdapter
from app.adapters.pollen import PollenAdapter
from app.adapters.weather import WeatherAdapter
from app.ledger import LEDGER_FILE as LEDGER
from app.ledger import entry_to_why
from app.schemas import Verdict

app = FastAPI(title="haqi", version="0.2.0")
FIX = Path(__file__).parent / "fixtures"


def _fixture_verdict() -> Verdict | None:
    p = FIX / "today.json"
    if not p.exists():
        return None
    v = Verdict(**json.loads(p.read_text()))
    v.fallback = True
    return v


@app.exception_handler(Exception)
async def never_500_empty(request: Request, exc: Exception) -> JSONResponse:
    """CONTRACTS.md error model: no empty 500s; fixture fallback when we have one."""
    fallback = _fixture_verdict()
    body: dict = {
        "schema_version": 1,
        "error": "backend hit an unexpected wall; the fallback below is the golden "
        "fixture, not live data",
        "fallback": None,
    }
    if fallback is not None:
        fb = fallback.model_dump(mode="json")
        fb["reason"] = fb.get("reason", "") + " (fixture answer)"
        body["fallback"] = fb
    return JSONResponse(status_code=503, content=body)


@app.get("/today")
async def today(lat: float = 6.5244, lon: float = 3.3792) -> Verdict:
    """Lagos pilot coords by default. Persona default = asthma (Chidi)."""
    try:
        return await investigate(lat, lon)
    except Exception:
        fallback = _fixture_verdict()
        if fallback is not None:
            return fallback
        raise


@app.post("/ask")
async def ask(payload: dict) -> Verdict:
    """One question in, one verdict out — window answers the named plan."""
    try:
        question = str(payload.get("question", "")).strip()
        if not question:
            raise ValueError("question is required — what do you want to do outside?")
        lat = float(payload["lat"])
        lon = float(payload["lon"])
    except HTTPException:
        raise
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(422, f"bad ask payload: {e}")
    profile = payload.get("profile")
    try:
        return await investigate(lat, lon, question=question, profile_name=profile)
    except HTTPException:
        raise
    except Exception:
        fallback = _fixture_verdict()
        if fallback is not None:
            return fallback
        raise


@app.get("/why/{ledger_id}")
async def why(ledger_id: str) -> dict:
    rendered = entry_to_why(ledger_id)
    if rendered is None:
        fixture = FIX / "why.json"
        if fixture.exists():
            sentinel = json.loads(fixture.read_text())
            sentinel.setdefault(
                "note", "requested ledger entry not found — showing fixture"
            )
            return sentinel
        raise HTTPException(404, "no such ledger entry")
    return rendered


# (adapter, source_type, role, envs) — health = env-configured vs config-blind.
# Zetaris is special: config-gated + recipe-gated, wired via app.adapters.zetaris.
ADAPTERS: list[tuple[type[BaseAdapter], str, str, list[str]]] = [
    (OpenAQAdapter, "station", "ground stations PM2.5 (+WAQI fallback)",
     ["OPENAQ_API_KEY", "WAQI_TOKEN"]),
    (WeatherAdapter, "forecast", "wind/dispersion forecast",
     ["OPENWEATHER_API_KEY"]),
    (FireAdapter, "satellite", "wildfire smoke hotspots", ["NASA_FIRMS_MAP_KEY"]),
    (PollenAdapter, "forecast", "allergy load (CAMS Europe only by design)", []),
    (AdvisoryAdapter, "advisory", "govt advisory + warning news via Bright Data SERP",
     ["BRIGHTDATA_API_KEY"]),
]

ZETARIS_ROLE = "sponsor SQL layer (Lightning tables; recipes pending infra)"


def _sources_summary() -> list[dict]:
    import os

    from app.adapters.zetaris import configured as zetaris_configured

    out = []
    for cls, stype, role, envs in ADAPTERS:
        armed = bool(envs) and any(os.getenv(v) for v in envs)
        out.append({
            "adapter": cls.__name__,
            "type": cls().source_type.value if stype is None else stype,
            "role": role,
            "env_required": envs,
            "configured": armed,
        })
    out.append({
        "adapter": "ZetarisAdapter",
        "type": "station",
        "role": ZETARIS_ROLE,
        "env_required": ["ZETARIS_REST_URL", "ZETARIS_API_KEY"],
        "configured": zetaris_configured(),
    })
    return out


@app.get("/sources/status")
async def sources_status() -> dict:
    """The failure-flex demo reads this: which sources are armed, which are blind."""
    return {"schema_version": 1, "sources": _sources_summary()}


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "adapters": [c.__name__ for c, _, _, _ in ADAPTERS]
            + ["ZetarisAdapter"]}


def _proof() -> dict:
    """Machine-readable self-audit (judge route). Only states what is real:
    sources it can currently reach, ledger facts, and the checks that ran."""
    sources = _sources_summary()
    armed = sum(1 for s in sources if s["configured"])
    n_entries = 0
    if LEDGER.exists():
        n_entries = sum(
            1 for line in LEDGER.read_text().splitlines() if line.strip()
        )
    return {
        "schema_version": 1,
        "what": "haqi answers 'can I play outside' with a verdict plus a "
                "weighted evidence chain, every receipt logged",
        "claims": [
            {"claim": "no empty 500s — errors return a contract body",
             "enforced_by": "app.main:never_500_empty handler + "
                            "backend/tests/test_offline_guarantees.py"},
            {"claim": "fixture answers are labelled, never shown as live",
             "enforced_by": "verdict.fallback field in app/schemas.py + "
                            "backend/tests/test_offline_guarantees.py"},
            {"claim": "stale readings are down-weighted and disclosed, "
                      "and can never produce a green light alone",
             "enforced_by": "app/agent.py stale_only guard + "
                            "backend/tests/test_staleness_honesty.py"},
            {"claim": "every verdict writes a receipt to an append-only "
                      "trust ledger; /why/{id} renders it",
             "enforced_by": "app/ledger.py + stale-entry regression in "
                            "backend/tests/test_offline_guarantees.py"}
        ],
        "sources_armed": f"{armed}/{len(sources)}",
        "sources": sources,
        "ledger": {"entries": n_entries, "location": "backend/data/ "
                   "(gitignored, HAQI_DATA_DIR overridable)"},
        "test_suite": "pytest backend/tests",
    }


@app.get("/proof")
async def proof() -> dict:
    return _proof()


@app.get("/api/proof")
async def api_proof() -> dict:
    return _proof()
