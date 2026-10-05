"""uvicorn app.monitor.main:app — отдельный сервис с постоянным диском."""
import csv
import io
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field, ValidationError

app = FastAPI(title="GameWingo Pilot Monitor", docs_url=None, redoc_url=None, openapi_url=None)
TZ = timezone(timedelta(hours=5))
MAX_BODY = 65536
basic = HTTPBasic()
origins = [s.strip() for s in os.getenv("GAMEWINGO_ORIGINS", "https://gamewingo-soz.vercel.app").split(",") if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST"], allow_headers=["Content-Type"])


def auth(credentials: Annotated[HTTPBasicCredentials, Depends(basic)]):
    token = os.getenv("MONITOR_TOKEN", "")
    valid = secrets.compare_digest(credentials.password.encode(), token.encode())
    if not token or credentials.username != "report" or not valid:
        raise HTTPException(401, "Доступ к отчёту закрыт", headers={"WWW-Authenticate": 'Basic realm="GameWingo report"'})


class Coin(BaseModel):
    key: str = Field(min_length=1, max_length=160, pattern=r"^[a-zA-Z0-9:_-]+$")
    amount: int = Field(gt=0, le=10000, strict=True)
    day: date


class PlayedRound(BaseModel):
    roundId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    day: date
    endedAt: datetime
    score: int = Field(ge=0, le=1000000000, strict=True)
    durationMs: int = Field(ge=0, le=86400000, strict=True)


class Session(BaseModel):
    userId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    sessionId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    game: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    day: date
    activeMs: int = Field(ge=0, le=86400000, strict=True)
    rounds: int = Field(ge=0, le=10000, strict=True)
    active: bool
    coins: list[Coin] = Field(default_factory=list, max_length=100)
    history: list[PlayedRound] = Field(default_factory=list, max_length=100)


class Batch(BaseModel):
    sessions: list[Session] = Field(min_length=1, max_length=20)


@contextmanager
def database():
    path = Path(os.getenv("MONITOR_DB_PATH", "data/monitor.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                user_id TEXT, session_id TEXT, game TEXT, day TEXT,
                active_ms INTEGER, rounds INTEGER, last_seen REAL, active INTEGER,
                PRIMARY KEY(user_id,session_id,day)
            );
            CREATE INDEX IF NOT EXISTS sessions_day ON sessions(day);
            CREATE TABLE IF NOT EXISTS coins (
                user_id TEXT, reward_key TEXT, game TEXT, day TEXT, amount INTEGER,
                PRIMARY KEY(user_id,reward_key)
            );
            CREATE INDEX IF NOT EXISTS coins_day ON coins(day);
            CREATE TABLE IF NOT EXISTS played_rounds (
                user_id TEXT, round_id TEXT, session_id TEXT, game TEXT, day TEXT,
                ended_at TEXT, score INTEGER, duration_ms INTEGER,
                PRIMARY KEY(user_id,round_id)
            );
            CREATE INDEX IF NOT EXISTS rounds_user_day ON played_rounds(user_id,day);
        """)
        yield db
        db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    with database() as db:
        db.execute("SELECT 1")
    return {"status": "ok"}


@app.post("/monitor/collect")
async def collect(request: Request):
    if request.headers.get("origin") not in origins:
        raise HTTPException(403, "Источник не разрешён")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            raise HTTPException(413, "Пакет слишком большой")
    try:
        batch = Batch.model_validate(json.loads(body))
    except (ValidationError, ValueError, UnicodeDecodeError):
        raise HTTPException(422, "Неверный пакет")
    today = datetime.now(TZ).date()
    first = today - timedelta(days=180)
    if any(not first <= s.day <= today or any(not first <= c.day <= today for c in s.coins)
           or any(not first <= r.day <= today or r.endedAt.tzinfo is None
                  or r.endedAt.astimezone(TZ).date() != r.day for r in s.history)
           for s in batch.sessions):
        raise HTTPException(422, "Дата вне разрешённого периода")
    with database() as db:
        for s in batch.sessions:
            db.execute("""INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id,session_id,day) DO UPDATE SET
                active_ms=MAX(active_ms,excluded.active_ms),
                rounds=MAX(rounds,excluded.rounds),
                last_seen=excluded.last_seen, active=excluded.active""",
                (s.userId, s.sessionId, s.game, str(s.day), s.activeMs, s.rounds, time.time(), int(s.active)))
            for coin in s.coins:
                db.execute("INSERT OR IGNORE INTO coins VALUES (?,?,?,?,?)",
                           (s.userId, coin.key, s.game, str(coin.day), coin.amount))
            for r in s.history:
                db.execute("INSERT OR IGNORE INTO played_rounds VALUES (?,?,?,?,?,?,?,?)",
                           (s.userId, r.roundId, s.sessionId, s.game, str(r.day),
                            r.endedAt.astimezone(timezone.utc).isoformat(), r.score, r.durationMs))
    return {"accepted": True}


def report(days: int):
    today = datetime.now(TZ).date()
    first = str(today - timedelta(days=days - 1))
    with database() as db:
        sessions = db.execute("SELECT * FROM sessions WHERE day BETWEEN ? AND ?", (first, str(today))).fetchall()
        coins = db.execute("SELECT * FROM coins WHERE day BETWEEN ? AND ?", (first, str(today))).fetchall()
    daily = {}
    users = {}
    games = {}
    for i in range(days):
        d = str(today - timedelta(days=days - 1 - i))
        daily[d] = {"date": d, "players": set(), "activeMs": 0, "rounds": 0, "coins": 0}
    for s in sessions:
        game = games.setdefault(s["game"], {"game": s["game"], "players": set(), "activeMs": 0, "rounds": 0, "coins": 0})
        game["players"].add(s["user_id"])
        user = users.setdefault(s["user_id"], {"userId": s["user_id"], "activeMs": 0, "rounds": 0, "coins": 0, "lastSeen": 0})
        user["lastSeen"] = max(user["lastSeen"], s["last_seen"])
        bucket = daily[s["day"]]
        bucket["players"].add(s["user_id"])
        for key, column in [("activeMs", "active_ms"), ("rounds", "rounds")]:
            user[key] += s[column]
            bucket[key] += s[column]
            game[key] += s[column]
    for c in coins:
        game = games.setdefault(c["game"], {"game": c["game"], "players": set(), "activeMs": 0, "rounds": 0, "coins": 0})
        game["players"].add(c["user_id"])
        game["coins"] += c["amount"]
        user = users.setdefault(c["user_id"], {"userId": c["user_id"], "activeMs": 0, "rounds": 0, "coins": 0, "lastSeen": 0})
        user["coins"] += c["amount"]
        daily[c["day"]]["coins"] += c["amount"]
        daily[c["day"]]["players"].add(c["user_id"])
    online = {s["user_id"] for s in sessions if s["active"] and s["last_seen"] >= time.time() - 45 and s["day"] == str(today)}
    return {
        "totals": {"players": len(users), "online": len(online),
                   **{key: sum(u[key] for u in users.values()) for key in ("activeMs", "rounds", "coins")}},
        "days": [{**d, "players": len(d["players"])} for d in daily.values()],
        "users": sorted(users.values(), key=lambda u: -u["activeMs"]),
        "games": [{**g, "players": len(g["players"])} for g in sorted(games.values(), key=lambda g: -g["activeMs"])],
        "timezone": "Asia/Tashkent", "coinSource": "client-demo",
    }


@app.get("/monitor/ui", dependencies=[Depends(auth)], include_in_schema=False)
def ui():
    return FileResponse(Path(__file__).parent / "index.html", headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"})


@app.get("/monitor/summary", dependencies=[Depends(auth)])
def summary(days: int = Query(14, ge=1, le=180)):
    return Response(json.dumps(report(days)), media_type="application/json", headers={"Cache-Control": "no-store"})


@app.get("/monitor/export.csv", dependencies=[Depends(auth)])
def export(days: int = Query(14, ge=1, le=180), kind: str = Query("days", pattern="^(days|users)$")):
    rows = report(days)[kind]
    buf = io.StringIO()
    fields = ["date", "players", "activeMs", "rounds", "coins"] if kind == "days" else ["userId", "activeMs", "rounds", "coins", "lastSeen"]
    writer = csv.DictWriter(buf, fields)
    writer.writeheader()
    writer.writerows(rows)
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="gamewingo-{kind}.csv"', "Cache-Control": "no-store",
    })


@app.get("/monitor/history", dependencies=[Depends(auth)])
def history(user: str = Query(pattern=r"^[a-f0-9-]{36}$"),
            days: int = Query(14, ge=1, le=180), limit: int = Query(200, ge=1, le=1000)):
    today = datetime.now(TZ).date()
    first = str(today - timedelta(days=days - 1))
    with database() as db:
        rows = db.execute("""SELECT round_id AS roundId, game, ended_at AS endedAt,
            score, duration_ms AS durationMs FROM played_rounds
            WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY ended_at DESC LIMIT ?""",
            (user, first, str(today), limit)).fetchall()
    return Response(json.dumps({"userId": user, "rounds": [dict(row) for row in rows]}),
                    media_type="application/json", headers={"Cache-Control": "no-store"})
