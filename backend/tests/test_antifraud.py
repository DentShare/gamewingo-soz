from datetime import datetime, timedelta, timezone

from app.progression.antifraud import validate_session

CONFIG = {"antiFraud": {"maxScorePerSession": 1000, "maxSessionMs": 60_000, "maxEventsPerMinute": 120}}

T0 = datetime(2026, 8, 6, 12, 0, tzinfo=timezone.utc)


def ev(n=1, sid="s", game="pairs"):
    return [{"name": "x", "sessionId": sid, "game": game, "clientTs": 0, "meta": {}}] * n


def res(score=100, duration=30_000, sid="s"):
    return {"game": "pairs", "mode": "level", "score": score, "durationMs": duration, "sessionId": sid}


def test_honest_flow_passes():
    store = {}
    ok, reason = validate_session(CONFIG, ev(10), None, store, now=T0)
    assert ok and reason is None
    ok, _ = validate_session(CONFIG, [], res(), store, now=T0 + timedelta(seconds=30))
    assert ok


def test_session_too_long_rejected():
    store = {"s": {"start": T0, "events": 0}}
    ok, reason = validate_session(CONFIG, ev(1), None, store, now=T0 + timedelta(minutes=2))
    assert not ok and reason == "session-too-long"


def test_event_rate_rejected():
    store = {}
    ok, reason = validate_session(CONFIG, ev(500), None, store, now=T0)
    assert not ok and reason == "rate-limit"


def test_small_first_batch_not_rejected():
    """Первый пакет сразу после старта — не накрутка: действует пол в одну минуту."""
    store = {}
    ok, _ = validate_session(CONFIG, ev(30), None, store, now=T0)
    assert ok


def test_score_above_cap_rejected():
    ok, reason = validate_session(CONFIG, [], res(score=5000), {}, now=T0)
    assert not ok and reason == "score-too-high"


def test_duration_above_cap_rejected():
    ok, reason = validate_session(CONFIG, [], res(duration=120_000), {}, now=T0)
    assert not ok and reason == "duration-too-long"


def test_mixed_sessions_rejected():
    events = ev(1) + ev(1, sid="другая")
    ok, reason = validate_session(CONFIG, events, None, {}, now=T0)
    assert not ok and reason == "mixed-session"


def test_missing_session_id_rejected():
    ok, reason = validate_session(CONFIG, [], {"game": "pairs", "score": 1}, {}, now=T0)
    assert not ok and reason == "no-session"
