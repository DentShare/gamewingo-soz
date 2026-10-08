"""Проверка JWT партнёра: баллы идут только пользователю из подписанного токена."""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth, state
from app.main import app

client = TestClient(app)

PARTNER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
STRANGER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def jwt_mode(monkeypatch):
    """Боевой режим: demo выключен, ключ партнёра отдаётся без сети."""
    monkeypatch.delenv("GAMEWINGO_AUTH", raising=False)
    monkeypatch.setenv("GAMEWINGO_JWKS_URL", "https://partner.test/.well-known/jwks.json")
    monkeypatch.setenv("GAMEWINGO_JWT_ISSUER", "https://partner.test")
    monkeypatch.setattr(auth, "_signing_key", lambda url, token: PARTNER_KEY.public_key())


def token(sub="user-42", key=PARTNER_KEY, **overrides):
    claims = {
        "sub": sub, "aud": "wingo-games", "iss": "https://partner.test",
        "exp": int(time.time()) + 3600, **overrides,
    }
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "k1"})


def checkin(headers):
    return client.post("/progression/checkin", headers=headers)


def test_valid_token_credits_its_sub():
    r = checkin({"Authorization": f"Bearer {token()}"})
    assert r.status_code == 200 and r.json()["xp"] > 0
    assert set(state.store.users) == {"user-42"}


def test_x_user_id_is_ignored_outside_demo():
    r = checkin({"Authorization": f"Bearer {token()}", "X-User-Id": "someone-else"})
    assert r.status_code == 200
    assert set(state.store.users) == {"user-42"}


@pytest.mark.parametrize("headers", [
    {},
    {"X-User-Id": "user-42"},
    {"Authorization": "Basic dXNlcjpwYXNz"},
    {"Authorization": "Bearer "},
    {"Authorization": "Bearer not-a-jwt"},
])
def test_missing_or_malformed_token_rejected(headers):
    assert checkin(headers).status_code == 401
    assert state.store.users == {}


@pytest.mark.parametrize("bad", [
    {"key": STRANGER_KEY},
    {"aud": "other-service"},
    {"iss": "https://evil.test"},
    {"exp": int(time.time()) - 3600},
    {"sub": ""},
    {"sub": "x" * 200},
])
def test_invalid_token_rejected(bad):
    assert checkin({"Authorization": f"Bearer {token(**bad)}"}).status_code == 401
    assert state.store.users == {}


def test_token_without_sub_rejected():
    claims = {"aud": "wingo-games", "iss": "https://partner.test", "exp": int(time.time()) + 3600}
    raw = jwt.encode(claims, PARTNER_KEY, algorithm="RS256")
    assert checkin({"Authorization": f"Bearer {raw}"}).status_code == 401


def test_hs256_token_signed_with_public_key_rejected():
    """Подмена алгоритма: HS256 с публичным ключом как секретом не проходит."""
    raw = jwt.encode(
        {"sub": "user-42", "aud": "wingo-games", "iss": "https://partner.test", "exp": int(time.time()) + 3600},
        "public-key-used-as-an-hmac-secret!", algorithm="HS256",
    )
    assert checkin({"Authorization": f"Bearer {raw}"}).status_code == 401


def test_not_configured_is_closed(monkeypatch):
    monkeypatch.delenv("GAMEWINGO_JWKS_URL")
    r = checkin({"Authorization": f"Bearer {token()}", "X-User-Id": "user-42"})
    assert r.status_code == 503
    assert state.store.users == {}


def test_jwks_unreachable_is_503(monkeypatch):
    def down(url, token):
        raise jwt.PyJWKClientConnectionError("down")
    monkeypatch.setattr(auth, "_signing_key", down)
    assert checkin({"Authorization": f"Bearer {token()}"}).status_code == 503


def test_demo_mode_uses_x_user_id(monkeypatch):
    monkeypatch.setenv("GAMEWINGO_AUTH", "demo")
    monkeypatch.delenv("GAMEWINGO_JWKS_URL")
    assert checkin({"X-User-Id": "tester"}).status_code == 200
    assert set(state.store.users) == {"tester"}


def test_result_route_is_protected():
    r = client.post("/progression/result", json={
        "game": "pairs", "mode": "level", "level": 1, "won": True, "score": 100,
        "durationMs": 30_000, "sessionId": "s1", "metrics": {"moves": 8},
    })
    assert r.status_code == 401
