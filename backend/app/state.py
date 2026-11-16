"""Общее состояние процесса: хранилище и override-ы конфигов.

С переменной GAMEWINGO_DB состояние переживает перезапуск (SQLite на постоянном
диске, app/persistence.py). Без неё всё в памяти процесса — демо и тесты.
"""
import os
from typing import Any, Optional

from .analytics.store import AnalyticsStore
from .persistence import Db, SqliteAnalytics, SqliteStore
from .progression.store import InMemoryStore

_db_path = os.environ.get("GAMEWINGO_DB", "").strip()
_db = Db(_db_path) if _db_path else None

store = SqliteStore(_db) if _db else InMemoryStore()

# Факты продуктовой аналитики: партии, пакеты событий, заходы.
analytics = SqliteAnalytics(_db) if _db else AnalyticsStore()

_admin = _db.get("admin", {}) if _db else {}

# game_id → конфиг из админки; None в get() означает «работаем по файлу из репо».
overrides: dict[str, dict[str, Any]] = _admin.get("overrides", {})

# История сохранений для отката: game_id → список версий (старые в начале).
override_history: dict[str, list[dict[str, Any]]] = _admin.get("history", {})


def override_provider(game_id: str) -> Optional[dict[str, Any]]:
    return overrides.get(game_id)


def save_overrides() -> None:
    """Зафиксировать правки админки: без этого баланс экономики откатился бы при редеплое."""
    if _db:
        _db.put("admin", {"overrides": overrides, "history": override_history})
