"""Business metrics with explicit cohort and observation boundaries."""
from datetime import date, timedelta


def analytics_report(db, days, today):
    first = today - timedelta(days=days - 1)
    # Hidden, idle tabs sending zero-time heartbeats are not a return visit.
    records = db.execute("""SELECT DISTINCT user_id,day FROM sessions
        WHERE (active_ms>0 OR rounds>0) AND day<=?
        UNION SELECT user_id,day FROM played_rounds WHERE day<=?""",
                         (str(today), str(today))).fetchall()
    activity = {}
    for record in records:
        activity.setdefault(record["user_id"], set()).add(date.fromisoformat(record["day"]))
    cohorts = {}
    for user, dates in activity.items():
        cohorts.setdefault(min(dates), set()).add(user)

    def retention(users, offset):
        eligible = {u for u in users if min(activity[u]) + timedelta(days=offset) < today}
        returned = {u for u in eligible if min(activity[u]) + timedelta(days=offset) in activity[u]}
        return {"eligible": len(eligible), "returned": len(returned),
                "rate": round(len(returned) / len(eligible) * 100, 2) if eligible else None}

    in_period = {u for u, dates in activity.items() if any(first <= d <= today for d in dates)}
    counts = {key: sum(any(today - timedelta(days=n - 1) <= d <= today for d in dates)
                       for dates in activity.values()) for key, n in (("dau", 1), ("wau", 7), ("mau", 30))}
    counts.update({"activePlayersPeriod": len(in_period),
                   "newPlayersPeriod": sum(min(activity[u]) >= first for u in in_period),
                   "returningPlayersPeriod": sum(min(activity[u]) < first for u in in_period)})
    rows = db.execute("""SELECT * FROM funnel_sessions WHERE opened_day BETWEEN ? AND ?""",
                      (str(first), str(today))).fetchall()

    def funnel(source):
        opened = {r["user_id"] for r in source}
        started = {r["user_id"] for r in source if r["started"]}
        completed = {r["user_id"] for r in source if r["completed"]}
        replayed = {r["user_id"] for r in source if r["replayed"]}
        stages = []
        previous = None
        for key, users in (("opened", opened), ("started", started), ("completed", completed), ("replayed", replayed)):
            stages.append({"stage": key, "players": len(users),
                           "fromPrevious": round(len(users) / previous * 100, 2) if previous else None,
                           "fromOpened": round(len(users) / len(opened) * 100, 2) if opened else None})
            previous = len(users)
        return {"stages": stages, "pageSessions": len(source)}

    games = []
    for game in sorted({r["game"] for r in rows if r["game"] != "hub"}):
        group = [r for r in rows if r["game"] == game]
        stages = funnel(group)["stages"]
        games.append({"game": game, "opened": stages[0]["players"], "started": stages[1]["players"],
                      "completed": stages[2]["players"], "replayed": stages[3]["players"],
                      "completionRate": stages[2]["fromPrevious"],
                      "withoutCompletion": sum(r["started"] and not r["completed"] for r in group),
                      "pageSessions": len(group)})
    coverage = db.execute("SELECT MIN(received_at) FROM funnel_sessions").fetchone()[0]
    return {"period": {"first": str(first), "last": str(today)}, "activity": counts,
            "activityDefinition": "positive-active-time-or-completed-round",
            "firstObservedActivity": str(min(cohorts)) if cohorts else None,
            "retention": {"scope": "all-observed-cohorts", "completedDaysOnly": True,
                          "intervals": [{"day": n, **retention(set(activity), n)} for n in (1, 7, 30)],
                          "cohorts": [{"date": str(d), "players": len(users),
                                       **{f"d{n}": retention(users, n) for n in (1, 7, 30)}}
                                      for d, users in sorted(cohorts.items()) if first <= d <= today]},
            "funnel": {**funnel(rows), "observedSince": coverage, "games": games,
                       "scope": "page-sessions-opened-in-period", "replayScope": "same-page-after-completion"},
            "timezone": "Asia/Tashkent"}
