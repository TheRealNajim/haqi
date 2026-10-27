"""Unit aliases at the Zetaris intake boundary — recipe ASCII spellings
('ugm3') must not quarantine PM2.5 rows; unknown units still reject loudly."""
import app.adapters.zetaris as z


def test_ugm3_canonicalizes():
    ev = z.ZetarisAdapter()._to_evidence(
        [["open-meteo:lagos", 12.5, "ugm3", 3.2, "2026-10-27T00:00:00Z"]])
    assert len(ev) == 1
    assert ev[0].unit == "µg/m³"
    assert "µg/m³" in ev[0].claim


def test_unknown_unit_passes_through_for_loud_rejection():
    ev = z.ZetarisAdapter()._to_evidence(
        [["x", 1.0, "ppt", None, "2026-10-27T00:00:00Z"]])
    assert ev[0].unit == "ppt"  # untouched — consensus still rejects it


def test_canonical_row_enters_consensus_mean():
    from datetime import datetime, timedelta, timezone

    from app.trust import consensus
    now = datetime.now(timezone.utc)
    adapter = z.ZetarisAdapter()
    fresh = (now - timedelta(minutes=5)).isoformat()
    ev = adapter._to_evidence([["open-meteo:lagos", 12.5, "ugm3", 3.2, fresh]])
    assert ev[0].staleness_flag is False
    aqi, conflicts = consensus([ev[0]])
    assert aqi is not None and aqi > 0
    assert not any("unrecognised" in c for c in conflicts)
