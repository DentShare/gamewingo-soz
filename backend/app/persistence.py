"""Постоянное хранилище на SQLite: кошельки, аудит, факты аналитики, override-ы.

Включается переменной GAMEWINGO_DB — путь к файлу на постоянном диске (на
Railway это том, см. backend/README.md). Состояние по-прежнему живёт в памяти,
а на диск уходит после каждого запроса игрока одной транзакцией: строка
пользователя целиком и новые факты. При старте всё читается обратно.

shortcut: один процесс на файл; для второго экземпляра сервера нужен переезд
на Supabase (migrations/001_progression.sql) — интерфейс хранилищ тот же.
"""
import json
import sqlite3
import threading
from dataclasses import asdict
from datetime import datetime
from typing import Any, Iterator, Optional

from .analytics.store import AnalyticsStore, EventFact, RoundFact, VisitFact
from .progression.store import AuditEntry, InMemoryStore, UserState

_FACTS = {"audit": AuditEntry, "round": RoundFact, "event": EventFact, "visit": VisitFact}


def _dump(value: Any) -> str:
    # datetime → ISO, set (ключи наград) → отсортированный список.
    return json.dumps(value, ensure_ascii=False,
                      default=lambda o: o.isoformat() if isinstance(o, datetime) else sorted(o))


class Db:
    def __init__(self, path: str) -> None:
        self.conn = sqlite3.connect(path, check_same_thread=False)
        # Маршруты FastAPI идут в пуле потоков, соединение одно.
        self.lock = threading.Lock()
        self.pending: list[tuple[str, str]] = []
        self.conn.executescript("""
            pragma journal_mode = wal;
            create table if not exists users (user_id text primary key, state text not null);
            create table if not exists facts (id integer primary key, kind text not null, data text not null);
            create table if not exists kv (key text primary key, value text not null);
        """)

    def fact(self, kind: str, row: Any) -> None:
        """Поставить факт в очередь; на диск он уйдёт в flush() вместе с кошельком."""
        with self.lock:
            self.pending.append((kind, _dump(asdict(row))))

    def flush(self, user_id: str, user: UserState) -> None:
        with self.lock:
            with self.conn:  # одна транзакция: кошелёк и его аудит не расходятся
                self.conn.execute(
                    "insert into users values (?, ?) on conflict(user_id) do update set state = excluded.state",
                    (user_id, _dump(asdict(user))),
                )
                self.conn.executemany("insert into facts (kind, data) values (?, ?)", self.pending)
            self.pending.clear()  # только после успешного commit

    def load(self, kind: str) -> Iterator[Any]:
        for (data,) in self.conn.execute("select data from facts where kind = ? order by id", (kind,)):
            row = json.loads(data)
            row["ts"] = datetime.fromisoformat(row["ts"])
            yield _FACTS[kind](**row)

    def get(self, key: str, default: Any) -> Any:
        row = self.conn.execute("select value from kv where key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def put(self, key: str, value: Any) -> None:
        with self.lock, self.conn:
            self.conn.execute(
                "insert into kv values (?, ?) on conflict(key) do update set value = excluded.value",
                (key, _dump(value)),
            )


class SqliteStore(InMemoryStore):
    durable = True

    def __init__(self, db: Db) -> None:
        super().__init__()
        self.db = db
        for user_id, raw in db.conn.execute("select user_id, state from users"):
            state = json.loads(raw)
            self.users[user_id] = UserState(state["balance"], set(state["keys"]), state["stats"], state["day"])
        self.audit = list(db.load("audit"))

    def grant(self, user_id: str, xp: int, game_id: str, reason: str,
              session_id: Optional[str] = None) -> int:
        balance = super().grant(user_id, xp, game_id, reason, session_id)
        self.db.fact("audit", self.audit[-1])
        return balance

    def save(self, user_id: str) -> None:
        self.db.flush(user_id, self.user(user_id))


class SqliteAnalytics(AnalyticsStore):
    def __init__(self, db: Db) -> None:
        super().__init__()
        self.db = db
        self.rounds.extend(db.load("round"))
        self.events.extend(db.load("event"))
        self.visits.extend(db.load("visit"))

    def record_round(self, *args: Any, **kwargs: Any) -> None:
        super().record_round(*args, **kwargs)
        self.db.fact("round", self.rounds[-1])

    def record_events(self, *args: Any, **kwargs: Any) -> None:
        super().record_events(*args, **kwargs)
        self.db.fact("event", self.events[-1])

    def record_visit(self, *args: Any, **kwargs: Any) -> None:
        super().record_visit(*args, **kwargs)
        self.db.fact("visit", self.visits[-1])
