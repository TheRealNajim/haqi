"""Browser preflight for POST /ask must pass from the production origin.

The 26 Oct outage: browsers send OPTIONS /ask with method=POST before every
cross-origin ask; allow_methods was ["GET", "OPTIONS"], so every browser
preflight failed and the site reported HAQI offline while curl POSTs worked.
"""
import importlib
import app.main as main
from fastapi.testclient import TestClient


def _rebuilt(monkeypatch):
    monkeypatch.setenv("HAQI_CORS_ORIGINS", "https://haqi-one.vercel.app")
    m = importlib.reload(main)
    return TestClient(m.app)


def test_preflight_post_from_prod_origin(monkeypatch):
    client = _rebuilt(monkeypatch)
    r = client.options("/ask", headers={
        "Origin": "https://haqi-one.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert r.status_code == 200, (r.status_code, dict(r.headers))
    assert "POST" in [m.strip() for m in r.headers["access-control-allow-methods"].split(",")]
    assert r.headers["access-control-allow-origin"] == "https://haqi-one.vercel.app"


def test_preflight_unknown_origin_rejected(monkeypatch):
    client = _rebuilt(monkeypatch)
    r = client.options("/ask", headers={
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
    })
    assert r.status_code == 400
