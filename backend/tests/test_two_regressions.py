"""Regression: horizon enforced by time-vs-now, not by step availability;
"in N hours" parses as an offset, not an o'clock slot."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.adapters.base import AdapterError
from app.adapters.weather import WeatherAdapter

FIXTURE = Path(__file__).parent / "fixtures" / "openweather_forecast.json"
FIX = FIXTURE.read_text()

# 5-day/3-hour endpoint faithfully ships steps DAYS out; that list is the trap
# this test pins: a far-off target must raise even though steps exist there.
_FAR_HOURS = 40


def _payload_far(steps_hours_out=(3, 6, 9, _FAR_HOURS)):
    """Synthetic payload with steps near now AND many hours out."""
    now = datetime.now(timezone.utc)
    return {
        "list": [
            {"dt": int((now + timedelta(hours=h)).timestamp()),
             "wind": {"speed": 2.0}, "pop": 0.0,
             "main": {"humidity": 70}}
            for h in steps_hours_out
        ]
    }


def test_far_target_raises_even_when_steps_exist():
    ad = WeatherAdapter()
    ad.api_key = "test"
    # +6h stays beyond the 3h(+1) ceiling for ANY device clock (at >=18h local
    # the raw hour wraps to tomorrow — still 18h ahead, still far), so this test
    # is clock-independent (the old +21h clamped to 23:00 = near-horizon).
    with pytest.raises(AdapterError):
        ad._to_evidence(_payload_far(), target_hour=(datetime.now().hour + 6) % 24)


def test_near_target_uses_bucket():
    ad = WeatherAdapter()
    ad.api_key = "test"
    evs = ad._to_evidence(_payload_far(steps_hours_out=(3, 6, 9)),
                          target_hour=(datetime.now() + timedelta(hours=2)).hour)
    assert evs, "in-horizon target must produce forecast evidence"
    assert str(evs[0].source_id).startswith("openweather:forecast@")


def test_in_n_hours_is_relative_offset():
    from agent.llm import parse_question
    out = parse_question("football in 2 hours")
    now_h = datetime.now().hour
    expected = (now_h + 2) % 24
    assert out["time_hh"] == expected
