from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pet import store
from app.pet.router import ACTION_METRIC, _meaningful
from app.progression.models import GameResult

USER = str(uuid4())
OTHER = str(uuid4())
client = TestClient(app)


@pytest.fixture(autouse=True)
def pilot_db(tmp_path, monkeypatch):
    monkeypatch.setenv("GAMEWINGO_PET_DB", str(tmp_path / "pet.sqlite3"))
    monkeypatch.setenv("GAMEWINGO_PET_PILOT", "1")


def payload(game="pairs", sid="round-1", metrics=None, won=True):
    return {"game": game, "mode": "level", "level": 1, "score": 100,
            "durationMs": 5000, "sessionId": sid, "won": won,
            "metrics": metrics if metrics is not None else {"moves": 3}}


def post(data, user=USER):
    return client.post("/pet/result", json=data, headers={"X-Pet-Test-User": user})


def test_local_pilot_must_be_enabled(monkeypatch):
    monkeypatch.delenv("GAMEWINGO_PET_PILOT")
    assert post(payload()).status_code == 404
    assert client.get("/pet/state").status_code == 404


def test_round_duplicate_game_limit_and_loss():
    first = post(payload()).json()
    assert first["awarded"] and first["state"]["total"] == 1
    assert post(payload()).json()["reason"] == "duplicate_session"
    assert post(payload(sid="round-2")).json()["reason"] == "already_played_today"
    assert post(payload("quiz", "round-3", {"correct": 0, "mistakes": 2}, False)).json()["awarded"]
    assert post(payload("2048", "round-4", {"moves": 4})).json()["awarded"]
    fourth = post(payload("snake", "round-5", {"eaten": 2})).json()
    assert fourth["reason"] == "daily_limit"
    assert fourth["state"]["stage"] == "awakening"
    assert store.state(OTHER)["total"] == 0


def test_empty_or_unknown_round_cannot_earn_spark():
    assert post(payload(metrics={"moves": 0})).json()["reason"] == "not_meaningful"
    assert post(payload("unknown", "round-2", {"moves": 3})).json()["reason"] == "not_meaningful"
    assert post(payload("pairs", "round-3", {"moves": 3}) | {"durationMs": 0}).json()["reason"] == "not_meaningful"
    assert store.state(USER)["total"] == 0


def test_day_boundary_and_name():
    day_one = datetime(2026, 10, 27, 18, 59, tzinfo=timezone.utc)
    day_two = day_one + timedelta(minutes=2)  # полночь в Ташкенте
    for day in (day_one, day_two):
        for i, game in enumerate(("pairs", "quiz", "2048")):
            metrics = {"moves": 3} if game != "quiz" else {"correct": 1}
            assert store.record(USER, game, f"{day.timestamp()}-{i}", True, day)["awarded"]
    state = store.state(USER, day_two)
    assert state["total"] == 6 and state["today"] == 3 and state["stage"] == "chick"
    assert store.rename(USER, "Огонёк", day_two)["name"] == "Огонёк"
    response = client.patch("/pet/name", json={"name": "Жар-птица"},
                            headers={"X-Pet-Test-User": USER})
    assert response.status_code == 200
    assert store.state(USER)["name"] == "Жар-птица"


def test_policy_covers_reward_eligible_games_with_action_thresholds():
    manifest = json.loads((Path(__file__).resolve().parents[2] / "games" / "manifest.json").read_text(encoding="utf-8"))
    prototypes_without_rewards = {"tanks", "tap-hoops"}
    assert set(ACTION_METRIC) == {game["gameId"] for game in manifest["games"]} - prototypes_without_rewards
    for game, (metric, threshold) in ACTION_METRIC.items():
        base = dict(game=game, mode="endless", score=100, durationMs=5000,
                    sessionId="test", won=False)
        assert _meaningful(GameResult(**base, metrics={metric: threshold}))
        assert not _meaningful(GameResult(**base, metrics={metric: 0}))


def test_parallel_results_do_not_exceed_daily_cap():
    games = ["pairs", "soz", "2048", "snake", "flyer", "quiz"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda item: store.record(USER, item[1], f"sid-{item[0]}", True), enumerate(games)))
    assert sum(r["awarded"] for r in results) == 3
    assert store.state(USER)["total"] == 3


def test_name_locked_and_test_users_isolated():
    headers = {"X-Pet-Test-User": USER}
    assert client.patch("/pet/name", json={"name": "Огонёк"}, headers=headers).status_code == 409
    assert client.get("/pet/state", headers={"X-Pet-Test-User": "someone"}).status_code == 400
    assert client.get("/pet/state", headers=headers).json()["total"] == 0
