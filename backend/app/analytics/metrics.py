"""Показатели каталога: чистые функции над окном фактов.

Ни одна из них не ходит в хранилище сама — на вход приходит `Window`, на выход
идут словари, готовые к JSON. Так их можно считать и по памяти, и по выборке
из Supabase, и проверять тестами без поднятого приложения.

Что именно считаем и почему — docs/ANALYTICS.md.
"""
from statistics import median
from typing import Any, Optional

from ..progression.store import AuditEntry
from .store import Window, day_to_date

# Причины отказов антифрода в человеческом виде — их читает не разработчик.
REJECT_LABELS = {
    "session-too-long": "сессия дольше лимита",
    "duration-too-long": "партия дольше лимита",
    "score-too-high": "счёт выше потолка",
    "rate-limit": "слишком частые события",
    "mixed-session": "смешаны сессии",
    "no-session": "нет sessionId",
    "empty": "пустой пакет",
}

# Причины начислений в аудите — в те же человеческие слова.
GRANT_LABELS = {
    "events": "события партии",
    "result": "завершение партии",
    "level": "первое прохождение уровня",
    "quest": "задание дня",
    "ach": "достижение",
    "checkin": "чек-ин",
    "daily": "слово дня",
}


def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _granted(audit: list[AuditEntry], window: Window) -> list[AuditEntry]:
    """Начисления периода. Единственный источник правды по баллам на всей странице:
    и итоги, и разрез по играм, и экономика считаются отсюда — иначе цифры
    на одном экране начинают спорить друг с другом."""
    return [a for a in audit if a.xp > 0 and window.first_day <= a.day <= window.last_day]


def overview(window: Window, audit: list[AuditEntry]) -> dict[str, Any]:
    """Итоги периода и разбивка по дням: игроки, партии, баллы, отказы."""
    grants = _granted(audit, window)
    by_day: dict[int, dict[str, Any]] = {
        d: {"day": d, "date": day_to_date(d), "players": set(), "rounds": 0, "xp": 0, "rejected": 0}
        for d in window.days
    }
    for r in window.rounds:
        bucket = by_day.get(r.day)
        if bucket is None:
            continue
        bucket["players"].add(r.user_id)
        if r.rejected:
            bucket["rejected"] += 1
        else:
            bucket["rounds"] += 1
    for e in window.events:
        bucket = by_day.get(e.day)
        if bucket is None:
            continue
        bucket["players"].add(e.user_id)
        if e.rejected:
            bucket["rejected"] += 1
    for v in window.visits:
        bucket = by_day.get(v.day)
        if bucket is not None:
            bucket["players"].add(v.user_id)
    for a in grants:
        bucket = by_day.get(a.day)
        if bucket is not None:
            bucket["xp"] += a.xp

    days = [{**b, "players": len(b["players"])} for b in by_day.values()]
    played = [r for r in window.rounds if not r.rejected]
    all_players = {r.user_id for r in window.rounds} | {e.user_id for e in window.events} \
        | {v.user_id for v in window.visits}
    rejected = sum(1 for r in window.rounds if r.rejected) + sum(1 for e in window.events if e.rejected)

    return {
        "days": days,
        "totals": {
            "players": len(all_players),
            "rounds": len(played),
            "xp": sum(a.xp for a in grants),
            "rejected": rejected,
            "rejectedShare": _pct(rejected, len(window.rounds) + len(window.events)),
            "roundsPerPlayer": round(len(played) / len(all_players), 1) if all_players else 0.0,
            "medianDurationSec": round(median([r.duration_ms for r in played]) / 1000) if played else 0,
        },
    }


def by_game(window: Window, games: list[str], audit: list[AuditEntry]) -> list[dict[str, Any]]:
    """Разрез по играм — главная таблица: где играют, а где бросают."""
    xp_by_game: dict[str, int] = {}
    for a in _granted(audit, window):
        xp_by_game[a.game_id] = xp_by_game.get(a.game_id, 0) + a.xp
    rows = []
    for game_id in games:
        scope = window.game(game_id)
        played = [r for r in scope.rounds if not r.rejected]
        won = [r for r in played if r.won]
        players = {r.user_id for r in scope.rounds} | {e.user_id for e in scope.events}
        rows.append({
            "gameId": game_id,
            "players": len(players),
            "rounds": len(played),
            "won": len(won),
            "winRate": _pct(len(won), len(played)),
            "medianDurationSec": round(median([r.duration_ms for r in played]) / 1000) if played else 0,
            "avgScore": round(sum(r.score for r in played) / len(played)) if played else 0,
            "stars": sum(r.stars for r in played),
            "xp": xp_by_game.get(game_id, 0),
            "rejected": sum(1 for r in scope.rounds if r.rejected),
        })
    rows.sort(key=lambda r: (-r["rounds"], r["gameId"]))
    return rows


