"""Общее состояние процесса: хранилище демо-данных и override-ы конфигов.

Точка замены при боевой интеграции: вместо InMemoryStore — реализация поверх
Supabase, вместо словаря override-ов — таблица progression_overrides
(см. backend/migrations/001_progression.sql). Интерфейсы совпадают.
"""
from typing import Any, Optional

from .progression.store import InMemoryStore

store = InMemoryStore()

# game_id → конфиг из админки; None в get() означает «работаем по файлу из репо».
overrides: dict[str, dict[str, Any]] = {}

# История сохранений для отката: game_id → список версий (старые в начале).
override_history: dict[str, list[dict[str, Any]]] = {}


def override_provider(game_id: str) -> Optional[dict[str, Any]]:
    return overrides.get(game_id)
