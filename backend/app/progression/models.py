"""Модели запросов и ответов Score Engine.

Имена полей — camelCase: они обязаны байт в байт совпадать с TS-типами моста
(packages/game-bridge/src/events.ts и api.ts), это один контракт на два языка.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

MetaValue = float | int | str | bool


class RoundEvent(BaseModel):
    """Сырое игровое событие из пакета GAME_EVENTS."""
    model_config = ConfigDict(extra="forbid")

    game: str
    name: str
    sessionId: str
    clientTs: int
    meta: dict[str, MetaValue] = Field(default_factory=dict)


class GameResult(BaseModel):
    """Финальный результат партии (GAME_RESULT)."""
    model_config = ConfigDict(extra="forbid")

    game: str
    mode: Literal["level", "daily", "endless"]
    level: Optional[int] = Field(default=None, ge=1)
    score: int = Field(ge=0)
    durationMs: int = Field(ge=0)
    sessionId: str = Field(min_length=1)
    won: Optional[bool] = None
    metrics: dict[str, float] = Field(default_factory=dict)


class EventsAccepted(BaseModel):
    """Ответ на пакет событий."""
    xp: int
    balance: Optional[int] = None
    rejected: bool = False


class AwardResult(BaseModel):
    """Ответ на финальный результат: всё, что начислено этим запросом."""
    xp: int
    stars: int = 0
    unlockedAchievements: list[str] = Field(default_factory=list)
    balance: int = 0
