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


_meterless_client = None


def _get_meterless_client():
    """The Meterless Nightshift lane (sponsor Build/Power layer). Nightshift
    serves one OpenAI-compatible base URL + key from the machine it runs on.
    Separate from the MODEL_* parse lane: right model, right lane. Missing
    env = lane disabled, callers keep the deterministic path."""
    global _meterless_client
    if _meterless_client is None:
        base, key, model = (
            os.getenv("METERLESS_BASE_URL"),
            os.getenv("METERLESS_API_KEY"),
            os.getenv("METERLESS_MODEL"),
        )
        if base and key and model:
            from openai import OpenAI

            _meterless_client = OpenAI(base_url=base, api_key=key)
    return _meterless_client


def meterless_model_name() -> str:
    return os.getenv("METERLESS_MODEL", "")


def meterless_available() -> bool:
    return _get_meterless_client() is not None


def narrate_why(ledger: dict) -> str | None:
    """WHY narration lane (Meterless). One honest paragraph for a 14-year-old,
    strictly from the logged evidence chain — the ledger is the only source of
    truth, the model may add zero facts. Any failure returns None; /why keeps
    serving the deterministic graph without the story field."""
    rows = []
    for node in ledger.get("nodes", []):
        if node.get("id") == "verdict":
            continue
        flag = " (STALE — counts less)" if node.get("stale") else ""
        rows.append(
            f"- {node['id']}: {node.get('finding')} "
            f"[weight {node.get('weight')}]{flag}"
        )
    if not rows:
        return None
    decision = ledger.get("decision", {})
    blind = "; ".join(ledger.get("blind_spots", [])) or "none logged"
    try:
        client = _get_meterless_client()
        if client is None:
            return None
        reply = client.chat.completions.create(
            model=meterless_model_name(),
            messages=[
                {"role": "system", "content": (
                    "You explain a data verdict to a smart 14-year-old. Use ONLY "
                    "the evidence listed. 3 to 5 short sentences, plain English, "
                    "no new numbers, no advice beyond resting on stale or missing "
                    "data. Never say 'as an AI'. If a reading was stale or a "
                    "source was blind, say so."
                )},
                {"role": "user", "content": (
                    f"Question: {ledger.get('question', 'now')}\n"
                    f"Decision: {decision.get('level')} — {decision.get('reason')}\n"
                    f"Blind spots: {blind}\n"
                    "Evidence:\n" + "\n".join(rows)
                )},
            ],
            timeout=15,
        )
        return (reply.choices[0].message.content or "").strip() or None
    except Exception:
        return None


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


def _time_floor(q: str) -> dict | None:
    """Deterministic time reading: relative offsets and named times the model
    cannot be trusted to decode alone. These patterns, when matched, beat the
    LLM's guess — horizon honesty depends on the time being exactly right."""
    now = datetime.now()
    m = _TIME_RE.search(q)
    m_rel = re.search(r"in\s+(\d{1,2})\s*(hours?|hrs?)\b", q)
    if m_rel:
        # "in 2 hours" is a relative offset, not the 2 o'clock slot; the bare
        # hour reading that branch used to return was off by ~7 hours
        n = int(m_rel.group(1))
        if 1 <= n <= 12:
            window_dt = now + timedelta(hours=n)
            return {
                "time_hh": window_dt.hour,
                "time_desc": window_dt.strftime("%I%p").lstrip("0").lower(),
            }
    if not m and (_NOON_RE.search(q) or _MIDNIGHT_RE.search(q)):
        # named times carry real meaning; digits never parsed them
        hh = 12 if _NOON_RE.search(q) else 0
        window_dt = now.replace(hour=hh, minute=0, second=0, microsecond=0)
        if window_dt < now:
            window_dt += timedelta(days=1)
        return {
            "time_hh": window_dt.hour,
            "time_desc": window_dt.strftime("%I%p").lstrip("0").lower(),
        }
    return None


def parse_question(question: str) -> dict:
    """PARSE step. Nemotron when configured; deterministic fallback otherwise."""
    q_all = (question or "").lower()
    floor = _time_floor(q_all)
    if _get_client() is not None:
        try:
            out = chat(
                "Extract {activity, time_hh, time_desc} from this kid question. "
                "time_hh is a 0-23 integer in the kid's local clock. time_desc is "
                "a full short label like '4pm' or 'noon' (never just 'am'/'pm'). "
                "Reply ONLY compact JSON.",
                question,
            )
            data = json.loads(out)
            if isinstance(data, dict) and data.get("activity"):
                # times are safety-adjacent (horizon rule): a regex-provable
                # reading always wins over the model's free-text decode
                if floor is not None:
                    data["time_hh"] = floor["time_hh"]
                    data["time_desc"] = floor["time_desc"]
                try:  # models like strings; the horizon math needs ints
                    data["time_hh"] = int(data.get("time_hh", 0))
                except (TypeError, ValueError):
                    data["time_hh"] = 0  # "now" — the safe default
                return data
            raise ValueError("model reply not a usable parse")
        except Exception:
            pass  # fall through to heuristics — never block on the power layer
    q = (question or "").lower()
    activity = "play"
    for word, canon in _ACTIVITY_WORDS.items():
        if word in q:
            activity = canon
            break
    floor = _time_floor(q)
    if floor:
        return {"activity": activity, **floor}
    m = _TIME_RE.search(q)
    now = datetime.now()
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
