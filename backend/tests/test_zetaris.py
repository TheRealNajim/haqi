"""Zetaris adapter: recipe-backed SQL + row mapping, fully testable offline."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.adapters.base import AdapterError
from app.adapters.zetaris import ZetarisAdapter, configured
from app.schemas import SourceType


def _row(sid, val, unit, dist, iso):
    return [sid, val, unit, dist, iso]


NOW = datetime.now(timezone.utc)
FRESH_ISO = NOW.isoformat()
STALE_ISO = (NOW - timedelta(days=1)).isoformat()


def test_recipe_sql_matches_the_registered_view():
    sql = ZetarisAdapter()._sql_for(6.5244, 3.3792)
    assert sql == (
        "SELECT source_id, raw_value, unit, distance_km, observed_at "
        "FROM haqi_views.air_quality_readings"
    )


def test_recipe_table_name_is_env_tunable(monkeypatch):
    monkeypatch.setenv("ZETARIS_AQ_TABLE", "haqi_views.other_table")
    assert "FROM haqi_views.other_table" in ZetarisAdapter()._sql_for(0, 0)


def test_unconfigured_gather_is_blind(monkeypatch):
    monkeypatch.delenv("ZETARIS_REST_URL", raising=False)
    monkeypatch.delenv("ZETARIS_API_KEY", raising=False)
    with pytest.raises(AdapterError):
        asyncio.run(ZetarisAdapter().gather(6.5244, 3.3792))


def test_configured_but_recipe_pending(monkeypatch):
    monkeypatch.setenv("ZETARIS_REST_URL", "http://localhost:8888/api/v1.0")
    monkeypatch.setenv("ZETARIS_API_KEY", "k")
    from app.adapters import zetaris as Z
    async def fake_sql(sql, limit=50):
        return [_row("l1", 21.5, "ugm3", None, FRESH_ISO)]
    monkeypatch.setattr(Z, "run_sql", fake_sql)
    evs = asyncio.run(ZetarisAdapter().gather(6.5244, 3.3792))
    assert [e.source_id for e in evs] == ["zetaris:l1"]


def test_good_rows_map_to_evidence():
    rows = [_row("l1", 21.5, "µg/m³", 2.2, FRESH_ISO),
            _row("l2", 33.0, "µg/m³", 5.6, STALE_ISO)]
    evs = ZetarisAdapter()._to_evidence(rows)
    assert len(evs) == 2
    assert evs[0].source_id == "zetaris:l1"
    assert evs[0].staleness_flag is False
    assert evs[1].staleness_flag is True
    assert evs[0].unit == "µg/m³"


def test_malformed_rows_quarantined_not_crash():
    rows = [_row("good", 10.0, "µg/m³", 1.0, FRESH_ISO),
            ["bad", "NaN-ish", None, "??", 12]]  # malformed
    evs = ZetarisAdapter()._to_evidence(rows)
    mapped = [e for e in evs if e.source_id == "zetaris:good"]
    quarantined = [e for e in evs if e.source_id == "zetaris:quarantine"]
    assert mapped and quarantined
    assert quarantined[0].weight == 0.0


def test_all_malformed_is_adapter_error():
    rows = [["bang", "junk", None, None, None]]
    with pytest.raises(AdapterError):
        ZetarisAdapter()._to_evidence(rows)


def test_timeout_surface(monkeypatch):
    from agent import tools_zetaris as tz
    async def boom(sql, limit=100):
        raise tz.ZetarisError("timeout after 60s")
    monkeypatch.setattr(tz, "run_sql", boom)
    ad = ZetarisAdapter()
    with pytest.raises(AdapterError):
        asyncio.run(ad.gather(6.5244, 3.3792))


def test_adapter_joins_loop_only_when_configured(monkeypatch):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from app.adapters.zetaris import ZetarisAdapter
    import app.agent as A
    from app.profiles import get
    prof = get("asthma")
    monkeypatch.setenv("ZETARIS_REST_URL", "http://localhost:8888/api/v1.0")
    monkeypatch.setenv("ZETARIS_API_KEY", "k")
    names_on = [type(a).__name__ for a in A._adapters_for(prof)]
    assert "ZetarisAdapter" in names_on
    monkeypatch.delenv("ZETARIS_REST_URL")
    names_off = [type(a).__name__ for a in A._adapters_for(prof)]
    assert "ZetarisAdapter" not in names_off
