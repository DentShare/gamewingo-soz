"""Факты аналитики: партии, пакеты событий, заходы в каталог.

Хранилище append-only и намеренно тупое: факты пишутся как есть, все показатели
считаются на чтении (analytics/metrics.py). Так новый вопрос к данным не требует
ни миграции, ни релиза игр — только нового запроса.

Демо-режим держит факты в памяти с потолком MAX_ROWS: контейнер не должен
распухнуть, если трафик пойдёт раньше, чем подключат Supabase. Боевая
реализация — те же поля таблицами из migrations/002_analytics.sql.
"""
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from ..progression.store import day_id

# Потолок строк на каждый вид фактов. 200 000 партий — это месяцы пилота,
# а по памяти меньше 50 МБ. Старое вытесняется, а не копится до OOM.
MAX_ROWS = 200_000


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class RoundFact:
    """Одна завершённая (или отклонённая) партия."""
    ts: datetime
    day: int
    user_id: str
    game_id: str
    session_id: str
    mode: str
    level: Optional[int]
    score: int
    duration_ms: int
    won: Optional[bool]
    stars: int
    xp: int
    rejected: Optional[str] = None


@dataclass(slots=True)
class EventFact:
    """Пакет сырых событий партии: сколько пришло и чем кончилось."""
    ts: datetime
    day: int
    user_id: str
    game_id: str
    session_id: str
    count: int
    xp: int
    rejected: Optional[str] = None


@dataclass(slots=True)
class VisitFact:
    """Заход в каталог: чек-ин раз в день, он же признак «пришёл сегодня»."""
    ts: datetime
    day: int
    user_id: str


class AnalyticsStore:
    """Факты в памяти процесса. Интерфейс совпадает с будущей версией на Supabase."""

    def __init__(self, max_rows: int = MAX_ROWS) -> None:
        self.rounds: deque[RoundFact] = deque(maxlen=max_rows)
        self.events: deque[EventFact] = deque(maxlen=max_rows)
        self.visits: deque[VisitFact] = deque(maxlen=max_rows)
        # В наборе есть сгенерированные данные. Флаг живёт до явной очистки:
        # страница обязана честно сказать, что цифры на ней ненастоящие.
        self.demo: bool = False

    # --- запись ---------------------------------------------------------

    def record_round(
        self,
        user_id: str,
        game_id: str,
        session_id: str,
        mode: str,
        level: Optional[int],
        score: int,
        duration_ms: int,
        won: Optional[bool],
        stars: int,
        xp: int,
        rejected: Optional[str] = None,
        ts: Optional[datetime] = None,
    ) -> None:
        moment = ts or _now()
        self.rounds.append(RoundFact(
            ts=moment, day=day_id(moment), user_id=user_id, game_id=game_id,
            session_id=session_id, mode=mode, level=level, score=int(score),
            duration_ms=int(duration_ms), won=won, stars=int(stars), xp=int(xp),
            rejected=rejected,
        ))

    def record_events(
        self,
        user_id: str,
        game_id: str,
        session_id: str,
        count: int,
        xp: int,
        rejected: Optional[str] = None,
        ts: Optional[datetime] = None,
    ) -> None:
        moment = ts or _now()
        self.events.append(EventFact(
            ts=moment, day=day_id(moment), user_id=user_id, game_id=game_id,
            session_id=session_id, count=int(count), xp=int(xp), rejected=rejected,
        ))

    def record_visit(self, user_id: str, ts: Optional[datetime] = None) -> None:
        moment = ts or _now()
        self.visits.append(VisitFact(ts=moment, day=day_id(moment), user_id=user_id))

    # --- чтение ---------------------------------------------------------

    def since(self, days: int, now: Optional[datetime] = None) -> "Window":
        """Окно последних `days` суток по календарю Ташкента, включая сегодня."""
        today = day_id(now or _now())
        first = today - max(1, days) + 1
        return Window(
            first_day=first,
            last_day=today,
            rounds=[r for r in self.rounds if r.day >= first],
            events=[e for e in self.events if e.day >= first],
            visits=[v for v in self.visits if v.day >= first],
        )

    def clear(self) -> None:
        self.rounds.clear()
        self.events.clear()
        self.visits.clear()
        self.demo = False

    @property
    def empty(self) -> bool:
        return not (self.rounds or self.events or self.visits)


@dataclass(slots=True)
class Window:
    """Срез фактов за период — то, над чем работают функции метрик."""
    first_day: int
    last_day: int
    rounds: list[RoundFact]
    events: list[EventFact]
    visits: list[VisitFact]

    @property
    def days(self) -> list[int]:
        return list(range(self.first_day, self.last_day + 1))

    def game(self, game_id: str) -> "Window":
        return Window(
            first_day=self.first_day,
            last_day=self.last_day,
            rounds=[r for r in self.rounds if r.game_id == game_id],
            events=[e for e in self.events if e.game_id == game_id],
            visits=list(self.visits),
        )


def day_to_date(day: int) -> str:
    """Номер дня каталога → дата ISO. Дни считаются по Ташкенту (UTC+5)."""
    moment = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(days=day)
    return moment.date().isoformat()


def unique_users(rows: Iterable[object]) -> int:
    return len({getattr(r, "user_id") for r in rows})
