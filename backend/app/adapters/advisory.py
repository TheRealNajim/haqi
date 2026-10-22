"""Local advisories / news via Bright Data SERP API (sponsor slot).

Verified against docs.brightdata.com SERP API reference (Oct 2026):
POST https://api.brightdata.com/request
headers: Authorization: Bearer <API key from the zone>
body: {"zone": "<SERP zone name>", "url": "<google search url>", "format": "json"}
Response (json): {"organic": [{"title", "description", "link", "source"}, ...], ...}

What we take: top links matching advisory intent (health/govt/warning words).
Credits: charges per request — keep queries minimal (one per investigate()).
"""
import os
import re
from urllib.parse import quote_plus
from datetime import datetime, timezone

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

REQUEST_URL = "https://api.brightdata.com/request"

# a title is only "advisory-ish" when it warns or informs on air/health
_ADVISORY_RE = re.compile(
    r"advisory|warning|alert|ban|orders|smog|pollution|asthma|health|"
    r"caaqm|safar|dqsr|grim|toxic|national green tribunal|ngt|health ministry",
    re.I,
)
JNI = 3  # how many advisory items we keep — never spam the verdict


class AdvisoryAdapter(BaseAdapter):
    source_type = SourceType.ADVISORY

    def __init__(self, location_name: str | None = None) -> None:
        self.api_key = os.getenv("BRIGHTDATA_API_KEY", "")
        self.zone = os.getenv("BRIGHTDATA_SERP_ZONE", "serp_api1")
        self.location_name = location_name or os.getenv("HAQI_LOCATION_NAME", "Delhi NCR")

    def _search_url(self, lat: float, lon: float) -> str:
        q = f"{self.location_name} air quality advisory warning health"
        url = f"https://www.google.com/search?q={quote_plus(q)}&hl=en&gl=in"
        return url

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2, min=2, max=8))
    async def _fetch(self, lat: float, lon: float) -> dict:
        assert self.api_key, "BRIGHTDATA_API_KEY missing from .env"
        assert self.zone, "BRIGHTDATA_SERP_ZONE missing from .env"
        body = {"zone": self.zone, "url": self._search_url(lat, lon), "format": "json"}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                REQUEST_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            r.raise_for_status()
            return r.json()

    def _to_evidence(self, payload: dict) -> list[Evidence]:
        now = datetime.now(timezone.utc)
        out: list[Evidence] = []
        for item in (payload.get("organic") or [])[:10]:
            title = (item.get("title") or "").strip()
            desc = (item.get("description") or "").strip()
            if not title or not _ADVISORY_RE.search(title + " " + desc):
                continue
            link = item.get("link", "")
            source = item.get("source") or "the web"
            suffix = source.strip()[:24].replace(" ", "_").lower()
            claim = title.replace("\n", " ").strip()
            claim = (claim + (" — " + desc.split(". ")[0] if desc else ""))[:220]
            out.append(
                Evidence(
                    claim=claim,
                    source_id=f"brd:advisory{'_' + suffix if suffix else ''}",
                    source_type=SourceType.ADVISORY,
                    retrieved_at=now,
                    observed_at=now,
                    raw_value=None,
                    unit=None,
                    geo_distance_km=None,
                    confidence=0.5,
                )
            )
            if len(out) >= JNI:
                break
        if not out:
            raise AdapterError("brd: no advisory-looking results today")
        return out

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        if not self.api_key:
            raise AdapterError(
                "brightdata: no BRIGHTDATA_API_KEY — blind to govt advisories"
            )
        try:
            return self._to_evidence(await self._fetch(lat, lon))
        except AdapterError:
            raise
        except Exception as e:
            raise AdapterError(f"brightdata failed: {e}") from e
