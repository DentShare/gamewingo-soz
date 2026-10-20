import csv
import io
import json
import sqlite3
import zipfile
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.monitor.main import app, database, TZ
from app.monitor.analytics import analytics_report
from app.monitor.backup import verify_archive

client = TestClient(app)
AUTH = ("report", "analytics-test-password")
ORIGIN = {"Origin": "https://gamewingo-soz.vercel.app"}


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("MONITOR_TOKEN", AUTH[1])
    monkeypatch.setenv("MONITOR_DB_PATH", str(tmp_path / "history.sqlite3"))


def activity(db, user, *days, active=100):
    for day in days:
        db.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?)",
                   (user, str(uuid4()), "soz", str(day), active, 0, 1, 0))


def test_exact_retention_excludes_current_day_and_uses_first_lifetime_activity():
    today = date(2026, 10, 20)
    first = date(2026, 9, 10)
    a, b, young, idle = [str(uuid4()) for _ in range(4)]
    with database() as db:
        activity(db, a, first, first+timedelta(days=1), first+timedelta(days=7), first+timedelta(days=30), today)
        activity(db, b, first, first+timedelta(days=2))
        activity(db, young, today-timedelta(days=1), today)
        activity(db, idle, first, today, active=0)
        data = analytics_report(db, 14, today)
    assert data['activity'] == {'dau': 2, 'wau': 2, 'mau': 2, 'activePlayersPeriod': 2,
                                'newPlayersPeriod': 1, 'returningPlayersPeriod': 1}
    assert data['firstObservedActivity'] == str(first)
    assert data['retention']['intervals'] == [dict(day=n, eligible=2, returned=1, rate=50.0) for n in (1, 7, 30)]
    cohort = data['retention']['cohorts'][0]
    assert cohort['date'] == '2026-10-19'
    assert cohort['d1'] == {'eligible': 0, 'returned': 0, 'rate': None}


def payload(**changes):
    from datetime import datetime
    day = str(datetime.now(TZ).date())
    return {'userId': str(uuid4()), 'sessionId': str(uuid4()), 'game': 'soz', 'day': day,
            'activeMs': 1000, 'rounds': 0, 'active': True, 'coins': [],
            'funnel': {'openedDay': day, 'started': False, 'completed': False, 'replayed': False}, **changes}


def collect(*rows):
    return client.post('/monitor/collect', json={'sessions': rows}, headers=ORIGIN)


def data(days=14):
    response = client.get(f'/monitor/analytics?days={days}', auth=AUTH)
    assert response.headers['cache-control'] == 'no-store'
    return response.json()


def test_funnel_is_deduplicated_monotonic_and_excludes_legacy():
    opened, started, played = [payload() for _ in range(3)]
    started['funnel']['started'] = True
    played['funnel'].update(started=True, completed=True, replayed=True)
    assert collect(opened, started, played, payload(funnel=None, rounds=5)).status_code == 200
    assert collect(played, {**played, 'funnel': opened['funnel']}).status_code == 200
    # A second page for the same browser is not another unique player.
    assert collect({**played, 'sessionId': str(uuid4())}).status_code == 200
    result = data()['funnel']
    assert [s['players'] for s in result['stages']] == [3, 2, 1, 1]
    assert result['pageSessions'] == 4
    assert result['stages'][2]['fromPrevious'] == 50
    assert result['games'][0]['withoutCompletion'] == 1
    assert result['observedSince'] is not None


def test_funnel_page_cohort_survives_midnight_without_double_counting():
    from datetime import datetime
    yesterday = str(datetime.now(TZ).date()-timedelta(days=1))
    p = payload(day=yesterday)
    p['funnel']['openedDay'] = yesterday
    assert collect(p).status_code == 200
    later = {**p, 'day': str(datetime.now(TZ).date()),
             'funnel': {**p['funnel'], 'started': True, 'completed': True}}
    assert collect(later).status_code == 200
    assert data()['funnel']['pageSessions'] == 1
    assert data(1)['funnel']['pageSessions'] == 0


def test_invalid_stage_order_and_open_date_rejected():
    p = payload()
    for changes in ({'completed': True}, {'replayed': True}, {'started': 1}, {'openedDay': '2999-01-01'}):
        assert collect({**p, 'funnel': {**p['funnel'], **changes}}).status_code == 422


def test_empty_analytics_has_unknown_rates_and_valid_exports():
    result = data()
    assert result['retention']['intervals'][0]['rate'] is None
    assert result['funnel']['stages'][0]['fromOpened'] is None
    assert result['funnel']['observedSince'] is None
    for kind in ('games', 'cohorts', 'funnel'):
        response = client.get(f'/monitor/analytics.csv?kind={kind}', auth=AUTH)
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
    assert client.get('/monitor/analytics.csv?kind=bad', auth=AUTH).status_code == 422


def test_archive_includes_restorable_funnel_and_old_archives_still_verify(tmp_path):
    p = payload()
    p['funnel'].update(started=True, completed=True, replayed=True)
    collect(p)
    response = client.get('/monitor/archive.zip', auth=AUTH)
    path = tmp_path / 'history-v2.zip'
    path.write_bytes(response.content)
    assert verify_archive(path)['rows']['funnel_sessions'] == 1
    restored = tmp_path / 'restored.sqlite3'
    with zipfile.ZipFile(path) as package:
        restored.write_bytes(package.read('monitor.sqlite3'))
        records = list(csv.DictReader(io.StringIO(package.read('funnel_sessions.csv').decode('utf-8-sig'))))
        assert records[0]['user_id'] == p['userId']
        assert records[0]['replayed'] == '1'
        legacy = tmp_path / 'history-v1.zip'
        with zipfile.ZipFile(legacy, 'w') as old:
            for member in package.namelist():
                if member == 'funnel_sessions.csv':
                    continue
                content = package.read(member)
                if member == 'manifest.json':
                    manifest = json.loads(content)
                    manifest['version'] = 1
                    del manifest['rows']['funnel_sessions']
                    content = json.dumps(manifest).encode()
                old.writestr(member, content)
    assert verify_archive(legacy)['version'] == 1
    from contextlib import closing
    with closing(sqlite3.connect(restored)) as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert db.execute('SELECT replayed FROM funnel_sessions').fetchone()[0] == 1


def test_csv_cohort_values_are_numeric_and_pending_is_empty():
    collect(payload())
    response = client.get('/monitor/analytics.csv?kind=cohorts', auth=AUTH)
    records = list(csv.DictReader(io.StringIO(response.text.lstrip('\ufeff'))))
    assert records[0]['players'] == '1'
    assert records[0]['d1Eligible'] == '0'
    assert records[0]['d1Rate'] == ''
