"""Trust scoring — the Innovation layer. Weight evidence, never average blindly."""
from datetime import datetime, timezone

from app.schemas import Evidence


def score(ev: Evidence) -> float:
    """confidence 0..1 from freshness, distance, and source type."""
    now = datetime.now(timezone.utc)
    observed = ev.observed_at or ev.retrieved_at
    age_h = max((now - observed).total_seconds(), 0) / 3600
    freshness = 1.0 if age_h < 1 else max(0.2, 1.0 - (age_h - 1) * 0.1)

    distance = ev.geo_distance_km
    proximity = 1.0 if distance is None else max(0.3, 1.0 - distance / 50.0)

    base = {"station": 0.9, "satellite": 0.7, "forecast": 0.6, "advisory": 0.5}[
        ev.source_type.value
    ]
    return round(base * freshness * proximity, 3)


def apply_weights(evidence: list[Evidence]) -> list[Evidence]:
    """Stamp each item with its weight; stale items get explicitly down-weighted."""
    for ev in evidence:
        w = score(ev)
        if ev.staleness_flag:
            w *= 0.5
        ev.weight = round(w, 3)
        ev.confidence = w
    return evidence


def consensus(evidence: list[Evidence]) -> tuple[float, list[str]]:
    """Weighted-mean value + conflict notes. Divergence between sources is surfaced, not hidden."""
    vals = [(ev.raw_value, ev.weight) for ev in evidence if ev.raw_value is not None]
    if not vals:
        return 0.0, ["no quantitative readings — verdict low confidence"]
    wsum = sum(w for _, w in vals)
    mean = sum(v * w for v, w in vals) / wsum
    conflicts = []
    if len(vals) > 1:
        spread = max(v for v, _ in vals) - min(v for v, _ in vals)
        if spread > 30:  # µg/m³ or aqi — tune per unit later
            conflicts.append(f"sources disagree by {spread:.0f} — weighted toward fresher/closer")
    return round(mean, 1), conflicts
