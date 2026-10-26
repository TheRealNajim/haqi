"""Data layer: run_sql against local Zetaris over REST. Guide-verified request shape."""
import os
import uuid

import httpx


class ZetarisError(Exception):
    pass


async def run_sql(sql: str, limit: int = 100) -> list[list]:
    url = os.environ["ZETARIS_REST_URL"].rstrip("/") + "/sql-editor/sqls/run"
    headers = {
        "Authorization": "Bearer " + os.environ["ZETARIS_API_KEY"],
        "X-Org-ID": os.environ.get("ZETARIS_ORG_ID", "1"),
        "X-Request-ID": str(uuid.uuid4()),  # fresh UUID per request, per guide
    }
    body = {"queryId": str(uuid.uuid4()), "sql": sql, "source": "SqlEditor", "limit": limit}
    # agent-loop safety: a stalled tunnel must not hang /ask, so the default
    # timeout is short; drive it up only for one-off deep queries
    timeout = float(os.getenv("ZETARIS_TIMEOUT", "10"))
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, headers=headers, json=body)
    if r.status_code >= 400:
        raise ZetarisError(f"{r.status_code}: {r.text[:200]}")
    return r.json().get("data", [])
