from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.monitor.main import TZ, app

client = TestClient(app)
ORIGIN = {"Origin": "https://gamewingo-soz.vercel.app"}
AUTH = ("report", "test-report-password")


@pytest.fixture(autouse=True)
def monitor_env(monkeypatch, tmp_path):
    monkeypatch.setenv("MONITOR_TOKEN", AUTH[1])
    monkeypatch.setenv("MONITOR_DB_PATH", str(tmp_path / "monitor.sqlite3"))


def session(**changes):
    return {"userId": str(uuid4()), "sessionId": str(uuid4()), "game": "soz",
            "day": str(datetime.now(TZ).date()), "activeMs": 15000, "rounds": 1,
            "active": True, "coins": [], **changes}


def collect(*rows, headers=ORIGIN):
    return client.post("/monitor/collect", json={"sessions": rows}, headers=headers)


def summary():
    return client.get("/monitor/summary", auth=AUTH).json()


def test_retry_and_out_of_order_do_not_duplicate():
    s = session(coins=[{"key": "soz-daily-123", "amount": 25, "day": str(datetime.now(TZ).date())}])
    assert collect(s).status_code == 200
    assert collect(s).status_code == 200
    assert collect({**s, "activeMs": 1000, "rounds": 0}).status_code == 200
    assert summary()["totals"] == {"players": 1, "online": 1, "activeMs": 15000, "rounds": 1, "coins": 25}


def test_same_browser_multiple_pages_one_player_and_reward():
    s = session(coins=[{"key": "checkin-123", "amount": 5, "day": str(datetime.now(TZ).date())}])
    collect(s, {**s, "sessionId": str(uuid4()), "game": "hub"})
    assert summary()["totals"] == {"players": 1, "online": 1, "activeMs": 30000, "rounds": 2, "coins": 5}
    games = summary()["games"]
    assert sum(g["coins"] for g in games) == 5
    assert sum(g["activeMs"] for g in games) == 30000


@pytest.mark.parametrize("path", ["/monitor/ui", "/monitor/summary", "/monitor/export.csv"])
def test_reports_require_password_even_without_config(path, monkeypatch):
    assert client.get(path).status_code == 401
    assert client.get(path, auth=("report", "wrong")).status_code == 401
    assert client.get(path, auth=AUTH).status_code == 200
    monkeypatch.delenv("MONITOR_TOKEN")
    assert client.get(path, auth=AUTH).status_code == 401


def test_origin_and_payload_validation():
    assert collect(session(), headers={}).status_code == 403
    assert collect(session(), headers={"Origin": "https://example.com"}).status_code == 403
    assert collect(session(activeMs=-1)).status_code == 422
    assert collect(session(day="2999-01-01")).status_code == 422
    assert client.post("/monitor/collect", content="x" * 65537, headers=ORIGIN).status_code == 413


def test_online_expires_and_inactive_excluded(monkeypatch):
    s = session()
    collect(s)
    assert summary()["totals"]["online"] == 1
    collect({**s, "active": False})
    assert summary()["totals"]["online"] == 0
    collect(s)
    import app.monitor.main as monitor
    real_time = monitor.time.time()
    monkeypatch.setattr(monitor.time, "time", lambda: real_time + 46)
    assert summary()["totals"]["online"] == 0


def test_calendar_window_and_export():
    yesterday = str(datetime.now(TZ).date() - timedelta(days=1))
    collect(session(day=yesterday), session())
    response = client.get("/monitor/summary?days=1", auth=AUTH)
    assert response.json()["totals"]["players"] == 1
    assert len(response.json()["days"]) == 1
    csv = client.get("/monitor/export.csv?kind=users", auth=AUTH)
    assert "userId,activeMs,rounds,coins,lastSeen" in csv.text
    assert csv.headers["cache-control"] == "no-store"
    assert client.get("/monitor/export.csv?kind=unknown", auth=AUTH).status_code == 422


def test_individual_round_history_is_persistent_and_deduplicated():
    played = {"roundId": str(uuid4()), "day": str(datetime.now(TZ).date()),
              "endedAt": datetime.now(timezone.utc).isoformat(), "score": 250, "durationMs": 30000}
    s = session(history=[played])
    assert collect(s).status_code == 200
    assert collect(s).status_code == 200
    path = f'/monitor/history?user={s["userId"]}'
    assert client.get(path).status_code == 401
    data = TestClient(app).get(path, auth=AUTH).json()
    assert len(data["rounds"]) == 1
    assert data["rounds"][0]["score"] == 250
    assert data["rounds"][0]["durationMs"] == 30000
    assert client.get(f'/monitor/history?user={uuid4()}', auth=AUTH).json()["rounds"] == []
