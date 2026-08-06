"""GameWingo Score Engine.

Запуск локально:
    cd backend && pip install -r requirements.txt
    uvicorn app.main:app --reload

Демо-режим работает из коробки (память процесса). Точки боевой интеграции
помечены в app/state.py, app/progression/router.py (авторизация) и
backend/migrations/001_progression.sql (схема Supabase).
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .admin.router import router as admin_router
from .progression.router import router as progression_router

app = FastAPI(
    title="GameWingo Score Engine",
    description="Событийный скоринг каталога игр: баллы, звёзды, задания, достижения, антифрод.",
)

# Игры зовут API из WebView с домена каталога; список доменов задаёт окружение.
origins = os.environ.get("GAMEWINGO_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(progression_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
