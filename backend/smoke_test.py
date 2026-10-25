"""Pre-flight, split so no one is ever blocked:

LOCAL (any machine, no infra)  - expect PASS
INFRA (Zetaris x2, Nemotron)   - SKIP while the service is not running;
                                 FAIL only when it IS configured and broken
Run:  python backend/smoke_test.py   (or pytest backend/tests for the full suite)
Exit code is 0 unless an INFRA check was configured and failed, so demos can
call this from a script without infra being up.
"""
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402  (also loads .env at import)

results = []


def record(status, name, detail=""):
    results.append((status, name, detail))


def check_local(name, fn):
    try:
        fn()
        record("PASS", name)
    except Exception as e:
        record("FAIL", name, str(e)[:160])


def check_infra(name, envs, fn):
    if not all(os.environ.get(v) for v in envs):
        record("SKIP", name, f"set {'/'.join(envs)} when the service is up")
        return
    try:
        fn()
        record("PASS", name)
    except Exception as e:
        record("FAIL", name, str(e)[:160])


# ---- LOCAL checks -------------------------------------------------------
def armed_sources_known():
    body = TestClient(app).get("/sources/status").json()
    rows = body["sources"]
    assert len(rows) == 6, rows
    assert body["schema_version"] == 1


def offline_verdict_and_ledger_write():
    from app.agent import investigate

    v = asyncio.run(investigate(6.5244, 3.3792))
    assert v.schema_version == 1
    assert v.ledger_id
    assert v.fallback is False


def proof_route_states_facts():
    c = TestClient(app)
    assert c.get("/proof").json() == c.get("/api/proof").json()


def fixture_fallback_labelled():
    from app.main import _fixture_verdict

    v = _fixture_verdict()
    assert v is not None and v.fallback is True


def ledger_entries_stable():
    from app.ledger import LEDGER_FILE

    entries = (
        sum(1 for line in LEDGER_FILE.read_text().splitlines() if line.strip())
        if LEDGER_FILE.exists() else 0
    )
    record("PASS", f"ledger entries so far: {entries}")


# ---- INFRA checks -------------------------------------------------------
def zetaris_sql():
    r = httpx.post(
        os.environ["ZETARIS_REST_URL"].rstrip("/") + "/sql-editor/sqls/run",
        headers={
            "Authorization": "Bearer " + os.environ["ZETARIS_API_KEY"],
            "X-Org-ID": os.environ.get("ZETARIS_ORG_ID", "1"),
            "X-Request-ID": str(uuid.uuid4()),
        },
        json={"queryId": str(uuid.uuid4()), "sql": "SELECT 1",
              "source": "SqlEditor", "limit": 1},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json().get("data")
    assert data and str(data[0][0]) == "1", "unexpected reply: " + r.text[:80]


def nemotron():
    from openai import OpenAI

    client = OpenAI(base_url=os.environ["MODEL_BASE_URL"],
                    api_key=os.environ["MODEL_API_KEY"])
    reply = client.chat.completions.create(
        model=os.environ["NEMOTRON_MODEL"],
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
    )
    assert reply.choices, "no reply"


if __name__ == "__main__":
    check_local("LOCAL app boots + /sources/status shape", armed_sources_known)
    check_local("LOCAL offline verdict chains + ledger writes", offline_verdict_and_ledger_write)
    check_local("LOCAL /proof == /api/proof", proof_route_states_facts)
    check_local("LOCAL fixture answer labelled via fallback flag", fixture_fallback_labelled)
    check_local("LOCAL ledger readable", ledger_entries_stable)
    check_infra("INFRA Zetaris SQL over REST",
                ["ZETARIS_REST_URL", "ZETARIS_API_KEY"], zetaris_sql)
    check_infra("INFRA Nemotron replies",
                ["MODEL_BASE_URL", "MODEL_API_KEY", "NEMOTRON_MODEL"], nemotron)

    fails = 0
    for status, name, detail in results:
        print(f"{status} {name} {detail}")
        if status == "FAIL":
            fails += 1
    sys.exit(1 if fails else 0)
