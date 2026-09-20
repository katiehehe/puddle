"""Loading a personal closet instead of the seeded one."""

import json

import pytest

from brain.wardrobe import WardrobeError, load

GOOD = {
    "closet": [
        {"title": "Charcoal crewneck", "price": 58, "wears": 30},
        {"title": "Rain jacket", "price": 110, "wears": 8},
        {"title": "White sneakers", "price": 85, "wears": 60, "size": "8"},
    ],
    "purchases": [
        {"title": "Suede boots", "price": 128, "size": "8", "hour": 23, "returned": True},
        {"title": "Charcoal crewneck", "price": 58, "hour": 14, "returned": False},
    ],
}


def write(tmp_path, data, monkeypatch):
    path = tmp_path / "w.json"
    path.write_text(json.dumps(data))
    monkeypatch.setenv("PUDDLE_WARDROBE", str(path))
    return path


def test_unset_env_means_the_seeded_closet_is_untouched(monkeypatch):
    monkeypatch.delenv("PUDDLE_WARDROBE", raising=False)
    assert load() is None


def test_titles_alone_are_enough(tmp_path, monkeypatch):
    """The whole point: you write names and prices, not formality ratings."""
    write(tmp_path, GOOD, monkeypatch)
    data = load()
    by_title = {i.title: i for i in data["closet"]}
    assert by_title["Charcoal crewneck"].kind == "crewneck"
    assert by_title["Rain jacket"].rain_ok is True
    assert by_title["White sneakers"].category == "shoes"


def test_explicit_fields_beat_the_guess(tmp_path, monkeypatch):
    data = {**GOOD, "closet": [{**GOOD["closet"][0], "warmth": 5, "formality": 4}]}
    write(tmp_path, data, monkeypatch)
    item = load()["closet"][0]
    assert (item.warmth, item.formality) == (5, 4)


def test_an_unrecognisable_item_is_reported_not_dropped(tmp_path, monkeypatch):
    """Silently losing your coat produces confident, wrong advice."""
    write(tmp_path, {**GOOD, "closet": GOOD["closet"] + [
        {"title": "Zorblatt", "price": 20, "wears": 5}]}, monkeypatch)
    with pytest.raises(WardrobeError, match="Zorblatt"):
        load()


def test_missing_price_is_refused(tmp_path, monkeypatch):
    write(tmp_path, {"closet": [{"title": "Charcoal crewneck", "wears": 3}]}, monkeypatch)
    with pytest.raises(WardrobeError, match="price"):
        load()


def test_all_zero_wears_is_refused(tmp_path, monkeypatch):
    """Wear counts are where the life mix comes from; all zeros scores nothing."""
    write(tmp_path, {"closet": [{"title": "Charcoal crewneck", "price": 58, "wears": 0}]}, monkeypatch)
    with pytest.raises(WardrobeError, match="life mix"):
        load()


def test_bad_hour_is_refused(tmp_path, monkeypatch):
    write(tmp_path, {**GOOD, "purchases": [
        {"title": "Suede boots", "price": 1, "hour": 47}]}, monkeypatch)
    with pytest.raises(WardrobeError, match="0-23"):
        load()


def test_missing_file_says_so_rather_than_falling_back(tmp_path, monkeypatch):
    monkeypatch.setenv("PUDDLE_WARDROBE", str(tmp_path / "nope.json"))
    with pytest.raises(WardrobeError, match="does not exist"):
        load()


def test_malformed_json_names_the_file(tmp_path, monkeypatch):
    path = tmp_path / "w.json"
    path.write_text("{ not json")
    monkeypatch.setenv("PUDDLE_WARDROBE", str(path))
    with pytest.raises(WardrobeError, match="not valid JSON"):
        load()


def test_wear_counts_become_events_life_mix_can_read(tmp_path, monkeypatch):
    write(tmp_path, GOOD, monkeypatch)
    data = load()
    assert len(data["wears"]) == 30 + 8 + 60
    assert {w["state"] for w in data["wears"]}, "every wear needs an occasion"
    assert all("worn_at" in w and "item_id" in w for w in data["wears"])


def test_the_example_file_in_the_repo_actually_loads(monkeypatch):
    """It is the thing people copy; if it does not parse, nobody gets started."""
    monkeypatch.setenv("PUDDLE_WARDROBE", "my_wardrobe.example.json")
    data = load()
    assert len(data["closet"]) >= 10
    assert any(p["returned"] for p in data["purchases"]), "the example needs returns to demo"
