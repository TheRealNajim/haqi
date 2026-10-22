"""Offline tests: OpenWeather payload -> Evidence shapes. No key, no network."""
import asyncio
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.adapters.base import AdapterError
from app.adapters.weather import WeatherAdapter
from app.schemas import SourceType

FIXTURE = Path(__file__).parent / "fixtures" / "openweather_forecast.json"


@pytest.fixture
def payload() -> dict:
    return json.loads(FIXTURE.read_text())


def in_horizon(data: dict, index: int) -> dict:
    out = deepcopy(data)
    soon = int((datetime.now(timezone.utc) + timedelta(minutes=30)).timestamp())
    out["list"][index]["dt"] = soon
    return out


def transform(data: dict) -> list:
    return WeatherAdapter()._to_evidence(data)


def test_wind_evidence_shape_and_forecast_type(payload):
    out = transform(in_horizon(payload, 0))
    wind = out[0]
    assert wind.source_type == SourceType.FORECAST
    assert wind.unit == "m/s"
    assert wind.raw_value == pytest.approx(2.0)  # fixture: 1.0 + 3.0 averaged
    assert wind.observed_at is not None
    assert wind.weight is not None


def test_calm_wind_claim_names_the_accumulation(payload):
    """Fixture winds average to 2.0 m/s = exactly the calm/steady boundary (2.0 is < 2 -> false: 2.0 is not < 2, so 'steady'). Use a sub-2 wind to assert calm wording."""
    data = in_horizon(payload, 0)
    data["list"][0]["wind"]["speed"] = 0.8
    out = transform(data)
    assert "calm" in out[0].claim


def test_high_rain_probability_becomes_supporting_evidence(payload):
    out = transform(in_horizon(payload, 0))
    assert any("rain" in e.claim for e in out)


def test_big_gust_becomes_supporting_evidence(payload):
    out = transform(in_horizon(payload, 0))
    assert any("gust" in e.claim for e in out)


def test_steps_beyond_horizon_are_excluded(payload):
    """Only the next 3h matter — a forecast step 5 days out must not blur the window."""
    data = deepcopy(payload)
    far = int((datetime.now(timezone.utc) + timedelta(days=4)).timestamp())
    data["list"] = [s | {"dt": far} for s in data["list"]]
    with pytest.raises(AdapterError):
        transform(data)


def test_missing_key_reports_the_blind_spot(payload, monkeypatch):
    monkeypatch.setenv("OPENWEATHER_API_KEY", "")
    with pytest.raises(AdapterError) as info:
        asyncio.run(WeatherAdapter().gather(28.61, 77.21))
    assert "OPENWEATHER_API_KEY" in str(info.value)


def test_adapter_error_even_when_http_fails(payload, monkeypatch):
    """httpx errors must surface as AdapterError, never crash the investigation."""
    import app.adapters.weather as w

    monkeypatch.setenv("OPENWEATHER_API_KEY", "test")

    class Boom:
        async def __aenter__(self):
            raise httpx_connect_error()

        async def __aexit__(self, *a):
            return False

    def httpx_connect_error():
        import httpx

        return httpx.ConnectError("no network in test")

    adapter = WeatherAdapter()
    monkeypatch.setattr(w.httpx, "AsyncClient", lambda *a, **k: Boom())
    with pytest.raises(AdapterError):
        asyncio.run(adapter.gather(28.61, 77.21))
