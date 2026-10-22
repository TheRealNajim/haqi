"""haqi backend — FastAPI surface. Golden fixtures keep /today alive offline."""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException

from app.agent import investigate
from app.schemas import Verdict

app = FastAPI(title="haqi", version="0.1.0")
FIXTURE = Path(__file__).parent / "fixtures" / "today.json"


@app.get("/today")
async def today(lat: float = 28.61, lon: float = 77.21) -> Verdict:
    """Delhi NCR pilot coords by default."""
    try:
        return await investigate(lat, lon)
    except Exception:
        if FIXTURE.exists():  # demo fallback — never return 500 on stage
            return Verdict(**json.loads(FIXTURE.read_text()))
        raise HTTPException(503, "all sources down and no fixture")


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "adapters": ["openaq(+waqi fallback)"]}
