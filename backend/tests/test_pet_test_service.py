"""Cross-device identities and rejection paths of the isolated test API."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.pet.test_app import app
from app.pet.test_tokens import issue_token, verify_token


@pytest.fixture(autouse=True)
def test_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("GAMEWINGO_PET_DB", str(tmp_path / "pet.sqlite3"))
    monkeypatch.setenv("GAMEWINGO_PET_TEST_SECRET", "s" * 48)


def _round(sid: str) -> dict:
    return {"game": "pairs", "mode": "level", "level": 1, "score": 100,
            "durationMs": 5000, "sessionId": sid, "won": True, "metrics": {"moves": 3}}


def test_token_is_bound_to_user_and_expires():
    user = str(uuid4())
    token = issue_token(user, now=100)
    assert verify_token(token, now=101) == user
    with pytest.raises(Exception) as expired:
        verify_token(token, now=100 + 14 * 86400)
    assert expired.value.status_code == 401
    with pytest.raises(Exception) as tampered:
        verify_token(token[:-1] + ("a" if token[-1] != "a" else "b"), now=101)
    assert tampered.value.status_code == 401


def test_two_devices_share_one_state_and_other_user_is_isolated():
    token = issue_token()
    headers = {"Authorization": f"Bearer {token}"}
    other_headers = {"Authorization": f"Bearer {issue_token()}"}
    with TestClient(app) as device_one, TestClient(app) as device_two:
        assert device_one.get("/pet/state").status_code == 401
        assert device_one.get("/pet/state", headers={"Authorization": "Bearer fake"}).status_code == 401
        first = device_one.post("/pet/result", json=_round("session-1"), headers=headers)
        assert first.status_code == 200 and first.json()["awarded"]
        assert device_two.get("/pet/state", headers=headers).json()["total"] == 1
        assert device_two.post("/pet/result", json=_round("session-1"), headers=headers).json()["reason"] == "duplicate_session"
        assert device_two.get("/pet/state", headers=other_headers).json()["total"] == 0


def test_service_refuses_to_start_without_secret(monkeypatch):
    monkeypatch.delenv("GAMEWINGO_PET_TEST_SECRET")
    with pytest.raises(RuntimeError, match="TEST_SECRET"):
        with TestClient(app):
            pass
