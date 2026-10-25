"""Offline verification of the no-key contract: .env loading and fixture honesty."""
import asyncio
import os

from app.main import _fixture_verdict, _load_env


def test_fixture_verdict_is_marked_as_fallback():
    v = _fixture_verdict()
    assert v is not None
    assert v.fallback is True


def test_live_investigation_never_marks_fallback():
    from app.agent import investigate
    # offline: every adapter fails -> verdict still real (honest careful), not fixture
    v = asyncio.run(investigate(6.5244, 3.3792))
    assert v.fallback is False
    assert v.ledger_id  # still logged


def test_env_loader_sets_values_and_real_env_beats_dotenv(tmp_path, monkeypatch):
    dot = tmp_path / ".env"
    dot.write_text(
        "# comment line\n"
        'HAQI_TEST_A="with spaces"\n'
        "HAQI_TEST_B=bare\n"
        "this line is not a pair\n"
        "\n"
    )
    monkeypatch.delenv("HAQI_TEST_A", raising=False)
    monkeypatch.setenv("HAQI_TEST_B", "preset")
    _load_env([dot])
    assert os.environ["HAQI_TEST_A"] == "with spaces"
    assert os.environ["HAQI_TEST_B"] == "preset"  # real env beats .env


def test_env_loader_stops_at_first_existing_file(tmp_path):
    saved = dict(os.environ)
    os.environ.pop("HAQI_TEST_C", None)
    try:
        a = tmp_path / "a.env"
        b = tmp_path / "b.env"
        a.write_text("HAQI_TEST_C=from_a\n")
        b.write_text("HAQI_TEST_C=from_b\n")
        _load_env([a, b])
        assert os.environ["HAQI_TEST_C"] == "from_a"
    finally:
        os.environ.clear()
        os.environ.update(saved)


def test_stale_reading_never_crashes_the_ledger(tmp_path, monkeypatch):
    from app.ledger import entry_to_why, log
    monkeypatch.setattr("app.ledger.LEDGER_FILE",
                        __import__("pathlib").Path(tmp_path) / "ledger.jsonl")
    monkeypatch.setattr("app.ledger.DATA_DIR", __import__("pathlib").Path(tmp_path))
    v = {
        "level": "be careful", "window": "now", "reason": "r", "aqi": 88,
        "evidence": [{
            "claim": "c", "source_id": "openaq:404479", "source_type": "station",
            "retrieved_at": "2026-10-22T09:00:00+00:00",
            "observed_at": "2025-02-12T16:00:00+00:00",
            "raw_value": 0.9, "unit": "µg/m³", "confidence": 0.5,
            "staleness_flag": True, "weight": 0.5,
        }],
        "blind_spots": [],
    }
    lid = log(v, "football?", {"lat": 6.5244, "lon": 3.3792})
    why = entry_to_why(lid)
    assert why is not None and why["nodes"]
    assert any("stale" in e["note"] for e in why["edges"])
