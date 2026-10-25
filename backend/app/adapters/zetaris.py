"""Zetaris adapter — sponsor SQL layer over the Lightning REST tables.

STRUCTURE COMPLETE; SCHEMA GATED. The recipe (table + column names for station
data) comes from infra after the Lightning sources are registered — until then
_sql_for() raises rather than guessing a query, per the truth rule.

Verified request shape (tools_zetaris.run_sql, guide-based):
    POST {ZETARIS_REST_URL}/sql-editor/sqls/run
    headers: Authorization: Bearer <key>, X-Org-ID, X-Request-ID (fresh uuid)
    body: {"queryId": uuid, "sql": ..., "source": "SqlEditor", "limit": n}
    reply: {"data": rows, ...}  rows = list-of-lists in recipe column order

Row contract (what _to_evidence expects once the recipe lands):
    each row: [source_id, raw_value(float), unit, distance_km(float|None),
               observed_at(iso str), ...extra ignored]
    Examples in tests use the Lagos-sensible shape; tests + timeouts detail
    exactly how malformed payloads degrade into AdapterError.
"""
import os
from datetime import datetime, timezone

from agent.tools_zetaris import ZetarisError, run_sql

from app.adapters.base import AdapterError, BaseAdapter
from app.schemas import Evidence, SourceType

ENV_REQUIRED = ["ZETARIS_REST_URL", "ZETARIS_API_KEY"]
_SQL_LIMIT = 50


def configured() -> bool:
    return all(os.getenv(v) for v in ENV_REQUIRED)


class ZetarisAdapter(BaseAdapter):
    source_type = SourceType.STATION

    def __init__(self) -> None:
        self.primary_error: str | None = None

    def _sql_for(self, lat: float, lon: float) -> str:
        """Query template from infra recipe. Recipe unknown -> refuse to guess."""
        raise AdapterError(
            "zetaris: Lightning table recipes pending from infra — "
            "no query is guessed until they land"
        )

    def _to_evidence(self, rows: list[list],
                     unit_notes: dict[str, float] | None = None
                     ) -> list[Evidence]:
        """Map recipe rows -> Evidence. Malformed rows are skipped loudly, and
        an all-malformed batch is an AdapterError, never a silent [].

        unit_notes: optional per-unit scale factor for conversion to µg/m³
        (e.g. {"aqi": <mass estimate>}); aqi never blends with mass because the
        trust layer groups by unit — conversions happen here or nowhere."""
        now = datetime.now(timezone.utc)
        out: list[Evidence] = []
        for i, row in enumerate(rows):
            try:
                sid, val, unit, dist, observed = row[:5]
                val = float(val)
                observed_dt = (
                    datetime.fromisoformat(str(observed).replace("Z", "+00:00"))
                    if isinstance(observed, str) else now
                )
                stale = (now - observed_dt).total_seconds() > 3600
                out.append(Evidence(
                    claim=f"zetaris table row: PM-equivalent {val:.1f} {unit}",
                    source_id=f"zetaris:{sid}",
                    source_type=SourceType.STATION,
                    retrieved_at=now,
                    observed_at=observed_dt,
                    geo_distance_km=float(dist) if dist is not None else None,
                    raw_value=val,
                    unit=unit,
                    staleness_flag=stale,
                ))
            except (TypeError, ValueError, IndexError) as e:
                # one bad row must not sink the batch — but it is never silent
                out.append(self._quarantine(f"row {i} unmappable: {e}"))
        usable = [e for e in out if not e.source_id.endswith("quarantine")]
        if not usable:
            raise AdapterError(
                "zetaris: no mappable rows — recipe/schema mismatch, refusing "
                "to invent readings"
            )
        return out  # quarantined rows ship too — judges and kids see the fails

    def _quarantine(self, note: str) -> Evidence:
        now = datetime.now(timezone.utc)
        from app.schemas import Evidence as E
        return E(claim=f"[unmapped] {note}", source_id="zetaris:quarantine",
                 source_type=SourceType.STATION, retrieved_at=now,
                 observed_at=now, raw_value=None, unit=None,
                 geo_distance_km=None, confidence=0.0, staleness_flag=True,
                 weight=0.0)

    async def gather(self, lat: float, lon: float) -> list[Evidence]:
        self.primary_error = None
        if not configured():
            raise AdapterError(
                "zetaris: ZETARIS_REST_URL / ZETARIS_API_KEY not set — sponsor "
                "datasets blind"
            )
        sql = self._sql_for(lat, lon)
        try:
            rows = await run_sql(sql, limit=_SQL_LIMIT)
        except ZetarisError as e:
            raise AdapterError(f"zetaris failed: {e}") from e
        except Exception as e:  # timeouts etc bubble as AdapterError
            raise AdapterError(f"zetaris unreachable: {e}") from e
        return self._to_evidence(rows)
