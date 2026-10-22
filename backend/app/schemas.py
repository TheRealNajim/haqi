"""Evidence object — the spine of Track 02. Every verdict is a list of these."""
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    STATION = "station"        # ground monitoring station (OpenAQ/WAQI)
    SATELLITE = "satellite"    # NASA FIRMS etc.
    FORECAST = "forecast"      # weather / dispersion model
    ADVISORY = "advisory"      # govt advisory / news (Bright Data)


class VerdictLevel(str, Enum):
    GOOD = "good to go"
    CAREFUL = "be careful"
    STAY_IN = "stay in"


class Evidence(BaseModel):
    claim: str                          # human-readable finding
    source_id: str                      # adapter + location id
    source_type: SourceType
    retrieved_at: datetime
    observed_at: datetime | None = None
    geo_distance_km: float | None = None
    raw_value: float | None = None
    unit: str | None = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    staleness_flag: bool = False
    weight: float = Field(ge=0.0, le=1.0, default=1.0)


class Verdict(BaseModel):
    schema_version: int = 1                 # CONTRACTS.md: every payload carries it
    level: VerdictLevel
    window: str                         # e.g. "now until 5 pm"
    reason: str                         # one sentence, kid-readable
    aqi: int | None = None
    evidence: list[Evidence]
    blind_spots: list[str] = []         # sources that failed — never silent
    ledger_id: str | None = None        # Meterless H-MEM entry (wired on Day 3)
    fallback: bool = False              # true ONLY when served from golden fixtures
