from fastapi.testclient import TestClient

from app.main import app
from app.progression import config_loader

client = TestClient(app)


def get_base(game="pairs"):
    return client.get(f"/admin/configs/{game}").json()["base"]


def test_get_returns_base_without_override():
    data = client.get("/admin/configs/pairs").json()
    assert data["base"]["gameId"] == "pairs" and data["override"] is None


def test_unknown_game_404():
    assert client.get("/admin/configs/tetris").status_code == 404


def test_save_validates_schema():
    broken = {**get_base(), "scoring": [{"event": "x", "base": 0}]}  # base=0 без perItemKey
    assert client.put("/admin/configs/pairs", json=broken).status_code == 422


def test_override_changes_engine_behaviour():
    config = get_base()
    for rule in config["scoring"]:
        if rule["event"] == "pair_found":
            rule["base"] = 999
    saved = client.put("/admin/configs/pairs", json=config).json()
    assert saved["ok"] and saved["version"] == config["version"] + 1

    events = [{"game": "pairs", "name": "pair_found", "sessionId": "adm", "clientTs": 0, "meta": {}}]
    assert client.post("/progression/events", json=events).json()["xp"] == 999


def test_rollback_restores_previous_version():
    config = get_base()
    client.put("/admin/configs/pairs", json=config)
    history = client.get("/admin/configs/pairs/history").json()
    assert len(history) == 1

    rolled = client.post("/admin/configs/pairs/rollback", json={"index": 0}).json()
    assert rolled["ok"]
    data = client.get("/admin/configs/pairs").json()
    assert data["override"]["version"] == config["version"]


def test_drop_override_returns_to_file():
    client.put("/admin/configs/pairs", json=get_base())
    client.delete("/admin/configs/pairs/override")
    assert client.get("/admin/configs/pairs").json()["override"] is None


def test_simulator_forecasts_days():
    res = client.post("/admin/simulate/pairs", json={
        "profile": {"sessionsPerDay": 3, "avgSkill": 0.6, "days": 7},
    }).json()
    assert len(res["dailyXp"]) == 7
    assert res["total"] == sum(res["dailyXp"]) > 0


def test_all_exported_configs_pass_admin_schema():
    """Каждый JSON из progression:export обязан проходить валидацию админки."""
    from app.admin.schemas import ProgressionConfig
    for game in config_loader.list_games():
        cfg = ProgressionConfig.model_validate(config_loader.get_config(game))
        assert cfg.levels is not None and len(cfg.levels) == 15, game
