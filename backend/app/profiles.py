"""Health profiles — configuration, not features (SPEC Addendum B).

One profile = threshold tables + parse hint. Verdict logic reads from here only.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Profile:
    name: str
    # (level_switch_points) on the weighted mean read (µg/m³ pm2.5 or aqi)
    good_max: float
    careful_max: float
    parse_hint: str
    exertion_multiplier: float = 1.0


PROFILES: dict[str, Profile] = {
    "asthma": Profile(
        name="asthma", good_max=35, careful_max=80,
        parse_hint="strict PM thresholds; exertion raises effective dose",
        exertion_multiplier=1.3,
    ),
    "pollen_allergy": Profile(
        name="pollen_allergy", good_max=45, careful_max=90,
        parse_hint="pollen count and PM matter; dry windy days flag",
    ),
    "copd": Profile(
        name="copd", good_max=30, careful_max=65,
        parse_hint="conservative all day; longer stay-in windows",
    ),
    "athlete": Profile(
        name="athlete", good_max=40, careful_max=85,
        parse_hint="breathing-rate multiplier — stricter while training",
        exertion_multiplier=1.2,
    ),
    "general": Profile(
        name="general", good_max=50, careful_max=100,
        parse_hint="standard AQI bands; comfort focus",
    ),
}


def get(name: str | None) -> Profile:
    return PROFILES.get((name or "").strip().lower(), PROFILES["asthma"])
