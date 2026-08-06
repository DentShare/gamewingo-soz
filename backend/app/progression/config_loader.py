"""Загрузка конфигов прогрессии.

Приоритет: override из админки (Supabase, таблица progression_overrides) →
JSON из репозитория (backend/app/progression/configs, генерируется командой
`npm run progression:export`). Так компания крутит баланс без релиза, а в
репозитории всегда лежит рабочая база.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional

CONFIG_DIR = Path(__file__).parent / "configs"

# Провайдер override-ов: game_id → конфиг или None. В проде — запрос к Supabase,
# в тестах и демо — словарь в памяти (см. admin/router.py).
OverrideProvider = Callable[[str], Optional[dict[str, Any]]]


@lru_cache(maxsize=64)
def _file_config(game_id: str) -> dict[str, Any]:
    path = CONFIG_DIR / f"{game_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Нет конфига для игры {game_id!r} — запусти npm run progression:export")
    return json.loads(path.read_text(encoding="utf-8"))


def list_games() -> list[str]:
    """Игры, у которых есть конфиг (catalog.json — не игра)."""
    return sorted(p.stem for p in CONFIG_DIR.glob("*.json") if p.stem != "catalog")


def get_config(game_id: str, override_provider: OverrideProvider | None = None) -> dict[str, Any]:
    if override_provider is not None:
        override = override_provider(game_id)
        if override:
            return override
    return _file_config(game_id)


def get_catalog() -> dict[str, Any]:
    """Экономика каталога: тарифы кошелька, задания дня, достижения."""
    return _file_config("catalog")


def invalidate_cache() -> None:
    _file_config.cache_clear()