def funnel(window: Window, game_id: str) -> dict[str, Any]:
    """Воронка игры: пришли → сыграли партию → доиграли до победы → вернулись назавтра.

    «Пришёл» считается по факту любой активности в игре (события или результат),
    поэтому воронка честная даже без отдельного события открытия меню.
    """
    scope = window.game(game_id)
    touched = {r.user_id for r in scope.rounds} | {e.user_id for e in scope.events}
    played = [r for r in scope.rounds if not r.rejected]
    finished = {r.user_id for r in played}
    winners = {r.user_id for r in played if r.won}

    # Вернулся: играл в эту игру в два разных дня.
    days_by_user: dict[str, set[int]] = {}
    for r in played:
        days_by_user.setdefault(r.user_id, set()).add(r.day)
    returned = {u for u, days in days_by_user.items() if len(days) > 1}

    steps = [
        {"key": "touched", "label": "зашли в игру", "users": len(touched)},
        {"key": "finished", "label": "доиграли партию", "users": len(finished)},
        {"key": "won", "label": "прошли хотя бы раз", "users": len(winners)},
        {"key": "returned", "label": "вернулись в другой день", "users": len(returned)},
    ]
    base = steps[0]["users"]
    for step in steps:
        step["share"] = _pct(step["users"], base)
    return {"gameId": game_id, "steps": steps}


def levels(window: Window, game_id: str) -> dict[str, Any]:
    """Где бросают: попытки и проходимость по уровням + докуда дошли игроки.

    Для аркад уровень — номер испытания, для головоломок — ступень лестницы;
    смысл один: на какой ступени игрок останавливается.
    """
    scope = window.game(game_id)
    played = [r for r in scope.rounds if not r.rejected and r.level]
    per_level: dict[int, dict[str, Any]] = {}
    for r in played:
        row = per_level.setdefault(int(r.level), {"level": int(r.level), "attempts": 0, "won": 0})
        row["attempts"] += 1
        if r.won:
            row["won"] += 1
    for row in per_level.values():
        row["winRate"] = _pct(row["won"], row["attempts"])

    reached: dict[str, int] = {}
    for r in played:
        if r.won:
            reached[r.user_id] = max(reached.get(r.user_id, 0), int(r.level))
    stop: dict[int, int] = {}
    for level in reached.values():
        stop[level] = stop.get(level, 0) + 1

    return {
        "gameId": game_id,
        "levels": sorted(per_level.values(), key=lambda r: r["level"]),
        "lastLevel": [{"level": k, "players": v} for k, v in sorted(stop.items())],
    }


def retention(window: Window) -> dict[str, Any]:
    """Удержание: доля вернувшихся на следующий день и на седьмой.

    Считается по когорте первого дня активности внутри окна: если игрок пришёл
    впервые до начала периода, в знаменатель он не попадает.
    """
    first_seen: dict[str, int] = {}
    active: dict[str, set[int]] = {}
    for row in list(window.rounds) + list(window.events) + list(window.visits):
        user = row.user_id
        first_seen[user] = min(first_seen.get(user, row.day), row.day)
        active.setdefault(user, set()).add(row.day)

    def rate(offset: int) -> dict[str, Any]:
        # В когорту берём только тех, у кого «день N» уместился в окно.
        cohort = [u for u, first in first_seen.items() if first + offset <= window.last_day]
        back = [u for u in cohort if first_seen[u] + offset in active[u]]
        return {"cohort": len(cohort), "returned": len(back), "share": _pct(len(back), len(cohort))}

    return {"d1": rate(1), "d7": rate(7), "newPlayers": len(first_seen)}


def economy(window: Window, audit: list[AuditEntry]) -> dict[str, Any]:
    """Экономика: за что начислено и что завернул антифрод."""
    grants: dict[str, int] = {}
    for entry in _granted(audit, window):
        # Ключи вида level-quiz-3 / quest-x-123 / ach-y — берём смысловой префикс.
        head = entry.reason.split("-")[0]
        label = GRANT_LABELS.get(head, GRANT_LABELS.get(entry.reason, entry.reason))
        grants[label] = grants.get(label, 0) + entry.xp

    rejects: dict[str, int] = {}
    for row in list(window.rounds) + list(window.events):
        if not row.rejected:
            continue
        label = REJECT_LABELS.get(row.rejected, row.rejected)
        rejects[label] = rejects.get(label, 0) + 1

    return {
        "grants": [{"reason": k, "xp": v} for k, v in sorted(grants.items(), key=lambda kv: -kv[1])],
        "rejects": [{"reason": k, "count": v} for k, v in sorted(rejects.items(), key=lambda kv: -kv[1])],
        "totalXp": sum(grants.values()),
    }


def summary(window: Window, games: list[str], audit: list[AuditEntry],
            focus: Optional[str] = None) -> dict[str, Any]:
    """Всё сразу — дашборд тянет один запрос, а не шесть: он открывается с телефона."""
    table = by_game(window, games, audit)
    top = focus or (table[0]["gameId"] if table and table[0]["rounds"] else (games[0] if games else ""))
    return {
        "period": {"from": day_to_date(window.first_day), "to": day_to_date(window.last_day),
                   "days": len(window.days)},
        "overview": overview(window, audit),
        "games": table,
        "focus": top,
        "funnel": funnel(window, top) if top else None,
        "levels": levels(window, top) if top else None,
        "retention": retention(window),
        "economy": economy(window, audit),
    }
