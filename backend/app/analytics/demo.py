"""Правдоподобный набор данных для дашборда до боевого трафика.

Нужен для одной честной цели: показать, как страница выглядит и что на ней
видно, пока приложение ещё не шлёт события. Данные помечены как демонстрационные
и стираются одним запросом — перепутать их с боевыми нельзя.

Генератор детерминированный (фиксированное зерно): одинаковый вход даёт
одинаковую картинку, поэтому по скриншотам можно сверяться.
"""
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from ..progression.store import AuditEntry, day_id
from .store import AnalyticsStore

# Популярность игр: доля партий. Числа взяты не с потолка — так обычно
# распределяется каталог, где половина игр детские, а половина взрослые.
POPULARITY = {
    "soz": 0.16, "2048": 0.13, "snake": 0.12, "quiz": 0.11, "pairs": 0.09,
    "jigsaw": 0.08, "fifteen": 0.07, "flyer": 0.06, "targets": 0.05,
    "stack": 0.05, "sudoku-kids": 0.03, "sorting": 0.03, "counting": 0.02,
}

# Средняя длительность партии, сек: аркада короче головоломки.
DURATION = {
    "soz": 210, "2048": 300, "snake": 95, "quiz": 130, "pairs": 85,
    "jigsaw": 160, "fifteen": 140, "flyer": 60, "targets": 70,
    "stack": 55, "sudoku-kids": 190, "sorting": 75, "counting": 65,
}


def _weighted(rng: random.Random, games: list[str]) -> str:
    weights = [POPULARITY.get(g, 0.05) for g in games]
    return rng.choices(games, weights=weights, k=1)[0]


def seed(
    store: AnalyticsStore,
    audit: list[AuditEntry],
    games: list[str],
    days: int = 21,
    players: int = 140,
    seed_value: int = 20260808,
) -> dict[str, Any]:
    """Заполняет хранилище демо-данными. Возвращает сводку о том, что создано."""
    rng = random.Random(seed_value)
    now = datetime.now(timezone.utc)
    today = day_id(now)
    first_day = today - days + 1

    rounds = events = visits = grants = 0

    for index in range(players):
        user = f"demo-{index:03d}"
        # Приход новых игроков размазан по периоду, старожилов больше в начале.
        joined = first_day + int(rng.triangular(0, days - 1, 0))
        # Живучесть: большинство отваливается за пару дней, меньшинство остаётся.
        lifetime = max(1, int(rng.paretovariate(0.9)))
        skill = rng.random()

        for offset in range(lifetime):
            day = joined + offset
            if day > today:
                break
            # Даже живой игрок заходит не каждый день.
            if offset and rng.random() < 0.25:
                continue

            moment = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(
                days=day, hours=rng.uniform(-5 + 8, -5 + 22) % 24)
            store.record_visit(user, ts=moment)
            visits += 1

            for _ in range(rng.randint(1, 4)):
                game = _weighted(rng, games)
                session = f"demo-{user}-{day}-{rounds}"
                level = min(15, 1 + int(rng.gammavariate(2.0, 1.6 + 3 * skill)))
                # Чем выше уровень, тем реже победа: это и рисует отвал.
                won = rng.random() < max(0.15, 0.95 - level * 0.05 + skill * 0.25)
                duration = int(DURATION.get(game, 120) * rng.uniform(0.55, 1.8) * 1000)
                score = int(rng.uniform(200, 2200) * (0.6 + skill))
                stars = (3 if rng.random() < 0.25 else 2 if rng.random() < 0.5 else 1) if won else 0
                xp = (100 + 20 * level) if won else 0

                # Пакеты сырых событий партии — их всегда больше, чем итогов.
                batch = rng.randint(2, 9)
                batch_xp = batch * rng.randint(5, 20)
                store.record_events(user, game, session, batch, batch_xp, ts=moment)
                # Те же баллы уходят в аудит: иначе «начислено» в итогах и в
                # экономике разошлись бы, и цифры на странице спорили бы между собой.
                audit.append(AuditEntry(user, game, batch_xp, "events", session, ts=moment))
                events += 1
                grants += 1

                # Редкие отказы антифрода: примерно одна партия из полусотни.
                rejected = None
                if rng.random() < 0.02:
                    rejected = rng.choice(["rate-limit", "score-too-high", "duration-too-long"])
                    won, xp, stars = False, 0, 0

                store.record_round(
                    user_id=user, game_id=game, session_id=session, mode="level",
                    level=level, score=score, duration_ms=duration, won=won,
                    stars=stars, xp=xp, rejected=rejected, ts=moment,
                )
                rounds += 1

                if xp:
                    audit.append(AuditEntry(user, game, xp, "result", session, ts=moment))
                    grants += 1
                    if won and rng.random() < 0.3:
                        audit.append(AuditEntry(user, game, 20 + 2 * level, f"level-{game}-{level}", session, ts=moment))
                        grants += 1

            if rng.random() < 0.8:
                audit.append(AuditEntry(user, "hub", 5 * min(5, offset + 1), f"checkin-{day}", None, ts=moment))
                grants += 1

    return {
        "demo": True, "days": days, "players": players,
        "rounds": rounds, "eventBatches": events, "visits": visits, "grants": grants,
    }
