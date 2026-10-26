"""Zetaris liveness field on /sources/status (env-armed != host-up)."""
import app.main as main


def test_no_reachable_field_when_not_configured(monkeypatch):
    for k in ("ZETARIS_REST_URL", "ZETARIS_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    from fastapi.testclient import TestClient
    client = TestClient(main.app)
    body = client.get("/sources/status").json()
    zeta = next(s for s in body["sources"] if s["adapter"] == "ZetarisAdapter")
    assert zeta["configured"] is False
    assert "reachable" not in zeta


def test_reachable_false_when_host_down(monkeypatch):
    monkeypatch.setenv("ZETARIS_REST_URL", "http://127.0.0.1:59999/api/v1.0")
    monkeypatch.setenv("ZETARIS_API_KEY", "offline-test")
    monkeypatch.setattr(main, "_ZETA_CACHE", None)  # bypass the 60s cache

    async def _down(url):
        return False

    monkeypatch.setattr(main, "_probe_reachable", _down)
    from fastapi.testclient import TestClient
    client = TestClient(main.app)
    body = client.get("/sources/status").json()
    zeta = next(s for s in body["sources"] if s["adapter"] == "ZetarisAdapter")
    assert zeta["configured"] is True
    assert zeta["reachable"] is False

    body2 = client.get("/sources/status").json()
    mle = next(s for s in body2["sources"]
               if s["adapter"] == "MeterlessNarration")
    assert mle["configured"] is False
    assert "reachable" not in mle
