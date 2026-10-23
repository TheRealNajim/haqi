"""The investigation loop: PARSE -> GATHER -> SCORE -> CONNECT -> VERDICT -> LOG."""
from datetime import datetime, timezone

from agent.llm import parse_question
from app.adapters.advisory import AdvisoryAdapter
from app.adapters.base import AdapterError, BaseAdapter
from app.adapters.fire import FireAdapter
from app.adapters.openaq import OpenAQAdapter
from app.adapters.pollen import PollenAdapter
from app.adapters.weather import WeatherAdapter
from app.profiles import Profile, get as get_profile
from app.schemas import SourceType, Verdict, VerdictLevel
from app.trust import apply_weights, consensus

_STATION_LIKE = (OpenAQAdapter, WeatherAdapter, FireAdapter)

# activities that raise the inhaled dose (effective PM multiplier)
_ACTIVE = {"sports", "run", "cycle", "play", "walk"}


def _adapters_for(profile: Profile) -> list[BaseAdapter]:
    """Pollen only matters for the pollen profile; Europe-only source (CAMS)."""
    adapters: list[BaseAdapter] = [OpenAQAdapter(), WeatherAdapter(), FireAdapter()]
    if profile.name == "pollen_allergy":
        adapters.append(PollenAdapter())
    adapters.append(AdvisoryAdapter())
    return adapters


async def investigate(
    lat: float, lon: float, question: str | None = None, profile_name: str | None = None
) -> Verdict:
    parsed = parse_question(question) if question else {
        "activity": "now", "time_hh": None, "time_desc": "now"
    }
    profile = get_profile(profile_name or (_profile_from_question(question) if question else None))
    exertion: float = (
        parsed.get("activity") in _ACTIVE and profile.exertion_multiplier
    ) or 1.0

    evidence, blind = [], []
    stages = []
    for adapter in _adapters_for(profile):
        try:
            found = await adapter.gather(lat, lon)
            evidence.extend(found)
            stages.append({"adapter": adapter.source_type, "found": len(found), "ok": True})
        except AdapterError as e:
            blind.append(str(e))
            stages.append({"adapter": adapter.source_type, "ok": False, "detail": str(e)})
        else:
            note = getattr(adapter, "primary_error", None)
            if note:  # fallback covered it, but the judge still reads why
                blind.append(note)
                stages.append({"adapter": adapter.source_type, "ok": True,
                               "note": note})

    evidence = apply_weights(evidence)
    value_raw, conflicts = consensus(evidence)
    value = value_raw * exertion
    blind.extend(conflicts)

    # Never bless a blind verdict: when consensus has nothing comparable, the
    # safest honest level is "be careful" — uncertainty is not a green light.
    no_data = any("no quantitative readings" in c for c in conflicts)
    fresh_quant = [
        e for e in evidence
        if e.source_type is SourceType.STATION and not e.staleness_flag
    ]
    stale_only = bool(evidence) and not fresh_quant
    level, window, reason = _verdict(value, profile, parsed, bool(question), exertion, value_raw)
    if no_data:
        level = VerdictLevel.CAREFUL
        window = "treat as uncertain"
        reason = (
            "we couldn't reach enough air data to check — "
            + f"sources reporting: {sum(1 for s in stages if s.get('ok'))}/"
            + str(len(stages))
            + " — act cautious, not confident"
        )
    if stale_only:
        # stale-only data never blesses a green light: down-weighted numbers are
        # opinions from yesterday, and the verdict must say so
        blind.append(
            "the nearest station readings are more than an hour old — "
            "weights dropped until a fresh source confirms"
        )
        level = VerdictLevel.CAREFUL
        window = "treat as uncertain"
        reason = (
            "our freshest sensors are quiet — the nearest readings are old — "
            + "treat cautiously, not confidently"
        )
        value_raw = None  # don't publish a stale number as live AQI

    verdict = Verdict(
        schema_version=1,
        level=level,
        window=window,
        reason=reason,
        aqi=int(value_raw) if value_raw else None,
        evidence=evidence,
        blind_spots=blind,
    )
    from app.ledger import log as ledger_log

    verdict.ledger_id = ledger_log(
        verdict.model_dump(mode="json"),
        question=question or "today?",
        location={"lat": lat, "lon": lon},
    )
    return verdict


def _profile_from_question(question: str) -> str | None:
    q = (question or "").lower()
    if any(w in q for w in ("asthma", "inhaler")):
        return "asthma"
    if any(w in q for w in ("allergy", "pollen", "sneeze")):
        return "pollen_allergy"
    if any(w in q for w in ("training", "athlete", "gym")):
        return "athlete"
    return None


def _verdict(value, profile, parsed, named_window: bool, exertion, value_raw):
    if value <= profile.good_max:
        level, window = VerdictLevel.GOOD, "now"
        reason = "air is fine near you"
    elif value <= profile.careful_max:
        level, window = VerdictLevel.CAREFUL, "limit hard running"
        reason = "air is building up — go if you must, keep it light"
    else:
        level, window = VerdictLevel.STAY_IN, "today"
        reason = "air is bad right now — indoor is smarter"
    if level == VerdictLevel.STAY_IN:
        reason += f" ({profile.name} lungs)"
    if named_window and parsed.get("time_desc") and parsed["time_desc"] != "now":
        window = f"at {parsed['time_desc']}"
    if exertion > 1.0 and value_raw and level != VerdictLevel.STAY_IN:
        reason += f" (your {parsed.get('activity', 'activity')} raises the dose x{exertion})"
    return level, window, reason
