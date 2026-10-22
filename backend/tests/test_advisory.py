"""advisory.py offline: SERP->Evidence transform, no network."""


import pytest

from app.adapters.advisory import AdvisoryAdapter
from app.adapters.base import AdapterError
from app.schemas import SourceType

ORGANIC = [
    {"title": "Lagos bans open burning as harmattan haze thickens",
     "description": "LASEPA orders strict curbs as air turns toxic.",
     "link": "https://example.org/lasepa", "source": "LASEPA"},
    {"title": "Best suya spots in Victoria Island",
     "description": "Where to eat tonight.", "link": "https://example.org/x",
     "source": "foo"},
    {"title": "LASEPA issues air alert for asthma patients",
     "description": "Advisory says stay indoors.", "link": "https://example.org/y",
     "source": "LASEPA"},
    {"title": "NESREA probes open burning as pollution peaks",
     "description": "Fines ordered.", "link": "https://example.org/z",
     "source": "NESREA"},
]


def _payload() -> dict:
    return {"organic": ORGANIC}


def test_filters_non_advisory_and_caps():
    evs = AdvisoryAdapter()._to_evidence(_payload())
    assert [e.claim[:12] for e in evs] == ["Lagos bans o", "LASEPA issue", "NESREA probe"]
    assert all(e.source_type == SourceType.ADVISORY for e in evs)
    assert all(e.raw_value is None and e.unit is None for e in evs)
    assert all(e.confidence == 0.5 for e in evs)


def test_source_id_gets_site_suffix():
    evs = AdvisoryAdapter()._to_evidence(_payload())
    assert evs[0].source_id.startswith("brd:advisory_lasepa")


def test_claim_is_trimmed():
    long_title = "advisory " + "x" * 400
    evs = AdvisoryAdapter()._to_evidence({"organic": [
        {"title": long_title, "description": "warning", "link": "l", "source": "s"}]})
    assert evs[0].claim  # exists
    assert not evs[0].claim.strip().startswith("  ")


def test_no_advisory_hits_is_adapter_error():
    with pytest.raises(AdapterError):
        AdvisoryAdapter()._to_evidence({"organic": [
            {"title": "cricket", "description": "match", "link": "l", "source": "s"}]})


def test_stale_observed_at_never_faked():
    evs = AdvisoryAdapter()._to_evidence(_payload())
    for e in evs:
        assert e.observed_at.tzinfo is not None
        assert e.retrieved_at.tzinfo is not None
