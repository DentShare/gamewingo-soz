"""Новые источники бонусов UX-волны: уровень дня, глава, неделя рекордов.

Ключи и тарифы зеркалят клиентский кошелёк (packages/game-progress/src/bonus.ts):
расхождение здесь — это баланс, который «прыгнет» у игрока при переезде на сервер.
"""
from fastapi.testclient import TestClient

from app import state
from app.main import app
from app.progression import config_loader
from app.progression.store import day_id, week_id

client = TestClient(app)
TARIFF = config_loader.get_catalog()["tariff"]


def send(game="pairs", mode="level", level=1, won=True, score=500, sid="s", metrics=None):
    return client.post("/progression/result", json={
        "game": game, "mode": mode, "level": level, "won": won, "score": score,
        "durationMs": 60_000, "sessionId": sid,
        "metrics": metrics if metrics is not None else {"moves": 10},
    }).json()


def keys():
    return state.store.user("demo").keys


def test_week_starts_on_monday():
    # 1970-01-01 (день 0) — четверг; 1970-01-05 (день 4) — понедельник.
    assert week_id(0) == week_id(3)
    assert week_id(4) == week_id(3) + 1
    assert week_id(10) == week_id(4)


# ── уровень дня ────────────────────────────────────────────────────────────────

def test_level_of_day_pays_once_per_game_per_day():
    first = send(mode="dailyLevel", level=9, sid="a")
    again = send(mode="dailyLevel", level=9, sid="b")
    assert first["xp"] - again["xp"] == TARIFF["levelOfDay"]
    assert f"lod-pairs-{day_id()}" in keys()


def test_level_of_day_is_not_the_daily_word_tariff():
    # Раньше любой режим daily платил 25 (тариф слова дня); уровень дня — свой тариф.
    r = send(mode="dailyLevel", level=9, sid="a")
    plain = send(mode="level", level=9, sid="b")  # тот же уровень обычным путём: +уровень
    tariff_level_9 = TARIFF["levelBase"] + TARIFF["levelStep"] * 8
    assert r["xp"] - (plain["xp"] - tariff_level_9) == TARIFF["levelOfDay"]
    assert not any(k.endswith(f"-daily-{day_id()}") for k in keys())


def test_level_of_day_limit_per_day():
    games = ["pairs", "fifteen", "sums", "quiz", "jigsaw"]
    for i, g in enumerate(games):
        send(game=g, mode="dailyLevel", level=9, sid=f"lod{i}", metrics={})
    paid = [k for k in keys() if k.startswith("lod-")]
    assert len(paid) == TARIFF["levelOfDayPerDay"]


def test_lost_level_of_day_pays_nothing():
    send(mode="dailyLevel", level=9, won=False, sid="a")
    assert not any(k.startswith("lod-") for k in keys())


# ── главы ──────────────────────────────────────────────────────────────────────

def test_chapter_bonus_when_all_levels_of_chapter_cleared():
    size = TARIFF["chapterSize"]
    responses = [send(level=n, sid=f"c{n}") for n in range(1, size + 1)]
    assert f"chapter-pairs-1" in keys()
    # Бонус главы приходит ровно с последним уровнем главы.
    level_tariff = lambda n: TARIFF["levelBase"] + TARIFF["levelStep"] * (n - 1)  # noqa: E731
    last, prev = responses[-1], responses[-2]
    assert (last["xp"] - level_tariff(size)) - (prev["xp"] - level_tariff(size - 1)) == TARIFF["chapterClear"]


def test_chapter_needs_every_level():
    for n in (1, 2, 3, 5):  # без четвёртого
        send(level=n, sid=f"c{n}")
    assert not any(k.startswith("chapter-") for k in keys())
    send(level=4, sid="c4")
    assert "chapter-pairs-1" in keys()


def test_chapter_bonus_once_and_per_chapter():
    for n in range(1, 11):
        send(level=n, sid=f"c{n}")
    send(level=5, sid="again")  # перепрохождение уже закрытой главы
    chapters = sorted(k for k in keys() if k.startswith("chapter-"))
    assert chapters == ["chapter-pairs-1", "chapter-pairs-2"]
    audit = [e for e in state.store.audit if e.reason.startswith("chapter-")]
    assert len(audit) == 2


# ── неделя рекордов ────────────────────────────────────────────────────────────

def arcade(score, sid):
    return send(game="snake", mode="endless", level=None, score=score, sid=sid, metrics={"length": 3})


def test_first_arcade_run_is_not_a_beaten_record():
    arcade(300, "r1")
    assert not any(k.startswith("record-week-") for k in keys())


def test_beaten_record_pays_once_per_week():
    arcade(300, "r1")
    beaten = arcade(400, "r2")
    again = arcade(500, "r3")  # снова рекорд, но неделя уже оплачена
    assert f"record-week-{week_id(day_id())}" in keys()
    # Метрики забегов одинаковые, значит вся разница — это награда недели.
    assert beaten["xp"] - again["xp"] == TARIFF["recordWeek"]
    assert len([e for e in state.store.audit if e.reason.startswith("record-week-")]) == 1


def test_record_not_beaten_pays_nothing():
    arcade(300, "r1")
    arcade(300, "r2")  # равный — не рекорд
    arcade(100, "r3")
    assert not any(k.startswith("record-week-") for k in keys())


# ── испытания аркад ─────────────────────────────────────────────────────────────

def level_tariff(n):
    return TARIFF["levelBase"] + TARIFF["levelStep"] * (n - 1)


def test_arcade_challenge_pays_level_tariff():
    # snake: 1 — eaten ≥ 5, 2 — lengthMax ≥ 12.
    res = send(game="snake", mode="endless", level=None, score=50, sid="c1", metrics={"eaten": 6, "lengthMax": 8})
    assert "level-snake-1" in keys()
    assert "level-snake-2" not in keys()
    assert res["xp"] >= level_tariff(1)


def test_arcade_challenges_close_in_cascade_and_once():
    send(game="snake", mode="endless", level=None, score=50, sid="c2", metrics={"eaten": 9, "lengthMax": 13})
    assert {"level-snake-1", "level-snake-2"} <= set(keys())
    before = state.store.user("demo").balance
    send(game="snake", mode="endless", level=None, score=10, sid="c3", metrics={"eaten": 9, "lengthMax": 13})
    assert state.store.user("demo").balance == before


def test_arcade_challenge_needs_previous():
    # Второе условие выполнено, первое — нет: каскад не перескакивает.
    send(game="snake", mode="endless", level=None, score=50, sid="c4", metrics={"eaten": 1, "lengthMax": 14})
    assert "level-snake-2" not in keys()


def test_milestones_pay_nothing():
    send(game="snake", mode="endless", level=None, score=50, sid="c5", metrics={"lengthMax": 40})
    assert not any(k.startswith("milestone-") for k in keys())
