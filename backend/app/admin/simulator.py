"""Симулятор баланса: прогноз начислений по профилю игрока.

Нужен админке, чтобы поймать инфляцию до публикации: изменил цифры —
посмотрел, сколько баллов в день заработает средний игрок, — и только
потом сохранил. Симуляция детерминированная: одинаковый вход даёт
одинаковый прогноз, никакого рандома.
"""
from typing import Any

from ..progression import engine


def _skill_value(rules: list[dict[str, Any]], skill: float) -> float | None:
    """Значение метрики звёзд для игрока данного умения: 0 — едва первая
    звезда, 1 — золото. Интерполяция по запасным порогам конфига."""
    by_stars = {r["stars"]: r for r in rules}
    if 1 not in by_stars or 3 not in by_stars:
        return None
    worst, best = by_stars[1]["value"], by_stars[3]["value"]
    return worst + (best - worst) * skill


def simulate(config: dict[str, Any], profile: dict[str, Any],
             tariff: dict[str, Any]) -> dict[str, Any]:
    """profile: sessionsPerDay, avgSkill (0..1), days.

    Модель: игрок каждый день играет sessionsPerDay партий, впервые проходя
    следующие уровни лестницы (пока она не кончится). Начисления: баллы за
    session_complete по конфигу + тариф каталога за первое прохождение уровня.
    Задания и достижения не моделируются — они разовые и картину дня не задают.
    """
    sessions = max(1, int(profile.get("sessionsPerDay", 3)))
    skill = min(1.0, max(0.0, float(profile.get("avgSkill", 0.5))))
    days = max(1, int(profile.get("days", 7)))

    star_metric = config.get("starMetric", "score")
    metric_value = _skill_value(config.get("starsFallback", []), skill)
    metrics = {star_metric: metric_value} if metric_value is not None else {}

    level_count = len(config.get("levels", []))
    synth = {"name": "session_complete", "meta": metrics, "sessionId": "sim"}
    per_session = engine.score_events(config, [synth])

    daily_xp: list[int] = []
    next_level = 1
    for _ in range(days):
        day_xp = 0
        for _ in range(sessions):
            day_xp += per_session
            if next_level <= level_count:
                day_xp += tariff["levelBase"] + tariff["levelStep"] * (next_level - 1)
                next_level += 1
        daily_xp.append(day_xp)

    return {
        "gameId": config.get("gameId"),
        "profile": {"sessionsPerDay": sessions, "avgSkill": skill, "days": days},
        "perSessionXp": per_session,
        "dailyXp": daily_xp,
        "total": sum(daily_xp),
    }
