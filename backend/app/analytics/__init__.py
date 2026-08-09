"""Продуктовая аналитика каталога.

Считается по тому, что Score Engine и так получает от игр: пакеты событий,
итоги партий, заходы в каталог. Ничего не уходит наружу — данные банковских
пользователей остаются в нашем периметре (см. docs/ANALYTICS.md).
"""
from .store import AnalyticsStore, EventFact, RoundFact, VisitFact

__all__ = ["AnalyticsStore", "EventFact", "RoundFact", "VisitFact"]
