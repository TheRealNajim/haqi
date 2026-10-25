"""Weather via OpenWeather 5-day/3-hour forecast — wind/dispersion role.

Endpoint + field shapes verified against openweathermap.org/forecast5 (Oct 2026):
list[].wind.speed is metric m/s, wind.deg meteorological, pop 0..1, dt unix UTC.
Missing key => AdapterError so the verdict reports the blind spot, never guesses.
"""
import os
from datetime import datetime, timedelta, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


def _desc(wind_speed: float) -> str:
    if wind_speed < 2:
        return "calm — pollutants settle and build up"
    if wind_speed < 6:
        return "steady — some dispersal"
    return "strong — air mixing well"


class WeatherAdapter(BaseAdapter):
    source_type = SourceType.FORECAST

    # OpenWeather forecast5 gives 3-hourly steps; the horizon we treat as verified
    FORECAST_HOURS = 3

    def __init__(self) -> None:
        self.api_key = os.getenv("OPENWEATHER_API_KEY", "")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def _fetch(self, lat: float, lon: float) -> dict:
        assert self.api_key, "OPENWEATHER_API_KEY missing from .env"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                FORECAST_URL,
                params={"lat": lat, "lon": lon, "appid": self.api_key, "units": "metric"},
            )
            r.raise_for_status()
            return r.json()

    def _to_evidence(self, payload: dict, target_hour: int | None = None) -> list[Evidence]:
        """Average the forecast steps that cover the next 3h; keep the window honest.

        target_hour (device-local) selects the bucket matching the kid's plan
        when it is inside the horizon; beyond-horizon requests raise — the loop
        then answers cautiously instead of implying today-conditions-verified.
        """
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(hours=self.FORECAST_HOURS)
        steps = payload.get("list", [])
        if target_hour is not None:
            local = datetime.now()  # device-local (kid's wall-clock)
            target = local.replace(hour=max(0, min(target_hour, 23)), minute=0,
                                  second=0, microsecond=0)
            if target < local:
                target += timedelta(days=1)
            window = [s for s in steps
                      if self._step_dt(s) <= target + timedelta(hours=2)
                      and self._step_dt(s) >= target - timedelta(hours=1)]
            if not window:
                raise AdapterError(
                    "openweather: no forecast step covers that time yet — "
                    "horizon is 3 hours ahead"
                )
        else:
            window = [
                s for s in steps
                if self._step_dt(s) <= horizon
            ]
            if not window:
                raise AdapterError("openweather: no forecast steps within 3h")
        winds = [
            s["wind"]["speed"] for s in window
            if s.get("wind", {}).get("speed") is not None
        ]
        gust = max(
            (s["wind"].get("gust") or 0) for s in window if s.get("wind", {}).get("speed")
        )
        if not winds:
            raise AdapterError("openweather: no wind data in forecast")
        avg_wind = sum(winds) / len(winds)
        label = (f"around {target_hour}:00" if target_hour is not None
                 else f"next {self.FORECAST_HOURS}h")
        out = [
            Evidence(
                claim=f"forecast wind {label} ~{avg_wind:.1f} m/s — {_desc(avg_wind)}",
                source_id=("openweather:forecast3h" if target_hour is None
                           else f"openweather:forecast@{target_hour}"),
                source_type=SourceType.FORECAST,
                retrieved_at=now,
                observed_at=now,
                raw_value=round(avg_wind, 1),
                unit="m/s",
            )
        ]
        pops = [s.get("pop") for s in window if s.get("pop") is not None]
        if pops and max(pops) >= 0.5:  # rain scrubs particulates — supporting evidence
            out.append(
                Evidence(
                    claim=f"rain likely {label} — it washes some dust out",
                    source_id="openweather:pop3h",
                    source_type=SourceType.FORECAST,
                    retrieved_at=now,
                    observed_at=now,
                    raw_value=None,
                    unit="prob",
                    confidence=0.6,
                )
            )
        if gust >= 12:
            out.append(
                Evidence(
                    claim=f"gusts up to {gust:.0f} m/s",
                    source_id="openweather:gust3h",
                    source_type=SourceType.FORECAST,
                    retrieved_at=now,
                    observed_at=now,
                    raw_value=None,
                    unit="m/s",
                )
            )
        return out

    @staticmethod
    def _step_dt(step: dict) -> datetime:
        return datetime.fromtimestamp(step.get("dt", 0), tz=timezone.utc)

    async def gather(self, lat: float, lon: float,
                     target_hour: int | None = None) -> list[Evidence]:
        """Public signature; loop passes the parsed plan time when it is known."""
        if not self.api_key:
            raise AdapterError("openweather: no OPENWEATHER_API_KEY — blind to dispersal")
        try:
            return self._to_evidence(await self._fetch(lat, lon), target_hour)
        except AdapterError:
            raise
        except Exception as e:
            raise AdapterError(f"openweather failed: {e}") from e
