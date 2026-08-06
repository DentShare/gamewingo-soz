"""Маршруты Score Engine: приём событий, результатов и чек-ина.

Авторизация — точка интеграции: сейчас пользователь берётся из заголовка
X-User-Id (демо), в проде здесь будет проверка JWT финтех-приложения,
прокинутого игре через INIT (см. game-bridge).
"""
from fastapi import APIRouter, Depends, Header

from .. import state
from . import antifraud, config_loader, engine
from .models import AwardResult, EventsAccepted, GameResult, RoundEvent
from .store import day_id

router = APIRouter(prefix="/progression", tags=["progression"])


def get_user_id(x_user_id: str = Header(default="demo")) -> str:
    return x_user_id


@router.get("/games")
def games() -> list[str]:
    return config_loader.list_games()


@router.post("/events", response_model=EventsAccepted)
def ingest_events(events: list[RoundEvent], user_id: str = Depends(get_user_id)) -> EventsAccepted:
    if not events:
        return EventsAccepted(xp=0)
    game_id = events[0].game
    config = config_loader.get_config(game_id, state.override_provider)
    raw = [e.model_dump() for e in events]

    ok, reason = antifraud.validate_session(config, raw, None, state.store.sessions)
    if not ok:
        state.store.grant(user_id, 0, game_id, f"rejected:{reason}", events[0].sessionId)
        return EventsAccepted(xp=0, rejected=True)

    xp = engine.score_events(config, raw)
    balance = state.store.grant(user_id, xp, game_id, "events", events[0].sessionId)
    return EventsAccepted(xp=xp, balance=balance)


@router.post("/result", response_model=AwardResult)
def ingest_result(result: GameResult, user_id: str = Depends(get_user_id)) -> AwardResult:
    config = config_loader.get_config(result.game, state.override_provider)
    raw = result.model_dump()

    ok, reason = antifraud.validate_session(config, [], raw, state.store.sessions)
    if not ok:
        state.store.grant(user_id, 0, result.game, f"rejected:{reason}", result.sessionId)
        return AwardResult(xp=0, balance=state.store.user(user_id).balance)

    balance_before = state.store.user(user_id).balance
    today = day_id()

    # 1. Баллы за завершённую партию: синтетическое событие session_complete
    #    с метриками результата. Проигранный уровень баллов за завершение не даёт.
    xp_events = 0
    if result.won is not False:
        synth = {"name": "session_complete", "meta": dict(result.metrics), "sessionId": result.sessionId}
        xp_events = engine.score_events(config, [synth])
        if xp_events:
            state.store.grant(user_id, xp_events, result.game, "result", result.sessionId)

    # 2. Звёзды — по goals уровня лестницы, как на экране итога.
    stars = engine.calc_stars(config, raw)

    # 3. Статистика и дневные счётчики: метрики партии + встроенные счётчики.
    extra = {"score": float(result.score)}
    if result.won:
        extra["wins"] = 1
        if result.mode == "level":
            extra["levelsDone"] = 1
    state.store.bump_metrics(user_id, today, {**result.metrics, **extra})

    # 4. Тарифы каталога — те же идемпотентные ключи, что в демо-кошельке клиента.
    tariff = config_loader.get_catalog()["tariff"]
    if result.won and result.mode == "level" and result.level:
        state.store.grant_once(
            user_id, f"level-{result.game}-{result.level}",
            tariff["levelBase"] + tariff["levelStep"] * (result.level - 1),
            result.game, result.sessionId,
        )
    if result.won and result.mode == "daily":
        state.store.grant_once(
            user_id, f"{result.game}-daily-{today}", tariff["daily"],
            result.game, result.sessionId,
        )

    # 5. Задания дня игры: закрылись — награда, повторно в тот же день не выдаётся.
    counters = state.store.day_counters(user_id, today)
    for quest in engine.check_quests(config, counters):
        state.store.grant_once(
            user_id, f"quest-{quest['id']}-{today}", quest["reward"],
            result.game, result.sessionId,
        )

    # 6. Достижения игры: новые определяются по ключам кошелька.
    unlocked = engine.check_achievements(config, state.store.user(user_id).stats)
    fresh = [
        ach_id for ach_id in unlocked
        if state.store.grant_once(
            user_id, f"ach-{ach_id}",
            next(a["reward"] for a in config["achievements"] if a["id"] == ach_id),
            result.game, result.sessionId,
        )
    ]

    balance = state.store.user(user_id).balance
    return AwardResult(
        xp=balance - balance_before,
        stars=stars,
        unlockedAchievements=fresh,
        balance=balance,
    )


@router.post("/checkin", response_model=AwardResult)
def checkin(user_id: str = Depends(get_user_id)) -> AwardResult:
    """Чек-ин за вход в раздел: серия 5→10→…→cap, пропуск дня сбрасывает.
    Зеркало claimCheckin из клиентского демо-кошелька."""
    tariff = config_loader.get_catalog()["tariff"]
    today = day_id()
    user = state.store.user(user_id)

    last = int(user.stats.get("checkinLast", 0))
    run = int(user.stats.get("checkinRun", 0))
    if last == today:
        return AwardResult(xp=0, balance=user.balance)

    run = run + 1 if last == today - 1 else 1
    amount = min(tariff["checkinBase"] * run, tariff["checkinCap"])
    user.stats["checkinLast"] = today
    user.stats["checkinRun"] = run
    state.store.grant_once(user_id, f"checkin-{today}", amount, "hub")
    return AwardResult(xp=amount, balance=user.balance)
