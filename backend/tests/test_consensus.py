"""consensus(): unit normalization + stale exclusion + conflicts, judge-checked."""
from datetime import datetime, timedelta, timezone

from app.schemas import Evidence, SourceType, VerdictLevel  # noqa: F401
from app.trust import apply_weights, consensus


def _ev(sid, val, unit="µg/m³", stale=False, dist=5.0, w=None):
    now = datetime.now(timezone.utc)
    return Evidence(
        claim=f"{sid} reading {val} {unit}",
        source_id=sid, source_type=SourceType.STATION,
        retrieved_at=now,
        observed_at=now - (timedelta(days=300) if stale else timedelta(minutes=5)),
        raw_value=val, unit=unit, geo_distance_km=dist,
        staleness_flag=stale,
    )


def test_equivalent_sources_average_weighted():
    evs = apply_weights([_ev("a", 10), _ev("b", 20)])
    val, conflicts = consensus(evs)
    assert val == 15.0  # equal distances/weights -> plain mean of 10 and 20
    assert conflicts == []


def test_conflicting_sources_surface_spread():
    evs = apply_weights([_ev("a", 10), _ev("b", 90)])
    val, conflicts = consensus(evs)
    assert any("disagree by 80" in c for c in conflicts)


def test_stale_rows_never_enter_mean_but_are_disclosed():
    evs = apply_weights([_ev("fresh", 20), _ev("old", 149, stale=True)])
    val, conflicts = consensus(evs)
    assert val == 20.0
    assert any("stale" in c and "149" in c for c in conflicts)


def test_aqi_never_blends_with_mass():
    v1 = _ev("mass", 30, unit="µg/m³")
    v2 = _ev("scale", 95, unit="aqi")
    apply_weights([v1, v2])
    val, conflicts = consensus([v1, v2])
    assert val == 30.0
    assert any("mixed quantitative scales" in c for c in conflicts)


def test_unknown_units_rejected_loudly():
    v = _ev("weird", 5, unit="furlongs")
    val, conflicts = consensus([v])
    assert val == 0.0
    assert any("unsupported units" in c for c in conflicts)


def test_context_rows_never_skew_the_mean():
    from app.schemas import Evidence as E
    now = datetime.now(timezone.utc)
    wind = E(claim="wind calm", source_id="ow:wind", source_type=SourceType.FORECAST,
             retrieved_at=now, observed_at=now, raw_value=1.8, unit="m/s",
             geo_distance_km=None, staleness_flag=False)
    air = _ev("a", 14)
    val, _ = consensus([wind, air])
    assert val == 14.0
