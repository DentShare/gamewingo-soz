"""Атомарный журнал искр локального пилота (без денежных наград)."""
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from ..progression.store import day_id

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "pet-pilot.sqlite3"
MAX_PER_DAY = 3


def _connect() -> sqlite3.Connection:
    path = Path(os.environ.get("GAMEWINGO_PET_DB", str(DEFAULT_DB)))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=10000")
    db.execute("""CREATE TABLE IF NOT EXISTS pet_profiles (
        user_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT ''
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS pet_sparks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL, day_id INTEGER NOT NULL, game TEXT NOT NULL,
        session_id TEXT NOT NULL, at_ms INTEGER NOT NULL,
        UNIQUE(user_id, day_id, game), UNIQUE(user_id, session_id)
    )""")
    return db


def _state(db: sqlite3.Connection, user_id: str, today: int) -> dict:
    total = db.execute("SELECT COUNT(*) FROM pet_sparks WHERE user_id=?", (user_id,)).fetchone()[0]
    count_today = db.execute(
        "SELECT COUNT(*) FROM pet_sparks WHERE user_id=? AND day_id=?", (user_id, today)
    ).fetchone()[0]
    profile = db.execute("SELECT name FROM pet_profiles WHERE user_id=?", (user_id,)).fetchone()
    latest = db.execute(
        "SELECT game, at_ms FROM pet_sparks WHERE user_id=? ORDER BY id DESC LIMIT 1", (user_id,)
    ).fetchone()
    return {
        "total": total, "today": count_today,
        "stage": "egg" if total < 3 else "awakening" if total < 6 else "chick",
        "nextStageAt": 3 if total < 3 else 6 if total < 6 else None,
        "name": profile["name"] if profile else "",
        "lastSpark": {"game": latest["game"], "at": latest["at_ms"]} if latest else None,
    }


def state(user_id: str, now: datetime | None = None) -> dict:
    with closing(_connect()) as db:
        return _state(db, user_id, day_id(now))


def record(user_id: str, game: str, session_id: str, meaningful: bool,
           now: datetime | None = None) -> dict:
    moment = now or datetime.now(timezone.utc)
    today = day_id(moment)
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute(
            "SELECT 1 FROM pet_sparks WHERE user_id=? AND session_id=?", (user_id, session_id)
        ).fetchone():
            reason = "duplicate_session"
        elif not meaningful:
            reason = "not_meaningful"
        elif db.execute(
            "SELECT 1 FROM pet_sparks WHERE user_id=? AND day_id=? AND game=?",
            (user_id, today, game),
        ).fetchone():
            reason = "already_played_today"
        elif db.execute(
            "SELECT COUNT(*) FROM pet_sparks WHERE user_id=? AND day_id=?", (user_id, today)
        ).fetchone()[0] >= MAX_PER_DAY:
            reason = "daily_limit"
        else:
            db.execute(
                "INSERT INTO pet_sparks(user_id, day_id, game, session_id, at_ms) VALUES(?,?,?,?,?)",
                (user_id, today, game, session_id, int(moment.timestamp() * 1000)),
            )
            reason = "awarded"
        result = {"awarded": reason == "awarded", "reason": reason,
                  "state": _state(db, user_id, today)}
        db.commit()
        return result


def rename(user_id: str, name: str, now: datetime | None = None) -> dict:
    with closing(_connect()) as db:
        db.execute("BEGIN IMMEDIATE")
        if _state(db, user_id, day_id(now))["total"] < 6:
            raise ValueError("name_locked")
        db.execute("INSERT INTO pet_profiles(user_id, name) VALUES(?,?) "
                   "ON CONFLICT(user_id) DO UPDATE SET name=excluded.name", (user_id, name))
        result = _state(db, user_id, day_id(now))
        db.commit()
        return result
