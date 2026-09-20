from datetime import datetime

from brain import desk, history
from brain.app import desk_quote
from brain.catalog import BY_ID, CLOSET
from brain.miner import Miner
from brain.portfolio import Closet
from brain.states import life_mix


def _context():
    mix = life_mix([w.dict() for w in history.wears()])
    counts = history.wear_counts()
    return Closet(CLOSET, mix), Miner(history.purchases(), counts), counts


def _quote(item_id: str, hour: int = 23):
    closet, miner, counts = _context()
    now = datetime.now().replace(hour=hour, minute=40)
    return desk.quote(BY_ID[item_id], closet, miner, counts, now)


def test_fair_value_is_expected_wears_at_her_own_cost_per_wear():
    q = _quote("sku_991")
    assert q["fair_value"] == round(q["expected_wears"] * q["your_cost_per_wear"], 2)
    assert q["wears_logged"] > 0


def test_the_fair_bid_is_the_price_that_breaks_even():
    q = _quote("sku_999")
    assert not q["no_price"]
    p, friction = q["return_prob"], q["friction"]
    ev_at_bid = (1 - p) * (q["fair_value"] - q["fair_bid"]) - p * friction
    assert abs(ev_at_bid) < 0.05


def test_an_item_returned_every_time_has_no_price_worth_paying():
    q = _quote("sku_991")
    assert q["no_price"]
    assert q["fair_bid"] == 0.0


def test_skipping_is_the_other_side_of_buying():
    q = _quote("sku_991")
    assert q["ev_if_skipped"] == -q["ev"]


def test_the_repeatedly_returned_item_is_not_worth_its_ask():
    q = _quote("sku_991")  # size-8 boots, returned 4 of 4
    assert q["return_prob"] >= 0.5
    assert q["fair_bid"] < q["ask"]
    assert q["ev"] < 0


def test_the_item_that_covers_a_gap_carries_alpha_and_a_bid():
    q = _quote("sku_999")  # the suit, nothing formal owned
    assert q["units_held"] == 0
    assert q["alpha"] > 0
    assert q["fair_bid"] > 0


def test_endpoint_rejects_an_unknown_item_and_a_bad_hour():
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as unknown:
        desk_quote("nope")
    assert unknown.value.status_code == 404

    with pytest.raises(HTTPException) as hour:
        desk_quote("sku_991", now_hour=99)
    assert hour.value.status_code == 422
