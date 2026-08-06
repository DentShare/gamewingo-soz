"""Хранилище пользователей: баланс, идемпотентные ключи наград, статистика.

Ключи наград зеркалят клиентский демо-кошелёк (packages/game-progress/src/bonus.ts):
`level-<slug>-<n>`, `soz-daily-<dayId>`, `quest-<id>-<dayId>`, `ach-<id>`,
`checkin-<dayId>`. Совпадающие ключи — гарантия, что при переезде с витрины
на сервер игрок увидит те же начисления.

InMemoryStore — демо и тесты. Для продакшена реализуется тот же интерфейс
поверх Supabase (таблицы в backend/migrations/001_progression.sql).
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

# Таймзона каталога — Ташкент (UTC+5), как в packages/game-progress/src/day.ts.
TASHKENT_OFFSET_MS = 5 * 3_600_000


def day_id(now: Optional[datetime] = None) -> int:
    """Номер дня в таймзоне Ташкента — тот же расчёт, что computeDayId клиента."""
    moment = now or datetime.now(timezone.utc)
    return int((moment.timestamp() * 1000 + TASHKENT_OFFSET_MS) // 86_400_000)


@dataclass
class UserState:
    balance: int = 0
    keys: set[str] = field(default_factory=set)
    # Кумулятивные метрики для достижений: 'wordsGuessed', 'bestHeight'…
    stats: dict[str, float] = field(default_factory=dict)
    # Дневные счётчики заданий; сбрасываются при смене dayId.
    day: dict[str, Any] = field(default_factory=dict)


@dataclass
class AuditEntry:
    user_id: str
    game_id: str
    xp: int
    reason: str
    session_id: Optional[str] = None


class InMemoryStore:
    """Всё в памяти процесса: перезапуск сервера очищает демо-данные."""

    def __init__(self) -> None:
        self.users: dict[str, UserState] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self.audit: list[AuditEntry] = []

    def user(self, user_id: str) -> UserState:
        return self.users.setdefault(user_id, UserState())

    def grant(self, user_id: str, xp: int, game_id: str, reason: str,
              session_id: Optional[str] = None) -> int:
        """Начислить баллы с записью в аудит. Возвращает новый баланс."""
        state = self.user(user_id)
        state.balance += max(0, int(xp))
        self.audit.append(AuditEntry(user_id, game_id, int(xp), reason, session_id))
        return state.balance

    def grant_once(self, user_id: str, key: str, xp: int, game_id: str,
                   session_id: Optional[str] = None) -> bool:
        """Разовая награда по идемпотентному ключу. False — уже выдавалась."""
        state = self.user(user_id)
        if key in state.keys:
            return False
        state.keys.add(key)
        self.grant(user_id, xp, game_id, key, session_id)
        return True

    def day_counters(self, user_id: str, current_day: int) -> dict[str, float]:
        """Дневные счётчики; вчерашние обнуляются — задания дневные."""
        state = self.user(user_id)
        if state.day.get("dayId") != current_day:
            state.day = {"dayId": current_day, "counters": {}}
        return state.day["counters"]

    def bump_metrics(self, user_id: str, current_day: int, metrics: dict[str, float]) -> None:
        """Копит метрики в статистику и дневные счётчики.

        Метрики с префиксом best/max — рекорды (берётся максимум),
        остальные — счётчики (суммируются). Так 'bestHeight' не растёт от
        каждой партии, а 'wordsGuessed' — растёт.
        """
        state = self.user(user_id)
        day = self.day_counters(user_id, current_day)
        for name, value in metrics.items():
            if name.startswith(("best", "max")):
                state.stats[name] = max(state.stats.get(name, 0), value)
                day[name] = max(day.get(name, 0), value)
            else:
                state.stats[name] = state.stats.get(name, 0) + value
                day[name] = day.get(name, 0) + value
