"""Pre-flight: 3 checks - Zetaris web, Zetaris SQL over REST, Nemotron reply.
Run from project root with Zetaris running:  python smoke_test.py
Expect: PASS PASS PASS. FAIL lines carry the error - paste them to the architect verbatim."""
import os
import uuid

import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
results = []


def check(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
    except Exception as e:
        results.append(("FAIL", name, str(e)[:150]))


def need(*names):
    for n in names:
        assert os.environ.get(n), f"{n} missing from .env"


def zetaris_web():
    requests.get(os.environ.get("ZETARIS_BASE_URL", "http://localhost:3000"), timeout=10).raise_for_status()


def zetaris_sql():
    need("ZETARIS_REST_URL", "ZETARIS_ORG_ID", "ZETARIS_API_KEY")
    r = requests.post(
        os.environ["ZETARIS_REST_URL"].rstrip("/") + "/sql-editor/sqls/run",
        headers={
            "Authorization": "Bearer " + os.environ["ZETARIS_API_KEY"],
            "X-Org-ID": os.environ["ZETARIS_ORG_ID"],
            "X-Request-ID": str(uuid.uuid4()),
        },
        json={"queryId": str(uuid.uuid4()), "sql": "SELECT 1", "source": "SqlEditor", "limit": 1},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json().get("data")
    assert data and str(data[0][0]) == "1", "unexpected reply: " + r.text[:80]


def nemotron():
    need("MODEL_BASE_URL", "MODEL_API_KEY", "NEMOTRON_MODEL")
    client = OpenAI(base_url=os.environ["MODEL_BASE_URL"], api_key=os.environ["MODEL_API_KEY"])
    reply = client.chat.completions.create(
        model=os.environ["NEMOTRON_MODEL"],
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
    )
    assert reply.choices, "no reply"


check("Data: Zetaris web interface", zetaris_web)
check("Data: Zetaris SQL over REST", zetaris_sql)
check("Power: Nemotron replies", nemotron)
for status, name, detail in results:
    print(f"{status} {name} {detail}")
