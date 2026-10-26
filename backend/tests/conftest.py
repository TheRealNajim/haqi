import pytest


@pytest.fixture(autouse=True)
def offline_parse(monkeypatch):
    """Unit tests are deterministic: the LLM path never runs — heuristics +/-
    regex floor only. Live-keyed behavior is asserted by smoke_test INFRA checks,
    never inside the offline suite (keys would make reruns flaky and slow).
    The merge behavior itself is unit-tested with a fake client below."""
    import os
    import agent.llm as L
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("MODEL_BASE_URL", raising=False)
    monkeypatch.setattr(L, "_get_client", lambda: None)
    yield
