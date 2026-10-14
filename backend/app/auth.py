"""Кто играет: проверка JWT финтех-приложения.

Приложение партнёра выдаёт игре токен в INIT (@gamewingo/game-bridge), игра
шлёт его в `Authorization: Bearer`. Сервер проверяет подпись по публичным
ключам партнёра (JWKS) и начисляет баллы пользователю из `sub`.

Окружение:

| Переменная | Зачем |
|---|---|
| `GAMEWINGO_JWKS_URL` | адрес JWKS партнёра — в бою обязателен |
| `GAMEWINGO_JWT_AUDIENCE` | ожидаемый `aud`, по умолчанию `wingo-games` |
| `GAMEWINGO_JWT_ISSUER` | ожидаемый `iss`; не задан — не проверяется |
| `GAMEWINGO_JWT_ALGORITHMS` | через запятую, по умолчанию `RS256,ES256` |
| `GAMEWINGO_AUTH=demo` | пользователь из `X-User-Id` без проверки — только локально и в тестах |

Закрыто по умолчанию: без JWKS и без demo маршруты игрока отвечают 503 —
сервер не начисляет баллы неизвестно кому из-за забытой переменной.
"""
import os
from functools import lru_cache
from typing import Optional

import jwt
from fastapi import Header, HTTPException

DEFAULT_AUDIENCE = "wingo-games"
DEFAULT_ALGORITHMS = "RS256,ES256"
# Часы приложения и сервера расходятся: полминуты допуска на exp/nbf/iat.
LEEWAY_SEC = 30
MAX_USER_ID = 128


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


@lru_cache(maxsize=4)
def _jwk_client(url: str) -> jwt.PyJWKClient:
    # Набор ключей кэшируется на 5 минут: смена ключа у партнёра подхватится сама.
    return jwt.PyJWKClient(url, cache_keys=True, timeout=5)


def _signing_key(url: str, token: str):
    return _jwk_client(url).get_signing_key_from_jwt(token).key


def _bearer(authorization: Optional[str]) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Нужен Authorization: Bearer <JWT>")
    return token.strip()


def verify_token(token: str) -> str:
    """Подпись, срок, aud и iss токена → обезличенный ID пользователя (`sub`)."""
    url = _env("GAMEWINGO_JWKS_URL")
    algorithms = [a.strip() for a in (_env("GAMEWINGO_JWT_ALGORITHMS") or DEFAULT_ALGORITHMS).split(",") if a.strip()]
    issuer = _env("GAMEWINGO_JWT_ISSUER") or None
    try:
        key = _signing_key(url, token)
        claims = jwt.decode(
            token, key, algorithms=algorithms,
            audience=_env("GAMEWINGO_JWT_AUDIENCE") or DEFAULT_AUDIENCE,
            issuer=issuer,
            leeway=LEEWAY_SEC,
            options={"require": ["exp", "sub"], "verify_iss": issuer is not None},
        )
    except jwt.PyJWKClientConnectionError:
        # Недоступен JWKS партнёра — беда сервера, а не игрока: пусть игра повторит позже.
        raise HTTPException(503, "Ключи JWKS недоступны")
    except jwt.PyJWTError:
        raise HTTPException(401, "Токен не прошёл проверку")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub or len(sub) > MAX_USER_ID:
        raise HTTPException(401, "В токене нет корректного sub")
    return sub


def current_user(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
) -> str:
    """Зависимость маршрутов игрока: ID пользователя, которому идут баллы."""
    if _env("GAMEWINGO_AUTH").lower() == "demo":
        return x_user_id or "demo"
    if not _env("GAMEWINGO_JWKS_URL"):
        raise HTTPException(503, "Авторизация не настроена: задайте GAMEWINGO_JWKS_URL")
    return verify_token(_bearer(authorization))
