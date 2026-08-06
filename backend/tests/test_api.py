from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def send_events(n=3, game="pairs", sid="s1", name="pair_found"):
    events = [
        {"game": game, "name": name, "sessionId": sid, "clientTs": 0, "meta": {}}
        for _ in range(n)
    ]
    return client.post("/progression/events", json=events)


def send_result(game="pairs", mode="level", level=1, won=True, score=500,
                metrics=None, sid="s1"):
    return client.post("/progression/result", json={
        "game": game, "mode": mode, "level": level, "won": won, "score": score,
        "durationMs": 60_000, "sessionId": sid,
        "metrics": metrics if metrics is not None else {"moves": 10},
    })


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_games_list_has_all_eleven():
    games = client.get("/progression/games").json()
    assert len(games) == 11 and "soz" in games and "2048" in games


def test_events_scored_and_balance_grows():
    r = send_events(3).json()
    assert r["xp"] == 60 and r["balance"] == 60 and not r["rejected"]


def test_event_flood_rejected():
    r = send_events(5000, sid="flood").json()
    assert r["rejected"] and r["xp"] == 0


def test_result_awards_level_bonus_once():
    first = send_result().json()
    # session_complete (100, efficiency нет) + уровень 1 (тариф 20) = 120.
    assert first["xp"] == 120 and first["stars"] >= 1

    again = send_result(sid="s2").json()
    # Повтор уровня: тариф не выдаётся, остаётся только session_complete.
    assert again["xp"] == 100
    assert again["balance"] == first["balance"] + 100


def test_lost_round_gives_nothing_but_is_recorded():
    r = send_result(won=False, metrics={"moves": 50}).json()
    assert r["xp"] == 0 and r["stars"] == 0


def test_stars_follow_level_goals():
    # pairs, уровень 1: в реальной лестнице золото — пройти в минимум ходов
    # (ходов ровно столько, сколько пар: 4).
    r = send_result(metrics={"moves": 4}).json()
    assert r["stars"] == 3


def test_daily_word_tariff_once_per_day():
    first = send_result(game="soz", mode="daily", level=None,
                        metrics={"guessesUsed": 3}, sid="d1").json()
    second = send_result(game="soz", mode="daily", level=None,
                         metrics={"guessesUsed": 2}, sid="d2").json()
    # Тариф слова дня (25) есть только в первом ответе.
    assert first["xp"] - second["xp"] == 25


def test_achievement_unlocks_once():
    r = send_result(game="snake", mode="endless", level=None, score=800,
                    metrics={"length": 20, "bestLength": 120}).json()
    assert "snake_giant" in r["unlockedAchievements"]

    again = send_result(game="snake", mode="endless", level=None, score=900,
                        metrics={"length": 25, "bestLength": 130}, sid="s3").json()
    assert again["unlockedAchievements"] == []


def test_quest_reward_granted_when_target_reached():
    # snake_q_len25: длина 25 за день. Метрика length суммируется по партиям.
    first = send_result(game="snake", mode="endless", level=None, score=100,
                        metrics={"length": 15}, sid="q1").json()
    second = send_result(game="snake", mode="endless", level=None, score=100,
                         metrics={"length": 15}, sid="q2").json()
    assert first["unlockedAchievements"] == []
    # Во второй партии дневная сумма 30 ≥ 25 — квест закрылся (+50 к xp разницы нет,
    # сравниваем через балансы: второй ответ богаче первого ровно на награду).
    assert second["xp"] - first["xp"] == 50


def test_checkin_series():
    first = client.post("/progression/checkin").json()
    assert first["xp"] == 5
    again = client.post("/progression/checkin").json()
    assert again["xp"] == 0 and again["balance"] == first["balance"]


def test_users_are_isolated():
    a = send_result(sid="ua").json()
    b = client.post("/progression/result", headers={"X-User-Id": "user-b"}, json={
        "game": "pairs", "mode": "level", "level": 1, "won": True, "score": 500,
        "durationMs": 60_000, "sessionId": "ub", "metrics": {"moves": 10},
    }).json()
    assert a["balance"] == b["balance"] == 120
