"""Short-lived, signed identities for the isolated Phoenix test service."""
import base64
import hashlib
import hmac
import json
import os
import time
from uuid import UUID, uuid4

from fastapi import HTTPException


def _secret() -> bytes:
    value = os.environ.get("GAMEWINGO_PET_TEST_SECRET", "").encode()
    if len(value) < 32:
        raise RuntimeError("GAMEWINGO_PET_TEST_SECRET must be at least 32 bytes")
    return value


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def issue_token(user_id: str | None = None, days: int = 14, now: int | None = None) -> str:
    if not 1 <= days <= 30:
        raise ValueError("days must be between 1 and 30")
    subject = str(UUID(user_id)) if user_id else str(uuid4())
    payload = {"v": 1, "aud": "gamewingo-phoenix-test", "sub": subject,
               "exp": (int(time.time()) if now is None else now) + days * 86400}
    body = _encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = _encode(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def verify_token(token: str, now: int | None = None) -> str:
    try:
        body, signature = token.split(".")
        if len(body) > 512 or not body or not signature:
            raise ValueError
        expected = _encode(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload["v"] != 1 or payload["aud"] != "gamewingo-phoenix-test":
            raise ValueError
        if not isinstance(payload["exp"], int) or payload["exp"] <= (int(time.time()) if now is None else now):
            raise ValueError
        return str(UUID(payload["sub"]))
    except (ValueError, KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(401, "Недействительный или истёкший тестовый токен") from None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Create a Phoenix test identity")
    parser.add_argument("--user", help="Existing UUID to reuse on another device")
    parser.add_argument("--days", type=int, default=14)
    args = parser.parse_args()
    print(issue_token(args.user, args.days))
