"""Админка баланса: просмотр и переопределение конфигов без релиза.

Демо-режим хранит override-ы в памяти процесса (app/state.py); в проде то же
API пишет в Supabase (progression_overrides + progression_history, см.
backend/migrations/001_progression.sql) — интерфейс не меняется.

Доступ: если задан ADMIN_TOKEN в окружении, каждый запрос обязан прислать его
в заголовке X-Admin-Token. Без переменной админка открыта — только для
локальной разработки, в проде токен обязателен.
"""
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import ValidationError

from .. import state
from ..progression import config_loader
from ..security import check_admin_token as _check_token
from .schemas import ProgressionConfig
from .simulator import simulate

router = APIRouter(prefix="/admin", tags=["admin"])

_STATIC = Path(__file__).parent / "static"


def _known(game_id: str) -> None:
    if game_id not in config_loader.list_games():
        raise HTTPException(404, f"Неизвестная игра {game_id!r}")


@router.get("/ui", include_in_schema=False)
def ui() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@router.get("/configs/{game_id}")
def get_config(game_id: str, x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _check_token(x_admin_token)
    _known(game_id)
    return {
        "gameId": game_id,
        "base": config_loader.get_config(game_id),
        "override": state.overrides.get(game_id),
    }


@router.put("/configs/{game_id}")
def save_config(game_id: str, config: dict[str, Any],
                x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _check_token(x_admin_token)
    _known(game_id)
    try:
        validated = ProgressionConfig.model_validate(config)
    except ValidationError as err:
        detail = [
            {"loc": ".".join(str(p) for p in e["loc"]), "msg": e["msg"]}
            for e in err.errors(include_url=False)
        ]
        raise HTTPException(422, detail) from err
    if validated.gameId != game_id:
        raise HTTPException(422, "gameId в конфиге не совпадает с адресом")

    previous = state.overrides.get(game_id) or config_loader.get_config(game_id)
    history = state.override_history.setdefault(game_id, [])
    history.append(previous)

    stored = validated.model_dump(exclude_none=True)
    stored["version"] = previous.get("version", 0) + 1
    state.overrides[game_id] = stored
    config_loader.invalidate_cache()
    return {"ok": True, "version": stored["version"]}


@router.get("/configs/{game_id}/history")
def get_history(game_id: str, x_admin_token: Optional[str] = Header(default=None)) -> list[dict[str, Any]]:
    _check_token(x_admin_token)
    _known(game_id)
    return [
        {"index": i, "version": cfg.get("version", 0)}
        for i, cfg in enumerate(state.override_history.get(game_id, []))
    ]


@router.post("/configs/{game_id}/rollback")
def rollback(game_id: str, body: dict[str, Any],
             x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _check_token(x_admin_token)
    _known(game_id)
    history = state.override_history.get(game_id, [])
    index = body.get("index")
    if not isinstance(index, int) or not 0 <= index < len(history):
        raise HTTPException(404, "Версия не найдена")
    state.overrides[game_id] = history[index]
    config_loader.invalidate_cache()
    return {"ok": True, "version": history[index].get("version", 0)}


@router.delete("/configs/{game_id}/override")
def drop_override(game_id: str, x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _check_token(x_admin_token)
    _known(game_id)
    state.overrides.pop(game_id, None)
    config_loader.invalidate_cache()
    return {"ok": True}


@router.post("/simulate/{game_id}")
def run_simulation(game_id: str, body: dict[str, Any],
                   x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _check_token(x_admin_token)
    _known(game_id)
    config = body.get("config") or config_loader.get_config(game_id, state.override_provider)
    profile = body.get("profile") or {}
    tariff = config_loader.get_catalog()["tariff"]
    return simulate(config, profile, tariff)
