"""Score Engine: сырые события и метрики партии → баллы и звёзды.

Движок не знает про пользователей и хранилище — чистые функции над конфигом.
Правила описаны в packages/game-progress/src/config (TypeScript — источник
истины), сюда они приезжают JSON-ом через progression:export.
"""
from typing import Any


def _to_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _apply_modifiers(base: float, rule: dict[str, Any], meta: dict[str, Any]) -> float:
    value = base
    for mod in rule.get("modifiers", []):
        src = _to_number(meta.get(mod.get("source")))
        if mod["type"] == "linear":
            mult = 1 + mod.get("factor", 0) * src
            cap = mod.get("cap")
            if cap is not None:
                mult = min(mult, cap)
            value *= max(0.0, mult)
        elif mod["type"] == "threshold":
            if src >= mod.get("threshold", 0):
                value *= mod.get("multiplier", 1)
    cap = rule.get("cap")
    if cap is not None:
        value = min(value, cap)
    return max(0.0, value)


def score_events(config: dict[str, Any], events: list[dict[str, Any]]) -> int:
    """Баллы за пакет сырых событий. Незнакомые события молча пропускаются:
    клиент может быть новее конфига, ронять партию из-за этого нельзя."""
    rules = {r["event"]: r for r in config.get("scoring", [])}
    total = 0.0
    for ev in events:
        rule = rules.get(ev.get("name"))
        if not rule:
            continue
        meta = ev.get("meta") or {}
        base = float(rule.get("base", 0))
        per_item = rule.get("perItemKey")
        if per_item:
            base *= _to_number(meta.get(per_item, 1))
        total += _apply_modifiers(base, rule, meta)
    return int(total)


def _stars_by_goals(goals: dict[str, Any], value: float) -> int:
    """Зеркало клиентского starsFor (packages/game-progress/src/ladder.ts):
    попали сюда — уровень пройден, минимум одна звезда."""
    if goals.get("higherIsBetter"):
        if value >= goals["gold"]:
            return 3
        if value >= goals["silver"]:
            return 2
        return 1
    if value <= goals["gold"]:
        return 3
    if value <= goals["silver"]:
        return 2
    return 1


def _star_value(config: dict[str, Any], result: dict[str, Any]) -> float | None:
    metric = config.get("starMetric", "score")
    metrics = result.get("metrics") or {}
    if metric in metrics:
        return _to_number(metrics[metric])
    # Очки есть прямо в результате — метрику 'score' можно не дублировать.
    if metric == "score":
        return _to_number(result.get("score"))
    return None


def calc_stars(config: dict[str, Any], result: dict[str, Any]) -> int:
    """Звёзды партии. Уровень лестницы судится по goals этого уровня —
    те же пороги, что игрок видит на экране итога. Партии вне лестницы
    (слово дня, бесконечный режим) — по запасным правилам starsFallback."""
    if not result.get("won"):
        return 0
    value = _star_value(config, result)
    if value is None:
        return 0

    level_n = result.get("level")
    if result.get("mode") == "level" and level_n:
        for level in config.get("levels", []):
            if level["n"] == level_n:
                return _stars_by_goals(level["goals"], value)
        return 0

    stars = 0
    metrics = result.get("metrics") or {}
    for rule in config.get("starsFallback", []):
        rule_value = metrics.get(rule["metric"])
        if rule_value is None and rule["metric"] == config.get("starMetric"):
            rule_value = value
        if rule_value is None:
            continue
        ok = rule_value >= rule["value"] if rule["op"] == "gte" else rule_value <= rule["value"]
        if ok:
            stars = max(stars, rule["stars"])
    return stars


def check_achievements(config: dict[str, Any], user_stats: dict[str, float]) -> list[str]:
    """Id достижений игры, условия которых выполнены при текущей статистике.
    Кто из них новый — решает вызывающий по выданным ключам кошелька."""
    unlocked: list[str] = []
    for ach in config.get("achievements", []):
        value = _to_number(user_stats.get(ach["metric"], 0))
        ok = value >= ach["value"] if ach["op"] == "gte" else value <= ach["value"]
        if ok:
            unlocked.append(ach["id"])
    return unlocked


def check_quests(config: dict[str, Any], day_counters: dict[str, float]) -> list[dict[str, Any]]:
    """Задания дня игры, закрытые при текущих дневных счётчиках."""
    done = []
    for quest in config.get("dailyQuests", []):
        if _to_number(day_counters.get(quest["metric"], 0)) >= quest["target"]:
            done.append(quest)
    return done
