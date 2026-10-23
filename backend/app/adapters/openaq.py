"""Ground station PM2.5 via OpenAQ v3 (verified live shape) with WAQI fallback.

v3 reality (probed live, Oct 2026):
 - GET /v3/locations?coordinates&radius -> locations[], each with sensors[]:
   {id: sensorsId, parameter: {name}}
 - GET /v3/locations/{id}/latest -> results[]: {sensorsId, value,
   datetime: {utc}} — NO parameter name, hence the sensor map.
 - There is no order_by=distance in this build; we sort client-side.
"""
import math
import os
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType
from app.trust import pm25_from_aqi

OPENAQ_URL = "https://api.openaq.org/v3"
WAQI_URL = "https://api.waqi.info/feed/geo:{lat};{lon}/"
MAX_STATIONS = 3  # keep latency sane: nearest 3 detailed + latested


class OpenAQAdapter(BaseAdapter):
    source_type = SourceType.STATION

    def __init__(self) -> None:
        self.openaq_key = os.getenv("OPENAQ_API_KEY", "")
        self.waqi_token = os.getenv("WAQI_TOKEN", "")
        # consumers (agent loop) read this to surface primary-failure honesty
        self.primary_error: str | None = None

    async def _get(self, client: httpx.AsyncClient, path: str, **params) -> dict:
        r = await client.get(OPENAQ_URL + path, params=params,
                             headers={"X-API-Key": self.openaq_key})
        r.raise_for_status()
        return r.json()

    @staticmethod
    def _km(lat1, lon1, lat2, lon2) -> float:
        a = (math.radians(lat2 - lat1), math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)))
        return 6371.0 * math.hypot(*a)

    async def _nearby(self, lat: float, lon: float) -> list[dict]:
        async with httpx.AsyncClient(timeout=15) as client:
            payload = await self._get(
                client, "/locations", coordinates=f"{lat},{lon}",
                radius=25000, limit=25,
            )
        cands = []
        for loc in payload.get("results", []):
            c = loc.get("coordinates") or {}
            if c.get("latitude") is None:
                continue
            dist = self._km(lat, lon, c["latitude"], c["longitude"])
            sensors = loc.get("sensors") or []
            if not any(s.get("parameter", {}).get("name") == "pm25" for s in sensors):
                continue
            cands.append({"id": loc["id"], "distance_km": round(dist, 2),
                          "sensors": {s["id"]: s["parameter"]["name"] for s in sensors}})
        cands.sort(key=lambda x: x["distance_km"])
        return cands[:MAX_STATIONS]

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=6))
    async def _fetch_openaq(self, lat: float, lon: float) -> list[Evidence]:
        stations = await self._nearby(lat, lon)
        if not stations:
            raise LookupError("no stations with pm25 sensor in 25 km")
        out = []
        async with httpx.AsyncClient(timeout=15) as client:
            for st in stations:
                late = await self._get(client, f"/locations/{st['id']}/latest")
                for row in late.get("results", []):
                    if st["sensors"].get(row.get("sensorsId")) != "pm25":
                        continue
                    out.append((st, row))
                if out:
                    break  # nearest station with a reading is enough
        if not out:
            raise LookupError("nearest pm25 stations returned no latest values")
        return [self._evidence_from(st, row) for st, row in out]

    def _evidence_from(self, st: dict, row: dict) -> Evidence:
        now = datetime.now(timezone.utc)
        utc = row.get("datetime", {}).get("utc")
        observed = (
            datetime.fromisoformat(utc.replace("Z", "+00:00"))
            if isinstance(utc, str) else now
        )
        stale = (now - observed).total_seconds() > 3600
        val = float(row["value"])
        return Evidence(
            claim=("nearest station reads PM2.5 %.0f µg/m³" % val)
            + (" — last logged more than an hour ago" if stale else ""),
            source_id=f"openaq:{st['id']}",
            source_type=SourceType.STATION,
            retrieved_at=now,
            observed_at=observed,
            geo_distance_km=st["distance_km"],
            raw_value=val,
            unit="µg/m³",
            staleness_flag=stale,
        )

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        self.primary_error = None
        try:
            evs = await self._fetch_openaq(lat, lon)
        except Exception as e:
            self.primary_error = f"openaq primary declined: {e}"
            return await self._waqi_fallback(lat, lon)
        if all(e.staleness_flag for e in evs) and self.waqi_token:
            # stale stations present + a fresh feed available -> consult both;
            # the trust layer weighs them, the claim text keeps the story honest
            self.primary_error = (
                "openaq-readable stations are stale (last logged >1h ago) — "
                "fresh WAQI reading added alongside"
            )
            try:
                evs.extend(await self._waqi_fallback(lat, lon))
            except AdapterError:
                pass  # waqi may be down too — stale evidence stands alone
        return evs

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
            aqi = float(aqi)
            pm25 = pm25_from_aqi(aqi)  # US AQI is a scale, not a mass — normalize
            return [Evidence(
                claim=f"city AQI {aqi:.0f} (~{pm25:.0f} µg/m³ PM2.5-equivalent)",
                source_id="waqi:geo",
                source_type=SourceType.STATION,
                retrieved_at=now,
                observed_at=now,
                raw_value=pm25,
                unit="µg/m³",
            )]
        except Exception as e:
            raise AdapterError(f"station adapters failed: {e}") from e
