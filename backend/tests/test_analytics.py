"""Аналитика: факты пишутся из боевых маршрутов, показатели считаются честно."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import state
from app.analytics import metrics
from app.analytics.store import AnalyticsStore
from app.main import app
from app.progression.store import AuditEntry, day_id

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean():
    """Каждому тесту — пустое хранилище: факты копятся между вызовами."""
    state.analytics.clear()
    state.store.audit.clear()
    state.store.users.clear()
    state.store.sessions.clear()
    yield


def play(game="pairs", sid="a1", level=1, score=500, metrics_=None, user="u1"):
    return client.post(
        "/progression/result",
        headers={"X-User-Id": user},
        json={"game": game, "mode": "level", "level": level, "won": True, "score": score,
              "durationMs": 60_000, "sessionId": sid,
              "metrics": metrics_ if metrics_ is not None else {"moves": 10}},
    )


def test_result_recorded_as_fact():
    play()
    assert len(state.analytics.rounds) == 1
    fact = state.analytics.rounds[0]
    assert fact.game_id == "pairs" and fact.won is True and fact.xp > 0


def test_events_recorded_with_count():
    client.post("/progression/events", json=[
        {"game": "pairs", "name": "pair_found", "sessionId": "e1", "clientTs": 0, "meta": {}}
        for _ in range(4)
    ])
    assert len(state.analytics.events) == 1
    assert state.analytics.events[0].count == 4


def test_rejected_round_is_visible_with_reason():
    client.post("/progression/result", json={
        "game": "pairs", "mode": "level", "level": 1, "won": True,
        "score": 10_000_000, "durationMs": 60_000, "sessionId": "bad", "metrics": {},
    })
    fact = state.analytics.rounds[0]
    assert fact.rejected == "score-too-high" and fact.xp == 0

    window = state.analytics.since(7)
    assert metrics.overview(window, list(state.store.audit))["totals"]["rounds"] == 0
    assert metrics.economy(window, list(state.store.audit))["rejects"][0]["count"] == 1


def test_checkin_counts_as_visit():
    client.post("/progression/checkin")
    assert len(state.analytics.visits) == 1


def test_points_agree_between_totals_and_economy():
    """Главная гарантия страницы: цифры в разных блоках не спорят друг с другом."""
    play(sid="s1")
    play(game="snake", sid="s2", metrics_={"length": 12})
    client.post("/progression/checkin")

    window = state.analytics.since(7)
    audit = list(state.store.audit)
    assert metrics.overview(window, audit)["totals"]["xp"] == metrics.economy(window, audit)["totalXp"]


def test_funnel_steps_narrow_down():
    store = AnalyticsStore()
    now = datetime.now(timezone.utc)
    # Трое зашли, двое доиграли, один выиграл, и он же вернулся назавтра.
    store.record_events("a", "quiz", "s-a", 3, 30, ts=now)
    store.record_events("b", "quiz", "s-b", 3, 30, ts=now)
    store.record_events("c", "quiz", "s-c", 3, 30, ts=now)
    store.record_round("a", "quiz", "s-a", "level", 1, 100, 1000, True, 3, 100, ts=now)
    store.record_round("b", "quiz", "s-b", "level", 1, 100, 1000, False, 0, 0, ts=now)
    store.record_round("a", "quiz", "s-a2", "level", 2, 100, 1000, True, 3, 100,
                       ts=now + timedelta(days=1))

    steps = {s["key"]: s["users"] for s in metrics.funnel(store.since(7), "quiz")["steps"]}
    assert steps == {"touched": 3, "finished": 2, "won": 1, "returned": 1}


def test_levels_show_where_players_stop():
    store = AnalyticsStore()
    now = datetime.now(timezone.utc)
    # Двое застряли на третьем уровне, один прошёл дальше.
    for user, top in (("a", 3), ("b", 3), ("c", 5)):
        for level in range(1, top + 1):
            store.record_round(user, "pairs", f"{user}-{level}", "level", level,
                               100, 1000, True, 2, 50, ts=now)
        store.record_round(user, "pairs", f"{user}-fail", "level", top + 1,
                           100, 1000, False, 0, 0, ts=now)

    data = metrics.levels(store.since(7), "pairs")
    stops = {row["level"]: row["players"] for row in data["lastLevel"]}
    assert stops == {3: 2, 5: 1}
    # Четвёртый уровень — стена: трое пробовали, прошёл один.
    wall = next(l for l in data["levels"] if l["level"] == 4)
    assert wall["attempts"] == 3 and wall["won"] == 1 and wall["winRate"] == 33.3


def test_retention_counts_only_complete_cohorts():
    store = AnalyticsStore()
    now = datetime.now(timezone.utc)
    store.record_visit("returner", ts=now - timedelta(days=3))
    store.record_visit("returner", ts=now - timedelta(days=2))
    store.record_visit("gone", ts=now - timedelta(days=3))
    # Пришёл сегодня: завтрашнего дня ещё не было, в когорту D1 не попадает.
    store.record_visit("fresh", ts=now)

    data = metrics.retention(store.since(14))
    assert data["d1"] == {"cohort": 2, "returned": 1, "share": 50.0}
    assert data["newPlayers"] == 3


def test_economy_ignores_days_outside_window():
    old = datetime.now(timezone.utc) - timedelta(days=40)
    state.store.audit.append(AuditEntry("u", "pairs", 999, "result", None, ts=old))
    play()
    window = state.analytics.since(7)
    assert all(g["xp"] < 999 for g in metrics.economy(window, list(state.store.audit))["grants"])


def test_demo_seed_marks_itself_and_wipes():
    seeded = client.post("/analytics/demo?days=14&players=20").json()
    assert seeded["demo"] and seeded["rounds"] > 0
    assert client.get("/analytics/summary?days=14").json()["demo"] is True

    client.delete("/analytics/data")
    body = client.get("/analytics/summary?days=14").json()
    assert body["demo"] is False and body["hasData"] is False


def test_summary_covers_every_game_and_focuses_on_the_busiest():
    play(game="snake", sid="s1", metrics_={"length": 10})
    play(game="snake", sid="s2", metrics_={"length": 10}, user="u2")
    play(game="pairs", sid="s3")

    body = client.get("/analytics/summary?days=7").json()
    assert len(body["games"]) == 13
    assert body["focus"] == "snake"
    assert body["funnel"]["gameId"] == "snake"


def test_admin_token_guards_analytics(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "s3cret")
    assert client.get("/analytics/summary").status_code == 401
    assert client.get("/analytics/summary", headers={"X-Admin-Token": "s3cret"}).status_code == 200


def test_store_forgets_oldest_rows_when_full():
    store = AnalyticsStore(max_rows=3)
    for i in range(5):
        store.record_round(f"u{i}", "pairs", f"s{i}", "level", 1, 10, 1000, True, 1, 10)
    assert len(store.rounds) == 3 and store.rounds[0].user_id == "u2"


def test_day_window_starts_at_expected_date():
    window = state.analytics.since(7)
    assert window.last_day == day_id()
    assert len(window.days) == 7
