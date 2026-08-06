from app.progression import engine

CONFIG = {
    "gameId": "pairs",
    "starMetric": "moves",
    "scoring": [
        {"event": "pair_found", "base": 20,
         "modifiers": [{"source": "consecutive", "type": "linear", "factor": 0.5, "cap": 3}]},
        {"event": "tile_merged", "base": 1, "perItemKey": "value",
         "modifiers": [{"source": "value", "type": "threshold", "threshold": 128, "multiplier": 2}]},
        {"event": "capped", "base": 100, "cap": 150,
         "modifiers": [{"source": "x", "type": "linear", "factor": 10}]},
    ],
    "starsFallback": [
        {"stars": 1, "metric": "moves", "op": "lte", "value": 40},
        {"stars": 2, "metric": "moves", "op": "lte", "value": 28},
        {"stars": 3, "metric": "moves", "op": "lte", "value": 20},
    ],
    "levels": [
        {"n": 1, "params": {}, "goals": {"gold": 10, "silver": 14}},
        {"n": 2, "params": {}, "goals": {"gold": 600, "silver": 400, "higherIsBetter": True}},
    ],
}


def ev(name, **meta):
    return {"name": name, "meta": meta, "sessionId": "s", "game": "pairs", "clientTs": 0}


class TestScoreEvents:
    def test_base_without_modifiers(self):
        assert engine.score_events(CONFIG, [ev("pair_found")]) == 20

    def test_linear_modifier_with_cap(self):
        # 1 + 0.5×2 = 2 → 40; 1 + 0.5×10 = 6 → срезается до 3 → 60.
        assert engine.score_events(CONFIG, [ev("pair_found", consecutive=2)]) == 40
        assert engine.score_events(CONFIG, [ev("pair_found", consecutive=10)]) == 60

    def test_per_item_and_threshold(self):
        # 64 < порога — номинал как есть; 256 ≥ 128 — вдвое.
        assert engine.score_events(CONFIG, [ev("tile_merged", value=64)]) == 64
        assert engine.score_events(CONFIG, [ev("tile_merged", value=256)]) == 512

    def test_rule_cap(self):
        assert engine.score_events(CONFIG, [ev("capped", x=100)]) == 150

    def test_unknown_event_ignored(self):
        assert engine.score_events(CONFIG, [ev("no_such_event")]) == 0

    def test_junk_meta_is_zero_not_crash(self):
        assert engine.score_events(CONFIG, [ev("pair_found", consecutive="мусор")]) == 20


class TestCalcStars:
    def result(self, **kw):
        base = {"game": "pairs", "mode": "level", "level": 1, "score": 0,
                "won": True, "metrics": {"moves": 10}}
        return {**base, **kw}

    def test_level_goals_lte(self):
        assert engine.calc_stars(CONFIG, self.result(metrics={"moves": 10})) == 3
        assert engine.calc_stars(CONFIG, self.result(metrics={"moves": 13})) == 2
        assert engine.calc_stars(CONFIG, self.result(metrics={"moves": 30})) == 1

    def test_level_goals_higher_is_better(self):
        cfg = {**CONFIG, "starMetric": "score"}
        r = self.result(level=2, metrics={}, score=700)
        assert engine.calc_stars(cfg, r) == 3

    def test_lost_round_gets_zero(self):
        assert engine.calc_stars(CONFIG, self.result(won=False)) == 0

    def test_fallback_for_daily(self):
        r = self.result(mode="daily", level=None, metrics={"moves": 19})
        assert engine.calc_stars(CONFIG, r) == 3

    def test_unknown_level_zero(self):
        assert engine.calc_stars(CONFIG, self.result(level=99)) == 0


class TestAchievementsAndQuests:
    def test_check_achievements(self):
        cfg = {"achievements": [
            {"id": "a", "metric": "wins", "op": "gte", "value": 3, "reward": 10},
            {"id": "b", "metric": "wins", "op": "gte", "value": 100, "reward": 10},
        ]}
        assert engine.check_achievements(cfg, {"wins": 5}) == ["a"]

    def test_check_quests(self):
        cfg = {"dailyQuests": [
            {"id": "q", "metric": "pairsFound", "target": 10, "reward": 40,
             "title": {"ru": "х", "uz": "x"}},
        ]}
        assert engine.check_quests(cfg, {"pairsFound": 12}) == cfg["dailyQuests"]
        assert engine.check_quests(cfg, {"pairsFound": 3}) == []
