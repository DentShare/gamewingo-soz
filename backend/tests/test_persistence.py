"""Постоянное хранилище: состояние переживает перезапуск процесса."""
import pytest
from fastapi.testclient import TestClient

from app import state
from app.main import app
from app.persistence import Db, SqliteAnalytics, SqliteStore

client = TestClient(app)


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    """Сервер на файле SQLite, как с GAMEWINGO_DB."""
    path = str(tmp_path / "gamewingo.sqlite3")
    db = Db(path)
    monkeypatch.setattr(state, "_db", db)
    monkeypatch.setattr(state, "store", SqliteStore(db))
    monkeypatch.setattr(state, "analytics", SqliteAnalytics(db))
    return path


def play(sid="s1"):
    return client.post("/progression/result", headers={"X-User-Id": "u1"}, json={
        "game": "pairs", "mode": "level", "level": 1, "won": True, "score": 500,
        "durationMs": 60_000, "sessionId": sid, "metrics": {"moves": 10},
    })


def test_wallet_audit_and_facts_survive_restart(db_path):
    assert play().json()["xp"] > 0
    client.post("/progression/checkin", headers={"X-User-Id": "u1"})
    before = state.store.user("u1")

    restarted = Db(db_path)
    store, analytics = SqliteStore(restarted), SqliteAnalytics(restarted)

    after = store.users["u1"]
    assert (after.balance, after.keys, after.stats, after.day) == (before.balance, before.keys, before.stats, before.day)
    assert [(a.xp, a.reason, a.ts) for a in store.audit] == [(a.xp, a.reason, a.ts) for a in state.store.audit]
    assert list(analytics.rounds) == list(state.analytics.rounds) and len(analytics.rounds) == 1
    assert len(analytics.visits) == 1


def test_repeat_after_restart_pays_nothing(db_path, monkeypatch):
    """Идемпотентные ключи наград читаются с диска: повтор уровня не платит тариф заново."""
    first = play().json()["xp"]
    monkeypatch.setattr(state, "store", SqliteStore(Db(db_path)))
    assert "level-pairs-1" in state.store.user("u1").keys

    assert play(sid="s2").json()["xp"] < first
    assert [a.session_id for a in state.store.audit if a.reason == "level-pairs-1"] == ["s1"]


def test_admin_override_survives_restart(db_path):
    config = client.get("/admin/configs/pairs").json()["base"]
    assert client.put("/admin/configs/pairs", json=config).status_code == 200

    saved = Db(db_path).get("admin", {})
    assert saved["overrides"]["pairs"]["version"] == state.overrides["pairs"]["version"]
    assert len(saved["history"]["pairs"]) == 1


def test_demo_seed_and_wipe_refused_on_durable_store(db_path):
    play()
    assert client.post("/analytics/demo").status_code == 409
    assert client.delete("/analytics/data").status_code == 409
    assert len(state.store.audit) > 0
