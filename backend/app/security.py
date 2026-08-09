"""Доступ к служебным разделам: админка баланса и аналитика.

Одно правило на оба: если в окружении задан ADMIN_TOKEN, каждый запрос обязан
прислать его в заголовке X-Admin-Token. Без переменной разделы открыты — это
допустимо только для локальной разработки, в проде токен обязателен
(см. backend/README.md).
"""
import os
from typing import Optional

from fastapi import HTTPException


def check_admin_token(token: Optional[str]) -> None:
    expected = os.environ.get("ADMIN_TOKEN")
    if expected and token != expected:
        raise HTTPException(401, "Нужен верный X-Admin-Token")
