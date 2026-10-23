"""Stale data must never produce a green-light verdict."""
import asyncio
from datetime import datetime, timedelta, timezone

from app.adapters.base import AdapterError
from app.agent import investigate
from app.schemas import SourceType, VerdictLevel


class StubAdapter:
    primary_error = None
    source_type = SourceType.STATION

    def __init__(self, evs):
        self._evs = evs

    async def gather(self, lat, lon):
        return self._evs


def _stale_ev(sid="openaq:999"):
    now = datetime.now(timezone.utc)
    from app.schemas import Evidence
    return Evidence(claim=f"station {sid} reads PM2.5 2 µg/m³",
                    source_id=sid, source_type=SourceType.STATION,
                    retrieved_at=now, observed_at=now - timedelta(days=300),
                    raw_value=2.0, unit="µg/m³",
                    geo_distance_km=5.0, staleness_flag=True, weight=0.1)


def test_stale_only_yields_careful_not_good(monkeypatch):
    import app.agent as A
    monkeypatch.setattr(A, "_adapters_for", lambda p: [StubAdapter([_stale_ev()])])
    v = asyncio.run(investigate(6.5244, 3.3792))
    assert v.level == VerdictLevel.CAREFUL
    assert v.fallback is False
    assert v.aqi is None  # stale number never published as live AQI
    assert any("old" in b for b in v.blind_spots)


def test_fresh_sensor_restores_normal_verdict(monkeypatch):
    import app.agent as A
    from app.schemas import Evidence
    now = datetime.now(timezone.utc)
    fresh = Evidence(claim="waqi city aqi 15", source_id="waqi:geo",
                     source_type=SourceType.STATION, retrieved_at=now,
                     observed_at=now, raw_value=4.0, unit="µg/m³",
                     geo_distance_km=None, staleness_flag=False, weight=0.9)
    monkeypatch.setattr(A, "_adapters_for", lambda p: [StubAdapter([fresh])])
    assert asyncio.run(investigate(6.5244, 3.3792)).level == VerdictLevel.GOOD
