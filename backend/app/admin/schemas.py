"""Pydantic-схема конфига прогрессии — валидация того, что сохраняет админка.

Зеркало TS-типов packages/game-progress/src/config/types.ts. extra='forbid':
опечатка в имени поля должна падать при сохранении, а не молча игнорироваться
движком в проде.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LocalizedText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ru: str = Field(min_length=1)
    uz: str = Field(min_length=1)


class Modifier(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str
    type: Literal["linear", "threshold"]
    factor: Optional[float] = None
    threshold: Optional[float] = None
    multiplier: Optional[float] = None
    cap: Optional[float] = None

    @model_validator(mode="after")
    def _consistent(self) -> "Modifier":
        if self.type == "linear" and self.factor is None:
            raise ValueError("linear-модификатору нужен factor")
        if self.type == "threshold" and (self.threshold is None or self.multiplier is None):
            raise ValueError("threshold-модификатору нужны threshold и multiplier")
        return self


class ScoreRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event: str = Field(min_length=1)
    base: float = Field(ge=0)
    perItemKey: Optional[str] = None
    modifiers: Optional[list[Modifier]] = None
    cap: Optional[float] = None

    @model_validator(mode="after")
    def _not_always_zero(self) -> "ScoreRule":
        if self.base == 0 and not self.perItemKey:
            raise ValueError(f"правило {self.event!r} с base=0 без perItemKey всегда даёт ноль")
        return self


class StarRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stars: Literal[1, 2, 3]
    metric: str
    op: Literal["gte", "lte"]
    value: float


class QuestDef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    title: LocalizedText
    metric: str
    target: float = Field(gt=0)
    reward: int = Field(gt=0)


class GameAchievementDef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    title: LocalizedText
    metric: str
    op: Literal["gte", "lte"]
    value: float
    reward: int = Field(gt=0)


class AntiFraudLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    maxScorePerSession: int = Field(gt=0)
    maxSessionMs: int = Field(gt=0)
    maxEventsPerMinute: int = Field(gt=0)


class StarGoals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gold: float
    silver: float
    higherIsBetter: Optional[bool] = None


class ExportedLevel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    n: int = Field(ge=1)
    params: dict
    goals: StarGoals


class ChallengeDef(BaseModel):
    """Испытание игры без раскладов: метрика забега ≥ порога, номер = уровень."""
    model_config = ConfigDict(extra="forbid")
    n: int = Field(ge=1)
    id: str = Field(min_length=1)
    metric: str
    target: float


class MilestoneDef(BaseModel):
    """Веха: разовая награда по естественной шкале механики."""
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    metric: str
    target: float
    reward: int = Field(gt=0)


class ProgressionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gameId: str = Field(min_length=1)
    version: int = Field(ge=1)
    scoring: list[ScoreRule]
    starMetric: str
    starsFallback: list[StarRule]
    levels: Optional[list[ExportedLevel]] = None
    challenges: Optional[list[ChallengeDef]] = None
    milestones: Optional[list[MilestoneDef]] = None
    dailyQuests: list[QuestDef]
    achievements: list[GameAchievementDef]
    antiFraud: AntiFraudLimits

    @model_validator(mode="after")
    def _has_progression(self) -> "ProgressionConfig":
        if not self.levels and not self.challenges:
            raise ValueError("конфигу нужны levels (головоломка) или challenges (аркада)")
        return self
