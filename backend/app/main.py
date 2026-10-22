"""haqi backend — FastAPI surface. Golden fixtures keep it alive offline."""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.agent import investigate
from app.adapters.advisory import AdvisoryAdapter
from app.adapters.base import BaseAdapter
from app.adapters.fire import FireAdapter
from app.adapters.openaq import OpenAQAdapter
from app.adapters.pollen import PollenAdapter
from app.adapters.weather import WeatherAdapter
from app.ledger import entry_to_why
from app.schemas import Verdict

app = FastAPI(title="haqi", version="0.2.0")
FIX = Path(__file__).parent / "fixtures"


def _fixture_verdict() -> Verdict | None:
    p = FIX / "today.json"
    return Verdict(**json.loads(p.read_text())) if p.exists() else None


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


# (adapter class, role) — health = env-configured vs blind at config level
ADAPTERS: list[tuple[type[BaseAdapter], str, list[str]]] = [
    (OpenAQAdapter, "ground stations PM2.5 (+WAQI fallback)",
     ["OPENAQ_API_KEY", "WAQI_TOKEN"]),
    (WeatherAdapter, "wind/dispersion forecast", ["OPENWEATHER_API_KEY"]),
    (FireAdapter, "wildfire smoke hotspots", ["NASA_FIRMS_MAP_KEY"]),
    (PollenAdapter, "allergy load (CAMS Europe only by design)", []),
    (AdvisoryAdapter, "govt advisory + warning news via Bright Data SERP",
     ["BRIGHTDATA_API_KEY"]),
]


@app.get("/sources/status")
async def sources_status() -> dict:
    """The failure-flex demo reads this: which sources are armed, which are blind."""
    import os

    out = []
    for cls, role, envs in ADAPTERS:
        armed = bool(envs) and any(os.getenv(v) for v in envs)
        out.append({
            "adapter": cls.__name__,
            "type": cls().source_type.value,
            "role": role,
            "env_required": envs,
            "configured": armed,
        })
    return {"schema_version": 1, "sources": out}


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "adapters": [c.__name__ for c, _, _ in ADAPTERS]}
