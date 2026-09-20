"""What the user types in has to behave like part of the closet, not beside it."""

import pytest
from fastapi.testclient import TestClient

from brain import closet_store
from brain.app import app

client = TestClient(app)


def _add(**kwargs):
    body = {"title": "black chelsea boots", "price": 128, "bought_at": "2026-09-12"} | kwargs
    res = client.post("/purchases", json=body)
    assert res.status_code == 200, res.text
    return res.json()["purchase"]


def test_a_purchase_lands_in_the_closet_by_default():
    bought = _add()
    closet = client.get("/closet").json()["closet"]
    assert bought["id"] in [i["id"] for i in closet]
    assert bought["in_closet"] is True


def test_a_purchase_can_be_recorded_without_owning_it():
    bought = _add(add_to_closet=False)
    closet = client.get("/closet").json()["closet"]
    assert bought["id"] not in [i["id"] for i in closet]
    assert bought["id"] in [p["id"] for p in client.get("/purchases").json()["purchases"]]


def test_archiving_keeps_the_purchase_and_drops_the_item():
    bought = _add()
    res = client.patch(f"/purchases/{bought['id']}", json={"archived": True, "archive_reason": "sold"})
    assert res.json()["purchase"]["in_closet"] is False
    assert bought["id"] not in [i["id"] for i in client.get("/closet").json()["closet"]]
    assert bought["id"] in [p["id"] for p in client.get("/purchases").json()["purchases"]]


def test_one_click_is_one_wear_and_it_moves_cost_per_wear():
    bought = _add(wears=1)
    client.post("/wears", json={"item_ids": [bought["id"]]})
    client.post("/wears", json={"item_ids": [bought["id"]]})
    row = next(p for p in client.get("/purchases").json()["purchases"] if p["id"] == bought["id"])
    assert row["wears"] == 3
    assert row["cost_per_wear"] == pytest.approx(128 / 3, abs=0.01)


def test_typing_a_wear_count_corrects_the_log_rather_than_stacking_on_it():
    bought = _add()
    client.post("/wears", json={"item_ids": [bought["id"]]})
    client.patch(f"/purchases/{bought['id']}", json={"wears": 10})
    assert closet_store.wear_counts()[bought["id"]] == 10


def test_a_name_we_cannot_read_is_refused_rather_than_guessed():
    res = client.post("/purchases", json={"title": "qqqq", "price": 20})
    assert res.status_code == 422
    assert "can't tell what" in res.json()["detail"]


def test_the_brand_comes_off_the_url_so_nobody_types_it_twice():
    assert closet_store.brand_from_url("https://www.uniqlo.com/us/en/products/E123") == "Uniqlo"
    bought = _add(source_url="https://www.newbalance.com/pd/530")
    assert bought["brand"] == "New Balance"


def test_added_items_change_the_advice_the_duck_gives():
    before = client.post("/score_item", json={"item_id": "sku_991", "now_hour": 14}).json()
    for _ in range(3):
        _add(title="black chelsea boots", price=120, size="8")
    after = client.post("/score_item", json={"item_id": "sku_991", "now_hour": 14}).json()
    assert after["advice"]["numbers"]["similar_owned"] > before["advice"]["numbers"]["similar_owned"]
