from datetime import datetime, timedelta, timezone

from app.schemas import Evidence, SourceType
from app.trust import apply_weights, consensus


def ev(**kw):
    base = dict(
        claim="x", source_id="s", source_type=SourceType.STATION,
        retrieved_at=datetime.now(timezone.utc),
    )
    base.update(kw)
    return Evidence(**base)


def test_stale_reading_is_downweighted():
    old = datetime.now(timezone.utc) - timedelta(hours=6)
    fresh = apply_weights([ev(observed_at=old, staleness_flag=True)])[0]
    assert fresh.weight < 0.5


def test_far_station_scores_lower_than_near():
    near = apply_weights([ev(geo_distance_km=2.0)])[0]
    far = apply_weights([ev(geo_distance_km=40.0)])[0]
    assert near.weight > far.weight


def test_conflict_is_surfaced_not_averaged_silently():
    a = ev(raw_value=40.0, weight=0.9)
    b = ev(raw_value=120.0, weight=0.6)
    mean, conflicts = consensus([a, b])
    assert conflicts, "divergence must be reported"
    assert 40 < mean < 120


def test_empty_quantitative_evidence_yields_low_confidence():
    _, conflicts = consensus([ev(raw_value=None)])
    assert conflicts
