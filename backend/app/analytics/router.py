"""Маршруты аналитики: цифры и страница, которую открывают глазами.

Доступ тот же, что у админки баланса: заголовок X-Admin-Token, если переменная
ADMIN_TOKEN задана в окружении. Персональных данных здесь нет — идентификатор
пользователя приходит от приложения и наружу не уходит: все ответы агрегатные.
"""
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Header, Query
from fastapi.responses import FileResponse

from .. import state
from ..progression import config_loader
from ..security import check_admin_token
from . import demo as demo_data
from . import metrics

router = APIRouter(prefix="/analytics", tags=["analytics"])

_STATIC = Path(__file__).parent / "static"

# Период по умолчанию: две недели — видно и будни, и выходные, и недельный цикл.
DEFAULT_DAYS = 14


def _window(days: int):
    return state.analytics.since(days)


@router.get("/ui", include_in_schema=False)
def ui() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@router.get("/summary")
def summary(
    days: int = Query(DEFAULT_DAYS, ge=1, le=180),
    game: Optional[str] = None,
    x_admin_token: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    """Всё для дашборда одним запросом — страница открывается с телефона."""
    check_admin_token(x_admin_token)
    games = config_loader.list_games()
    focus = game if game in games else None
    return {
        **metrics.summary(_window(days), games, list(state.store.audit), focus),
        "hasData": not state.analytics.empty,
        "demo": state.analytics.demo,
    }


@router.get("/overview")
def overview(days: int = Query(DEFAULT_DAYS, ge=1, le=180),
             x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    check_admin_token(x_admin_token)
    return metrics.overview(_window(days), list(state.store.audit))


@router.get("/games")
def games(days: int = Query(DEFAULT_DAYS, ge=1, le=180),
          x_admin_token: Optional[str] = Header(default=None)) -> list[dict[str, Any]]:
    check_admin_token(x_admin_token)
    return metrics.by_game(_window(days), config_loader.list_games(), list(state.store.audit))


@router.get("/funnel/{game_id}")
def funnel(game_id: str, days: int = Query(DEFAULT_DAYS, ge=1, le=180),
           x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    check_admin_token(x_admin_token)
    return metrics.funnel(_window(days), game_id)


@router.get("/levels/{game_id}")
def levels(game_id: str, days: int = Query(30, ge=1, le=180),
           x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    check_admin_token(x_admin_token)
    return metrics.levels(_window(days), game_id)


@router.get("/retention")
def retention(days: int = Query(DEFAULT_DAYS, ge=1, le=180),
              x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    check_admin_token(x_admin_token)
    return metrics.retention(_window(days))


@router.get("/economy")
def economy(days: int = Query(DEFAULT_DAYS, ge=1, le=180),
            x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    check_admin_token(x_admin_token)
    return metrics.economy(_window(days), list(state.store.audit))


@router.post("/demo")
def make_demo(days: int = Query(21, ge=7, le=90), players: int = Query(140, ge=10, le=2000),
              x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    """Заполнить демонстрационными данными: посмотреть страницу до боевого трафика."""
    check_admin_token(x_admin_token)
    state.analytics.clear()
    state.store.audit.clear()
    state.analytics.demo = True
    return demo_data.seed(state.analytics, state.store.audit, config_loader.list_games(),
                          days=days, players=players)


@router.delete("/data")
def wipe(x_admin_token: Optional[str] = Header(default=None)) -> dict[str, Any]:
    """Стереть накопленное — после демо перед боевым запуском."""
    check_admin_token(x_admin_token)
    state.analytics.clear()
    state.store.audit.clear()
    return {"cleared": True}
