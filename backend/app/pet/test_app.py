"""Isolated Phoenix test API. Never mount this in the production Score Engine."""
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ..progression.models import GameResult
from . import store
from .router import PetName, _meaningful
from .test_tokens import _secret, verify_token


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _secret()  # Refuse to start a public listener without a signing secret.
    yield


app = FastAPI(title="GameWingo Phoenix Test", docs_url=None, redoc_url=None,
              openapi_url=None, lifespan=lifespan)
origins = [part.strip() for part in os.environ.get("GAMEWINGO_PET_TEST_ORIGINS", "").split(",") if part.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PATCH"],
                   allow_headers=["Authorization", "Content-Type"])


def test_user(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Нужен тестовый токен")
    return verify_token(authorization[7:])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/pet/state")
def get_state(user_id: str = Depends(test_user)) -> dict:
    return store.state(user_id)


@app.post("/pet/result")
def post_result(result: GameResult, user_id: str = Depends(test_user)) -> dict:
    return store.record(user_id, result.game, result.sessionId, _meaningful(result))


@app.patch("/pet/name")
def patch_name(data: PetName, user_id: str = Depends(test_user)) -> dict:
    name = " ".join(data.name.split())
    if not name or any(not (ch.isalnum() or ch in " -") for ch in name):
        raise HTTPException(422, "Имя может содержать буквы, цифры, пробел и дефис")
    try:
        return store.rename(user_id, name)
    except ValueError:
        raise HTTPException(409, "Имя доступно после вылупления") from None
