"""The trust ledger — every verdict gets a receipt (Meterless H-MEM story).

Append-only JSONL: one entry = decision + inputs seen + weights + conflicts.
/why/{id} renders an entry as nodes/edges for the Why graph (CONTRACTS.md).
Idempotency: keys are verdict ids; same id never written twice.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(os.getenv("HAQI_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
LEDGER_FILE = DATA_DIR / "ledger.jsonl"

_ID_OK = re.compile(r"-?[A-Za-z0-9_.-]{1,128}$")


def _safe(id: str) -> bool:
    return bool(_ID_OK.match(id)) and ".." not in id


def log(verdict: dict, question: str, location: dict) -> str:
    """Write one entry. Returns the ledger id."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ledger_id = f"ledger-{uuid.uuid4().hex[:8]}"
    evidence = verdict.get("evidence", [])
    entry = {
        "ledger_id": ledger_id,
        "schema_version": 1,
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "question": question,
        "location": location,
        "decision": {
            "level": verdict.get("level"),
            "window": verdict.get("window"),
            "reason": verdict.get("reason"),
            "aqi": verdict.get("aqi"),
        },
        "blind_spots": verdict.get("blind_spots", []),
        "inputs": [
            {
                "source_id": e.get("source_id"),
                "source_type": e.get("source_type"),
                "raw_value": e.get("raw_value"),
                "unit": e.get("unit"),
                "weight": e.get("weight"),
                "stale": e.get("staleness_flag", False),
            }
            for e in evidence
        ],
        "conflicts": [v for e in evidence if e.get("staleness_flag")]
        and [f"down-weighted stale: {e['source_id']}"
             for e in evidence if e.get("staleness_flag")] or [],
    }
    with LEDGER_FILE.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return ledger_id


def entry_to_why(ledger_id: str) -> dict | None:
    """Render a logged entry the /why/{id} contract shape. None = unknown id."""
    if not _safe(ledger_id):
        return None
    if not LEDGER_FILE.exists():
        return None
    for line in LEDGER_FILE.read_text().splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("ledger_id") != ledger_id:
            continue
        nodes = []
        edges = []
        for row in entry.get("inputs", []):
            node_id = row["source_id"]
            stale = bool(row.get("stale"))
            finding = f"{row.get('raw_value')} {row.get('unit') or ''}".strip() or "no reading"
            nodes.append({
                "id": node_id,
                "type": row.get("source_type") or "station",
                "label": node_id.split(":", 1)[-1],
                "weight": row.get("weight"),
                "stale": stale,
                "finding": finding,
                "source_url": "",
            })
            edges.append({
                "from": node_id,
                "to": "verdict",
                "note": "down-weighted stale reading" if stale else "weighted finding",
            })
        decision = entry["decision"]
        nodes.append({
            "id": "verdict",
            "type": "verdict",
            "label": decision["level"] or "",
            "weight": 1.0,
            "stale": False,
            "finding": decision["reason"],
            "source_url": "",
        })
        return {
            "schema_version": 1,
            "ledger_id": ledger_id,
            "logged_at": entry.get("logged_at"),
            "question": entry.get("question"),
            "decision": decision,
            "blind_spots": entry.get("blind_spots", []),
            "nodes": nodes,
            "edges": edges,
        }
    return None
