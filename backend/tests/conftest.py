import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import state  # noqa: E402
from app.progression.store import InMemoryStore  # noqa: E402


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    """Каждый тест начинает с пустого демо-хранилища и без override-ов.

    Пользователь — из X-User-Id (демо-авторизация); проверку JWT тесты
    test_auth.py включают сами.
    """
    monkeypatch.setenv("GAMEWINGO_AUTH", "demo")
    monkeypatch.delenv("GAMEWINGO_JWKS_URL", raising=False)
    state.store = InMemoryStore()
    state.overrides.clear()
    state.override_history.clear()
    yield
