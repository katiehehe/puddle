"""Consumer-facing valuation: is it a good price, what is it worth now."""

from fastapi.testclient import TestClient

from brain import history, insights, market
from brain.app import app
from brain.catalog import CLOSET, STOREFRONT

client = TestClient(app)
PURCHASES = history.purchases()
COUNTS = history.wear_counts()


def _item(item_id):
    return next(i for i in CLOSET + STOREFRONT if i.id == item_id)


def test_resale_falls_with_wear_but_never_to_nothing():
    coat = _item("own_130")
    assert market.resale(coat, 0) > market.resale(coat, 40) > 0.1 * coat.price


def test_a_price_is_judged_against_what_she_has_paid_before():
    boots = _item("sku_991")
    d = market.deal(boots, PURCHASES)
    assert d["typical_price"] > boots.price
    assert d["verdict"] == "below what you usually pay"
    assert "boots you've bought" in d["basis"]


def test_an_unusually_expensive_item_reads_as_expensive():
    suit = _item("sku_999")
    assert market.deal(suit, PURCHASES)["verdict"] == "above what you usually pay"


def test_cost_per_wear_is_undefined_rather_than_infinite_when_unworn():
    assert market.cost_per_wear(78.0, 0) is None
    assert market.cost_per_wear(78.0, 2) == 39.0


def test_the_shopping_summary_speaks_in_sentences_a_shopper_recognises():
    summary = insights.summarise(CLOSET, COUNTS, PURCHASES)
    assert len(summary["lines"]) >= 4
    assert all(line.endswith(".") for line in summary["lines"])
    assert summary["best_value"]["cost_per_wear"] > 0
    assert summary["items_owned"] == len(CLOSET)
    assert 0 < summary["in_rotation"] <= summary["items_owned"]


def test_categories_are_counted_for_the_closet_shelves():
    counts = {c["category"]: c["count"] for c in insights.category_counts(CLOSET)}
    assert counts["top"] == len([i for i in CLOSET if i.category == "top"])


def test_me_returns_the_closet_purchases_and_value_the_dashboard_needs():
    body = client.get("/me").json()
    assert len(body["closet"]) == len(CLOSET)
    first = body["closet"][0]
    assert {"paid", "worth_now", "value_retained", "cost_per_wear", "duplicates"} <= set(first)
    assert body["value"]["worth_now"] < body["value"]["spent"]
    assert body["purchases"], "recent purchases drive the purchases panel"
    assert body["shopping"]["lines"]


def test_score_item_carries_the_checkout_facts_in_plain_terms():
    body = client.post("/score_item", json={"item_id": "sku_992", "now_hour": 23}).json()
    shopping = body["shopping"]
    assert shopping["owned_count"] >= 2
    assert shopping["closest"]["wears"] > 0
    assert shopping["per_wear_at"]["20"] < shopping["per_wear_at"]["5"]
    assert shopping["verdict"] in (
        "below what you usually pay",
        "about what you usually pay",
        "above what you usually pay",
        "no read",
    )
