"""Антифрод-лимиты сессий (железное правило каталога №2).

Хранилище сессий — любой dict-подобный объект (в проде Redis с TTL,
в демо и тестах словарь в памяти). Лимиты приходят из конфига игры.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, MutableMapping, Optional


def _now() -> datetime:
    return datetime.now(timezone.utc)


def validate_session(
    config: dict[str, Any],
    events: list[dict[str, Any]],
    result: Optional[dict[str, Any]],
    session_store: MutableMapping[str, dict[str, Any]],
    now: Optional[datetime] = None,
) -> tuple[bool, Optional[str]]:
    """Проверяет пакет событий и/или результат. Возвращает (ок, причина отказа) —
    причина уходит в аудит, игроку не показывается."""
    limits = config.get("antiFraud", {})
    max_session_ms = limits.get("maxSessionMs", 900_000)
    max_events_per_minute = limits.get("maxEventsPerMinute", 240)
    max_score = limits.get("maxScorePerSession", 100_000)

    source = result if result is not None else (events[0] if events else None)
    if source is None:
        return False, "empty"
    sid = source.get("sessionId")
    if not sid:
        return False, "no-session"

    game = source.get("game")
    if any(ev.get("sessionId") != sid or ev.get("game") != game for ev in events):
        return False, "mixed-session"

    moment = now or _now()
    info = session_store.get(sid) or {"start": moment, "events": 0}

    if moment - info["start"] > timedelta(milliseconds=max_session_ms):
        return False, "session-too-long"

    if events:
        info["events"] += len(events)
        # Пол в одну минуту: первый пакет прилетает почти мгновенно после старта,
        # и честная десятка событий не должна выглядеть как тысячи в минуту.
        minutes = max((moment - info["start"]).total_seconds() / 60, 1.0)
        if info["events"] / minutes > max_events_per_minute:
            return False, "rate-limit"

    if result is not None:
        if result.get("durationMs", 0) > max_session_ms:
            return False, "duration-too-long"
        if result.get("score", 0) > max_score:
            return False, "score-too-high"

    session_store[sid] = info
    return True, None
