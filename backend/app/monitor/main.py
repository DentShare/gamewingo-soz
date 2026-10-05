"""uvicorn app.monitor.main:app — отдельный сервис с постоянным диском."""
import csv
import io
import json
import os
import secrets
import shutil
import sqlite3
import tempfile
import time
import zipfile
from contextlib import closing, contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field, ValidationError
from starlette.background import BackgroundTask

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


@app.get("/monitor/archive.zip", dependencies=[Depends(auth)])
def archive():
    """Consistent, complete snapshot; report date windows never trim the archive."""
    folder = Path(tempfile.mkdtemp(prefix="wingo-export-"))
    try:
        snapshot = folder / "monitor.sqlite3"
        # SQLite's online backup API includes committed data, even with active writers.
        with database() as source:
            with closing(sqlite3.connect(snapshot)) as target:
                source.backup(target)
        created = datetime.now(timezone.utc)
        counts = {}
        queries = {
            "sessions": "SELECT * FROM sessions ORDER BY user_id,session_id,day",
            "coins": "SELECT * FROM coins ORDER BY user_id,reward_key",
            "played_rounds": "SELECT * FROM played_rounds ORDER BY user_id,round_id",
            "users": """WITH ids AS (SELECT user_id FROM sessions UNION SELECT user_id FROM coins
                UNION SELECT user_id FROM played_rounds),
                s AS (SELECT user_id,SUM(active_ms) active_ms,SUM(rounds) rounds,
                      MIN(day) first_day,MAX(last_seen) last_seen FROM sessions GROUP BY user_id),
                c AS (SELECT user_id,SUM(amount) coins FROM coins GROUP BY user_id)
                SELECT ids.user_id,COALESCE(s.active_ms,0) active_ms,COALESCE(s.rounds,0) rounds,
                       COALESCE(c.coins,0) coins,s.first_day,s.last_seen
                FROM ids LEFT JOIN s USING(user_id) LEFT JOIN c USING(user_id) ORDER BY ids.user_id""",
        }
        path = folder / "history.zip"
        with closing(sqlite3.connect(snapshot)) as db, zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as package:
            package.write(snapshot, "monitor.sqlite3")
            for name, query in queries.items():
                cursor = db.execute(query)
                counts[name] = 0
                with package.open(f"{name}.csv", "w") as raw:
                    with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as text:
                        writer = csv.writer(text)
                        writer.writerow([column[0] for column in cursor.description])
                        for record in cursor:
                            writer.writerow(record)
                            counts[name] += 1
            package.writestr("manifest.json", json.dumps({
                "format": "gamewingo-pilot-history", "version": 1,
                "exportedAt": created.isoformat(), "scope": "all-stored-history",
                "timezone": "Asia/Tashkent", "coinSource": "client-demo", "rows": counts,
            }, ensure_ascii=False, indent=2))
            package.writestr("README.txt", """GameWingo: полная история пилота, без фильтра по периоду.
monitor.sqlite3 — согласованная копия базы, пригодная для восстановления.
users.csv — анонимные ID и итоговые показатели за всё время.
sessions.csv — активное время и число партий по сессиям и дням.
played_rounds.csv — отдельные партии, игра, счёт, время и длительность.
coins.csv — начисления и уникальные ключи наград.
manifest.json — версия формата, время выгрузки и количество записей.
CSV: UTF-8 с BOM. Время last_seen: Unix seconds; ended_at: UTC ISO 8601.
Дни: Asia/Tashkent. Длительность: миллисекунды.
При переносе сохраняйте user_id, session_id, round_id и reward_key без изменений.
Ключи: sessions(user_id,session_id,day), coins(user_id,reward_key),
played_rounds(user_id,round_id). Повторный импорт не должен дублировать записи.
user_id обозначает браузер, а не установленную личность или аккаунт партнёра.
Связь с будущим аккаунтом требует отдельного сопоставления ID при авторизации.
Коины — данные демо-клиента, не подтверждение реальных финансовых выплат.
Пароли и серверные переменные в архив не включены.
""")
        return FileResponse(path, media_type="application/zip",
                            filename=f"gamewingo-history-{created.strftime('%Y%m%dT%H%M%SZ')}.zip",
                            headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow"},
                            background=BackgroundTask(shutil.rmtree, folder))
    except Exception:
        shutil.rmtree(folder)
        raise
