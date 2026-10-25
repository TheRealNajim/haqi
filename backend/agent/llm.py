"""Power layer: NVIDIA Nemotron via Meterless (Option A) or NVIDIA free API (Option B).

All three MODEL_* settings must come from ONE route in .env. If any is missing the
client disables itself and callers fall back to the deterministic path — parse
without Nemotron is plain heuristics, never a crash.
"""
import json
import os
import re
from datetime import datetime, timedelta

_client = None


def _get_client():
    """Lazy init — env may be loaded (dotenv) AFTER this module is imported."""
    global _client
    if _client is None:
        base, key, model = (
            os.getenv("MODEL_BASE_URL"),
            os.getenv("MODEL_API_KEY"),
            os.getenv("NEMOTRON_MODEL"),
        )
        if base and key and model:
            from openai import OpenAI

            _client = OpenAI(base_url=base, api_key=key)
    return _client


def _model_name() -> str:
    return os.getenv("NEMOTRON_MODEL", "")


def chat(system: str, user: str, tools: list | None = None) -> str:
    client = _get_client()
    if client is None:
        raise RuntimeError("MODEL_* env not set — Nemotron path disabled")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    reply = client.chat.completions.create(
        model=_model_name(), messages=messages, tools=tools
    )
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
_NOON_RE = re.compile(r"\b(noon|midday)\b", re.I)
_MIDNIGHT_RE = re.compile(r"\bmidnight\b", re.I)


def parse_question(question: str) -> dict:
    """PARSE step. Nemotron when configured; deterministic fallback otherwise."""
    if _get_client() is not None:
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
    if not m and (_NOON_RE.search(q) or _MIDNIGHT_RE.search(q)):
        # named times carry real meaning; digits never parsed them
        hh = 12 if _NOON_RE.search(q) else 0
        window_dt = now.replace(hour=hh, minute=0, second=0, microsecond=0)
        if window_dt < now:
            window_dt += timedelta(days=1)
        return {
            "activity": activity,
            "time_hh": window_dt.hour,
            "time_desc": window_dt.strftime("%I%p").lstrip("0").lower(),
        }
    if m:
        hh = int(m.group(1))
        mm = int(m.group(3)) if m.group(3) else None
        if hh > 23 or (mm is not None and mm > 59):
            m = None  # "at 27 o'clock" is not a time we can infer
    if m:
        hh, mm = int(m.group(1)), int(m.group(3)) if m.group(3) else 0
        if m.group(4):
            hh = hh % 12 + (12 if m.group(4).lower() == "pm" else 0)
        elif hh <= 9:
            # bare hour with no am/pm: kids mean the afternoon slot first —
            # "4" is 4pm if that is still ahead, else tomorrow 4pm
            hh_pm = (hh % 12) + 12 if hh % 12 else 12
            cand = now.replace(hour=hh_pm, minute=0, second=0, microsecond=0)
            if cand <= now:
                cand += timedelta(days=1)
            return {
                "activity": activity,
                "time_hh": cand.hour,
                "time_desc": cand.strftime("%I%p").lstrip("0").lower(),
            }
        window_dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if window_dt < now:
            window_dt += timedelta(days=1)
    else:
        window_dt = now + timedelta(hours=2)
    return {
        "activity": activity,
        "time_hh": window_dt.hour,
        "time_desc": window_dt.strftime("%I%p").lstrip("0").lower(),
    }
