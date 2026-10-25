"""Future-time honesty: plans past the forecast horizon are never dressed as verified."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import app.agent as A
from app.adapters.base import AdapterError
from app.schemas import Evidence, SourceType, VerdictLevel


def _fresh(val=14.0):
    now = datetime.now(timezone.utc)
    return Evidence(claim="city aqi fresh", source_id="waqi:geo",
                    source_type=SourceType.STATION, retrieved_at=now,
                    observed_at=now, raw_value=val, unit="µg/m³",
                    geo_distance_km=None, staleness_flag=False)


class _WO:
    """weather stub raising horizon-fail like the real adapter beyond 3h."""
    primary_error = None
    source_type = SourceType.FORECAST

    async def gather(self, lat, lon, target_hour=None):
        if target_hour is None:
            return [Evidence(claim="forecast wind now", source_id="openweather:forecast3h",
                             source_type=SourceType.FORECAST, retrieved_at=now_dt(),
                             observed_at=now_dt(), raw_value=2.0, unit="m/s",
                             geo_distance_km=None)]
        raise AdapterError(
            "openweather: no forecast step covers that time yet — horizon is 3h ahead")


def now_dt():
    return datetime.now(timezone.utc)


def test_beyond_horizon_is_careful_not_verified(monkeypatch):
    monkeypatch.setattr(A, "_adapters_for", lambda p: [_WO()])
    v = asyncio.run(A.investigate(6.5244, 3.3792, question="football at 9 pm"))
    assert v.level == VerdictLevel.CAREFUL
    assert v.aqi is None
    assert "3 hours ahead" in v.reason
    assert not any(e.source_id.startswith("openweather:forecast@") for e in v.evidence)


def test_within_horizon_uses_plan_bucket(monkeypatch):
    class _WIn:
        primary_error = None
        source_type = SourceType.FORECAST
        async def gather(self, lat, lon, target_hour=None):
            assert target_hour is not None
            sid = f"openweather:forecast@{target_hour}"
            return [Evidence(claim=f"forecast wind at {target_hour}",
                             source_id=sid, source_type=SourceType.FORECAST,
                             retrieved_at=now_dt(), observed_at=now_dt(),
                             raw_value=2.0, unit="m/s", geo_distance_km=None)]
    from app.schemas import VerdictLevel as VL
    monkeypatch.setattr(A, "_adapters_for", lambda p: [_WIn()])
    v = asyncio.run(A.investigate(6.5244, 3.3792, question="football at 2 am"))
    evid = [e for e in v.evidence if e.source_id.startswith("openweather:forecast@")]
    assert evid and evid[0].source_id == "openweather:forecast@2"


def test_no_plan_time_uses_next_3h_bucket(monkeypatch):
    class _WNow:
        primary_error = None
        source_type = SourceType.FORECAST
        async def gather(self, lat, lon, target_hour=None):
            assert target_hour is None
            return [Evidence(claim="next 3h wind", source_id="openweather:forecast3h",
                             source_type=SourceType.FORECAST, retrieved_at=now_dt(),
                             observed_at=now_dt(), raw_value=2.0, unit="m/s",
                             geo_distance_km=None)]
    monkeypatch.setattr(A, "_adapters_for", lambda p: [_WNow()])
    v = asyncio.run(A.investigate(6.5244, 3.3792))
    assert v.fallback is False
