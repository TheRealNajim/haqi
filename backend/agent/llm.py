"""Power layer: NVIDIA Nemotron via Meterless (Option A) or NVIDIA free API (Option B).

All three MODEL_* settings must come from ONE route in .env. If any is missing the
client disables itself and callers fall back to the deterministic path — parse
without Nemotron is plain heuristics, never a crash.
"""
import json
import os
import re
from datetime import datetime, timedelta

_MODEL = os.getenv("NEMOTRON_MODEL", "")
_client = None
if os.getenv("MODEL_BASE_URL") and os.getenv("MODEL_API_KEY") and _MODEL:
    from openai import OpenAI

    _client = OpenAI(
        base_url=os.environ["MODEL_BASE_URL"], api_key=os.environ["MODEL_API_KEY"]
    )

LLM_ENABLED = _client is not None


def chat(system: str, user: str, tools: list | None = None) -> str:
    if not LLM_ENABLED:
        raise RuntimeError("MODEL_* env not set — Nemotron path disabled")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    reply = _client.chat.completions.create(model=_MODEL, messages=messages, tools=tools)
    msg = reply.choices[0].message
    if msg.tool_calls:
        return json.dumps(
            [{"name": tc.function.name, "args": tc.function.arguments}
             for tc in msg.tool_calls]
        )
    return msg.content or ""


_ACTIVITY_WORDS = {
    "football": "sports", "soccer": "sports", "cricket": "sports", "cycling": "cycle",
    "bike": "cycle", "run": "run", "jog": "run", "walk": "walk", "park": "park",
    "play": "play",
}

_TIME_RE = re.compile(r"(\d{1,2})([:.]?)(\d{2})?\s*(am|pm)?", re.I)


def parse_question(question: str) -> dict:
    """PARSE step. Nemotron when configured; deterministic fallback otherwise."""
    if LLM_ENABLED:
        try:
            out = chat(
                "Extract {activity, time_hh, time_desc} from this kid question. "
                "Reply ONLY compact JSON.",
                question,
            )
            data = json.loads(out)
            if isinstance(data, dict) and data.get("activity"):
                return data
        except Exception:
            pass  # fall through to heuristics — never block on the power layer
    q = (question or "").lower()
    activity = "play"
    for word, canon in _ACTIVITY_WORDS.items():
        if word in q:
            activity = canon
            break
    m = _TIME_RE.search(q)
    now = datetime.now()
    if m:
        hh = min(int(m.group(1)), 23)
        if m.group(3):
            hh = min(hh, 23)
        if m.group(4):
            hh = hh % 12 + (12 if m.group(4).lower() == "pm" else 0)
        window_dt = now.replace(hour=hh, minute=0, second=0, microsecond=0)
        if window_dt < now:
            window_dt += timedelta(days=1)
    else:
        window_dt = now + timedelta(hours=2)
    return {
        "activity": activity,
        "time_hh": window_dt.hour,
        "time_desc": window_dt.strftime("%I%p").lstrip("0").lower(),
    }
