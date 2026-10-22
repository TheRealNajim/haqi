"""Trust scoring — the Innovation layer. Weight evidence, never average blindly."""
from datetime import datetime, timezone

from app.schemas import Evidence


# US EPA AQI PM2.5 breakpoints: (aqi_low, aqi_high, pm25_low, pm25_high)
_EPA_BREAKS = [
    (0, 50, 0.0, 9.0),
    (51, 100, 9.1, 35.4),
    (101, 150, 35.5, 55.4),
    (151, 200, 55.5, 125.4),
    (201, 300, 125.5, 225.4),
    (301, 500, 225.5, 500.4),
]


def pm25_from_aqi(aqi: float) -> float:
    """Inverse of the EPA US AQI pm2.5 conversion; linear interpolation within
    the band. Rounded to 0.1 — the interpolation itself never overstates accuracy."""
    clamp = max(0.0, min(aqi, 500.0))
    for lo, hi, plo, phi in _EPA_BREAKS:
        if clamp <= hi:
            frac = (clamp - lo) / (hi - lo)
            est = plo + frac * (phi - plo)
            return round(est, 1)
    return 500.4


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
    """Weighted-mean value + conflict notes. Divergence between sources is surfaced, not hidden.

    Only comparable air readings (pm25 µg/m³, aqi) enter the mean — context evidence
    like wind speed (m/s) or probabilities must never skew the AQI verdict.
    """
    COMPARABLE_UNITS = ("µg/m³", "aqi")
    vals = [
        (ev.raw_value, ev.weight)
        for ev in evidence
        if ev.raw_value is not None and (ev.unit in COMPARABLE_UNITS)
    ]
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
