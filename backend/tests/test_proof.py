"""/proof + /api/proof: self-audit payloads must state only checkable facts."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_proof_shape_and_honesty():
    r = client.get("/proof")
    assert r.status_code == 200
    d = r.json()
    assert d["schema_version"] == 1
    assert "/" in d["sources_armed"] and d["sources_armed"].split("/")[0].isdigit()
    for c in d["claims"]:
        # every claim names a real test/handler — links must be to files we ship
        assert c["enforced_by"], c
        assert "backend/tests" in c["enforced_by"] or c["enforced_by"].startswith("app")
    assert d["ledger"]["entries"] >= 0


def test_api_proof_matches_human_proof():
    a = client.get("/proof").json()
    b = client.get("/api/proof").json()
    assert a == b


def test_sources_status_inside_proof_agrees_with_route():
    s = client.get("/sources/status").json()["sources"]
    d = client.get("/proof").json()
    assert {r["adapter"] for r in s} == {r["adapter"] for r in d["sources"]}
