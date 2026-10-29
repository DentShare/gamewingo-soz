"""Локальный пилот феникса; включается только явным флагом среды."""
import math
import os
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from ..progression.models import GameResult
from . import store

router = APIRouter(prefix="/pet", tags=["pet-pilot"])

ACTION_METRIC = {
    "soz": ("guessesUsed", 1), "pairs": ("moves", 2), "fifteen": ("moves", 3),
    "2048": ("moves", 3), "sudoku-kids": ("filled", 1), "stack": ("blocks", 2),
    "flyer": ("passed", 1), "targets": ("hits", 2), "snake": ("eaten", 1),
    "sorting": ("placed", 2), "color-sort": ("moves", 2), "block-drop": ("pieces", 2),
    "counting": ("correct", 2), "quiz": ("correct", 2),
    "jigsaw": ("pieces", 1), "sums": ("moves", 1),
}


def _user(x_pet_test_user: str = Header(default="")) -> str:
    if os.environ.get("GAMEWINGO_PET_PILOT") != "1":
        raise HTTPException(404, "Пилот феникса выключен")
    try:
        return str(UUID(x_pet_test_user))
    except (ValueError, AttributeError):
        raise HTTPException(400, "Нужен UUID тестового игрока") from None


def _meaningful(result: GameResult) -> bool:
    if result.game not in ACTION_METRIC or result.durationMs <= 0 or result.durationMs > 40 * 60_000:
        return False
    if any(not math.isfinite(v) or v < 0 for v in result.metrics.values()):
        return False
    metric, threshold = ACTION_METRIC[result.game]
    action = result.metrics.get(metric, 0)
    if result.game in ("counting", "quiz", "sudoku-kids"):
        action += result.metrics.get("mistakes", 0)
    return action >= threshold


class PetName(BaseModel):
    name: str = Field(min_length=1, max_length=20)


@router.get("/state")
def get_state(x_pet_test_user: str = Header(default="")) -> dict:
    return store.state(_user(x_pet_test_user))


@router.post("/result")
def post_result(result: GameResult, x_pet_test_user: str = Header(default="")) -> dict:
    return store.record(_user(x_pet_test_user), result.game, result.sessionId, _meaningful(result))


@router.patch("/name")
def patch_name(data: PetName, x_pet_test_user: str = Header(default="")) -> dict:
    user = _user(x_pet_test_user)
    name = " ".join(data.name.split())
    if not name or any(not (ch.isalnum() or ch in " -") for ch in name):
        raise HTTPException(422, "Имя может содержать буквы, цифры, пробел и дефис")
    try:
        return store.rename(user, name)
    except ValueError:
        raise HTTPException(409, "Имя доступно после вылупления") from None
