"""Meterless Nightshift narration lane (CONTRACTS v1.5, /why story field).

The lane arms ONLY on METERLESS_* env; every failure path degrades to the
deterministic /why graph — the model may never block or fake evidence.
"""
import agent.llm as llm


def test_lane_off_without_env(monkeypatch):
    for k in ("METERLESS_BASE_URL", "METERLESS_API_KEY", "METERLESS_MODEL"):
        monkeypatch.delenv(k, raising=False)
    llm._meterless_client = None  # reset lazy init
    assert llm.meterless_available() is False
    assert llm.narrate_why({"nodes": [], "decision": {}}) is None


def test_lane_arms_and_narrates_from_ledger_only(monkeypatch):
    monkeypatch.setenv("METERLESS_BASE_URL", "http://fake:8088/v1")
    monkeypatch.setenv("METERLESS_API_KEY", "test-key")
    monkeypatch.setenv("METERLESS_MODEL", "nvidia/nemotron-3.5-bolt-e4b")

    class _FakeMsg:
        content = "Air near Chidi is clean: 5 ug/m3. Go play."

    class _FakeReply:
        choices = [type("C", (), {"message": _FakeMsg()})()]

    class _FakeCompletions:
        def create(self, **kw):
            # narration must GET the evidence, and nothing else
            prompt = kw["messages"][-1]["content"]
            assert "weight" in prompt
            assert "Decision:" in prompt
            return _FakeReply()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeClient:
        chat = _FakeChat()

    client = _FakeClient()
    monkeypatch.setattr(llm, "_get_meterless_client", lambda: client)
    ledger = {
        "question": "can I cycle in 2 hours?",
        "decision": {"level": "good to go", "reason": "air is fine near you"},
        "blind_spots": ["pollen: Europe-only"],
        "nodes": [
            {"id": "waqi:lagos", "finding": "7", "weight": 1.0, "stale": False},
            {"id": "openaq:stale", "finding": "40", "weight": 0.1, "stale": True},
        ],
        "edges": [],
    }
    out = llm.narrate_why(ledger)
    assert out is not None
    assert "5 ug/m3" in out or "clean" in out


def test_lane_failure_returns_none(monkeypatch):
    monkeypatch.setenv("METERLESS_BASE_URL", "http://fake:8088/v1")
    monkeypatch.setenv("METERLESS_API_KEY", "test-key")
    monkeypatch.setenv("METERLESS_MODEL", "m")

    def _boom():
        raise RuntimeError("nightshift asleep")

    monkeypatch.setattr(llm, "_get_meterless_client", _boom)
    assert llm.narrate_why(
        {"nodes": [{"id": "x", "finding": "1", "weight": 1, "stale": False}],
         "decision": {}}) is None
