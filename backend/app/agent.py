"""The investigation loop: gather -> weight -> connect -> verdict."""
from app.adapters.base import AdapterError, BaseAdapter
from app.adapters.openaq import OpenAQAdapter
from app.schemas import Verdict, VerdictLevel
from app.trust import apply_weights, consensus

ADAPTERS: list[BaseAdapter] = [OpenAQAdapter()]  # + weather, fire, pollen on Days 1-2


async def investigate(lat: float, lon: float, question: str | None = None) -> Verdict:
    evidence, blind = [], []
    for adapter in ADAPTERS:
        try:
            evidence.extend(await adapter.gather(lat, lon))
        except AdapterError as e:
            blind.append(str(e))  # degrade gracefully — say what we can't see

    evidence = apply_weights(evidence)
    value, conflicts = consensus(evidence)
    blind.extend(conflicts)

    if value <= 50:
        level, window = VerdictLevel.GOOD, "now"
        reason = "air is fine near you right now"
    elif value <= 100:
        level, window = VerdictLevel.CAREFUL, "limit hard outdoor exercise"
        reason = "air is building up — keep activity light"
    else:
        level, window = VerdictLevel.STAY_IN, "today"
        reason = "air is bad right now — indoor plans"

    return Verdict(
        level=level,
        window=window,
        reason=reason + (f" ({blind[0]})" if blind and value > 50 else ""),
        aqi=int(value) if value else None,
        evidence=evidence,
        blind_spots=blind,
    )
