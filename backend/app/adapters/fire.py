"""NASA FIRMS wildfire smoke — active fire detections near the location.

Endpoint verified against the FIRMS Area API page (Oct 2026):
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}
SOURCE must be in the documented list (VIIRS_SNPP_NRT); COORDS are degrees in
west,south,east,north order; DAY_RANGE 1..5; omitting DATE = most recent day.
Free MAP_KEY at firms.modaps.eosdis.nasa.gov — 5000 transactions per 10 min.
"""
import csv
import io
import math
import os
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

AREA_URL = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
    "{key}/VIIRS_SNPP_NRT/{rect}/1"
)

DETECT_RADIUS_KM = 50.0
HOTSPOT_FLAG_THRESHOLD = 20


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(a ** 0.5)


class FireAdapter(BaseAdapter):
    """count-then-flag: one quantitative reading + a smoke flag when it matters."""

    source_type = SourceType.SATELLITE

    def __init__(self) -> None:
        self.map_key = os.getenv("NASA_FIRMS_MAP_KEY", "")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def _fetch(self, lat: float, lon: float) -> str:
        rect = self._rect_in_km(lat, lon, DETECT_RADIUS_KM)
        assert self.map_key, "NASA_FIRMS_MAP_KEY missing from .env"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(AREA_URL.format(key=self.map_key, rect=rect))
            r.raise_for_status()
            return r.text

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        if not self.map_key:
            raise AdapterError("firms: no NASA_FIRMS_MAP_KEY — blind to wildfire smoke")
        try:
            count = self._count_within(await self._fetch(lat, lon), lat, lon)
        except AdapterError:
            raise
        except Exception as e:
            raise AdapterError(f"firms failed: {e}") from e
        now = datetime.now(timezone.utc)
        out = [
            Evidence(
                claim=(
                    f"{count} active fire hotspots within 50 km"
                    + ("" if count < HOTSPOT_FLAG_THRESHOLD else " — smoke possible")
                ),
                source_id="firms:viirs-snpp",
                source_type=SourceType.SATELLITE,
                retrieved_at=now,
                observed_at=now,
                raw_value=float(count),
                unit="hotspots",
            )
        ]
        if count >= HOTSPOT_FLAG_THRESHOLD:
            out.append(
                Evidence(
                    claim="wildfire smoke likely — hotspots burning nearby",
                    source_id="firms:viirs-snpp",
                    source_type=SourceType.SATELLITE,
                    retrieved_at=now,
                    observed_at=now,
                    raw_value=None,
                    unit="flag",
                )
            )
        return out

    def _rect_in_km(self, lat: float, lon: float, radius_km: float) -> str:
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(math.cos(math.radians(abs(lat))), 0.01))
        west = round(lon - dlon, 3)
        south = round(lat - dlat, 3)
        east = round(lon + dlon, 3)
        north = round(lat + dlat, 3)
        return f"{west},{south},{east},{north}"

    def _count_within(self, csv_text: str, lat: float, lon: float) -> int:
        rows = list(csv.DictReader(io.StringIO(csv_text)))
        if rows and "latitude" not in rows[0]:
            # FIRMS sometimes returns an error string while HTTP stays 200
            if not csv_text.lstrip().startswith("latitude"):
                raise AdapterError(f"firms: unexpected response: {csv_text[:120]!r}")
        n = 0
        for row in rows:
            try:
                flat, flon = float(row["latitude"]), float(row["longitude"])
            except (KeyError, ValueError):
                continue
            if haversine_km(lat, lon, flat, flon) <= DETECT_RADIUS_KM:
                n += 1
        return n
