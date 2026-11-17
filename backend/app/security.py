"""Доступ к служебным разделам: админка баланса и аналитика.

Одно правило на оба: каждый запрос обязан прислать ADMIN_TOKEN из окружения
в заголовке X-Admin-Token. Закрыто по умолчанию: без переменной разделы
отвечают 503 — забытая настройка не открывает правку экономики всему
интернету. Открыть без токена можно только явно, `GAMEWINGO_AUTH=demo`
(локальная разработка и тесты, см. backend/README.md).
"""
import hmac
import os
from typing import Optional

from fastapi import HTTPException


def demo_mode() -> bool:
    return os.environ.get("GAMEWINGO_AUTH", "").strip().lower() == "demo"


def check_admin_token(token: Optional[str]) -> None:
    expected = os.environ.get("ADMIN_TOKEN")
    if not expected:
        if demo_mode():
            return
        raise HTTPException(503, "Служебные разделы закрыты: задайте ADMIN_TOKEN")
    if not hmac.compare_digest((token or "").encode(), expected.encode()):
        raise HTTPException(401, "Нужен верный X-Admin-Token")
