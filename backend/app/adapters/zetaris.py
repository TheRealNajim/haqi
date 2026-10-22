"""Zetaris adapter slot — sponsor SQL layer over structured env datasets.

Blocked by design until infra hands over the real Lightning table recipes
(infra/AGENTS.md: register tables during the build window). We never invent
table or column names — a wrong query is a silent lie, so until the recipes
land this adapter reports its blind spot instead of guessing.

Config gate: ZETARIS_REST_URL + ZETARIS_API_KEY must both exist. When they do,
the adapter is included in the loop; while it is unconfigured it stays out of
the investigation loop entirely (it would fake a "source failing" in /today).
"""
import os

from agent.tools_zetaris import ZetarisError, run_sql

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

ENV_REQUIRED = ["ZETARIS_REST_URL", "ZETARIS_API_KEY"]


def configured() -> bool:
    return all(os.getenv(v) for v in ENV_REQUIRED)


class ZetarisAdapter(BaseAdapter):
    source_type = SourceType.STATION

    def _sql_for(self, lat: float, lon: float) -> str:
        # PLACEHOLDER — replaced with infra's recipe. Raises rather than runs.
        raise AdapterError(
            "zetaris: Lightning table recipes pending from infra — "
            "no query is guessed until they land"
        )

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        if not configured():
            raise AdapterError(
                "zetaris: ZETARIS_REST_URL / ZETARIS_API_KEY not set — sponsor "
                "datasets blind"
            )
        try:
            rows = await run_sql(self._sql_for(lat, lon))
        except ZetarisError as e:
            raise AdapterError(f"zetaris failed: {e}") from e
        return self._to_evidence(rows)

    def _to_evidence(self, rows: list[list]) -> list[Evidence]:
        raise AdapterError(
            "zetaris: row shape pending infra recipe — refusing to guess mapping"
        )
