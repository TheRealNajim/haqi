"""Ground station AQI via OpenAQ v3 (free key) with WAQI fallback."""
import os
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

OPENAQ_URL = "https://api.openaq.org/v3/locations"
WAQI_URL = "https://api.waqi.info/feed/geo:{lat};{lon}/"


class OpenAQAdapter(BaseAdapter):
    source_type = SourceType.STATION

    def __init__(self) -> None:
        self.openaq_key = os.getenv("OPENAQ_API_KEY", "")
        self.waqi_token = os.getenv("WAQI_TOKEN", "")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def _fetch_openaq(self, lat: float, lon: float) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                OPENAQ_URL,
                params={
                    "coordinates": f"{lat},{lon}",
                    "radius": 25000,
                    "limit": 5,
                    "order_by": "distance",
                },
                headers={"X-API-Key": self.openaq_key} if self.openaq_key else {},
            )
            r.raise_for_status()
            return r.json()

    def _to_evidence(self, payload: dict) -> list[Evidence]:
        now = datetime.now(timezone.utc)
        out = []
        for loc in payload.get("results", []):
            pm25 = next(
                (p for p in loc.get("parameters", []) if p.get("parameter") == "pm25"), None
            )
            if not pm25 or pm25.get("value") is None:
                continue
            last = pm25.get("lastValue") or now
            observed = self._parse_dt(last)
            stale = (now - observed).total_seconds() > 3600
            out.append(Evidence(
                claim=f"nearest station reads PM2.5 {pm25['value']:.0f} µg/m³",
                source_id=f"openaq:{loc.get('id')}",
                source_type=SourceType.STATION,
                retrieved_at=now,
                observed_at=observed,
                geo_distance_km=loc.get("distance"),
                raw_value=pm25["value"],
                unit="µg/m³",
                staleness_flag=stale,
            ))
        if not out:
            raise AdapterError("openaq: no stations with PM2.5 in radius")
        return out

    @staticmethod
    def _parse_dt(value) -> datetime:
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.now(timezone.utc)

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        try:
            return self._to_evidence(await self._fetch_openaq(lat, lon))
        except Exception:
            return await self._waqi_fallback(lat, lon)

    async def _waqi_fallback(self, lat: float, lon: float) -> list[Evidence]:
        if not self.waqi_token:
            raise AdapterError("openaq failed and no WAQI_TOKEN set")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(WAQI_URL.format(lat=lat, lon=lon),
                                     params={"token": self.waqi_token})
                r.raise_for_status()
                data = r.json()["data"]
            now = datetime.now(timezone.utc)
            aqi = data.get("aqi")
            if aqi is None:
                raise AdapterError("waqi: empty aqi")
            return [Evidence(
                claim=f"city AQI {aqi}",
                source_id="waqi:geo",
                source_type=SourceType.STATION,
                retrieved_at=now,
                observed_at=now,
                raw_value=float(aqi),
                unit="aqi",
            )]
        except Exception as e:
            raise AdapterError(f"station adapters failed: {e}") from e
