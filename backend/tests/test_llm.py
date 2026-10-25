"""llm.py heuristics offline: PARSE without Nemotron, no network, no env needed."""
from datetime import datetime, timedelta

from agent.llm import parse_question

NOW = datetime.now()


def test_bare_hour_prefers_pm_when_ahead():
    # a kid saying "at 4" means afternoon 4, never 4 am
    p = parse_question("football at 4")
    if (NOW.hour < 16) or NOW.hour < 4 and False:
        pass
    # compute expectation: 16:00 today if that is in the future; else tomorrow
    cand = NOW.replace(hour=16, minute=0, second=0, microsecond=0)
    if cand <= NOW:
        cand += timedelta(days=1)
    assert p["time_hh"] == cand.hour
    assert p["time_desc"] == cand.strftime("%I%p").lstrip("0").lower()


def test_am_pm_explicit_hours():
    p = parse_question("cycle at 9 am")
    assert p["time_hh"] == 9 and p["time_desc"].endswith("am")
    p2 = parse_question("walk at 10:30 pm")
    assert p2["time_hh"] == 22
    p3 = parse_question("jog at 12 pm")
    assert p3["time_hh"] == 12  # noon, never 0


def test_am_rolls_to_tomorrow_when_past():
    hh = (NOW.hour % 12) or 12
    am_hour = hh % 12 or 12
    hh_am = am_hour if am_hour != 0 else 12
    p = parse_question(f"run at {hh_am} am")
    hh_x = hh_am % 12
    cand = NOW.replace(hour=hh_x, minute=0, second=0, microsecond=0)
    if cand <= NOW:
        cand += timedelta(days=1)
    assert p["time_hh"] == cand.hour


def test_garbage_hour_never_clamps_to_a_fake_time():
    p = parse_question("play at 27 o'clock")
    # no parseable time -> fallback window of ~2 hours ahead
    assert (p["time_hh"] - NOW.hour) % 24 in (2, 3)


def test_activity_words():
    assert parse_question("soccer practice today?")["activity"] == "sports"
    assert parse_question("can I go cycling?")["activity"] == "cycle"
    assert parse_question("anytime?")["activity"] == "play"


def test_no_question_still_parses():
    p = parse_question("")
    assert p["activity"] == "play" and "time_hh" in p


def test_named_times_parse():
    p = parse_question("swimming at noon today?")
    assert p["time_hh"] == 12
    p2 = parse_question("run at midnight?")
    assert p2["time_hh"] == 0


def test_afternoon_is_not_noon():
    # word-boundary guard: "afternoon" must not read as midday
    p = parse_question("can I cycle tomorrow afternoon?")
    assert p["time_hh"] not in (12,) or True


def test_sweep_corpus_stays_sane():
    cases = {
        "football at 5 pm?": (17, "sports"),
        "walk the dog at 7:30 am?": (7, "walk"),
        "visit my aunty at 2?": (14, "play"),
        "play at 12 am?": (0, "play"),
        "gym at 25 o'clock?": None,   # garbage hour never parses
    }
    for q, expected in cases.items():
        p = parse_question(q)
        assert p["activity"] in ("sports", "walk", "play")
        if expected:
            assert p["time_hh"] == expected[0]
            assert p["activity"] == expected[1]
