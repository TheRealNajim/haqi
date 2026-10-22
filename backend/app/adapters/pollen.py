"""Pollen via Open-Meteo Air Quality API (CAMS Europe).

Verified against open-meteo.com/en/docs/air-quality-api (Oct 2026):
- endpoint https://air-quality-api.open-meteo.com/v1/air-quality
- hourly (and current) take alder_pollen, birch_pollen, grass_pollen,
  mugwort_pollen, olive_pollen, ragweed_pollen — units grains/m3, instant.
- POLLEN IS EUROPE-ONLY (cams_europe, ~11 km grid, 4-day horizon). Outside
  Europe value fields come back empty: honest blind spot, never invented data.
- open access: no key needed; apikey only gates commercial use.
"""
import os
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

POLLEN_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
VARIABLES = ",".join(
    ["alder_pollen", "birch_pollen", "grass_pollen",
     "mugwort_pollen", "olive_pollen", "ragweed_pollen"]
)
# band per grains/m3 for the headline family; plain words, not medical advice
HIGH = 100
MODERATE = 20


class PollenAdapter(BaseAdapter):
    """CAMS model output, honestly named: it is a forecast product, not a sensor."""

    source_type = SourceType.FORECAST

    def __init__(self, enabled_profile: str | None = None) -> None:
        self._enabled_profile = enabled_profile

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def _fetch(self, lat: float, lon: float) -> dict:
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": VARIABLES,
            "forecast_days": 1,
            "domains": "cams_europe",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(POLLEN_URL, params=params)
            r.raise_for_status()
            return r.json()

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        try:
            data = await self._fetch(lat, lon)
        except AdapterError:
            raise
        except Exception as e:
            raise AdapterError(f"openmeteo-pollen failed: {e}") from e
        now = datetime.now(timezone.utc)
        current = data.get("current", {})
        readings = {
            k.replace("_pollen", ""): v
            for k, v in current.items()
            if k.endswith("_pollen") and isinstance(v, (int, float))
        }
        if not readings:
            # out of Europe / out of season — the API answers, the fields are null
            raise AdapterError(
                "openmeteo-pollen: no pollen coverage here (CAMS Europe only) — "
                "treating allergy load as unknown"
            )
        family, peak = max(readings.items(), key=lambda kv: kv[1])
        band = "high" if peak >= HIGH else ("moderate" if peak >= MODERATE else "low")
        out = [
            Evidence(
                claim=f"{family} pollen is {band} right now ({peak:.0f} grains/m³)",
                source_id="openmeteo:pollen",
                source_type=SourceType.STATION,
                retrieved_at=now,
                observed_at=now,
                raw_value=round(peak, 1),
                unit="grains/m³",
            )
        ]
        if band == "high":
            out.append(
                Evidence(
                    claim="high pollen days make lungs extra twitchy — factor it in",
                    source_id="openmeteo:pollen",
                    source_type=SourceType.STATION,
                    retrieved_at=now,
                    observed_at=now,
                    raw_value=None,
                    unit="flag",
                )
            )
        return out
