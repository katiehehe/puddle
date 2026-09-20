"""The verdict, and the plain-language layer over the occasion machinery."""

from fastapi.testclient import TestClient

from brain import history, occasions
from brain.app import app
from brain.catalog import CLOSET
from brain.portfolio import Closet
from brain.states import life_mix

client = TestClient(app)


def _closet():
    return Closet(CLOSET, life_mix([w.dict() for w in history.wears()]))


def _advice(item_id, hour=14):
    return client.post("/score_item", json={"item_id": item_id, "now_hour": hour}).json()["advice"]


def test_the_verdict_is_one_of_three_sentences_a_person_would_say():
    verdicts = {_advice(i)["verdict"] for i in ("sku_991", "sku_992", "sku_999")}
    assert verdicts <= {"Probably worth it", "Maybe, think about it", "Probably skip"}


def test_a_fifth_crewneck_is_argued_against_by_the_ones_already_owned():
    advice = _advice("sku_992")
    assert advice["stance"] in ("against", "think")
    assert any(r["kind"] == "duplicates" for r in advice["reasons"])


def test_the_thing_that_fills_a_gap_is_argued_for():
    advice = _advice("sku_999")
    assert any(r["kind"] == "gap" for r in advice["reasons"])


def test_every_reason_is_a_sentence_with_no_jargon_in_it():
    text = " ".join(r["text"] for r in _advice("sku_991")["reasons"]).lower()
    for word in ("sharpe", "alpha", "beta", "expected value", "covariance", "state probability"):
        assert word not in text


def test_the_numbers_are_kept_but_behind_the_advice():
    numbers = _advice("sku_991")["numbers"]
    assert {"ev", "alpha", "resale", "cost_per_wear_if_bought"} <= set(numbers)


def test_cost_per_wear_is_offered_at_the_wear_counts_people_imagine():
    per_wear = _advice("sku_991")["per_wear"]
    assert sorted(int(k) for k in per_wear) == [5, 10, 20, 50]
    assert per_wear["5"] > per_wear["50"]


def test_coverage_says_what_is_thin_in_words():
    cover = occasions.coverage(_closet())
    assert "light on" in cover["headline"] or "covers every" in cover["headline"]
    assert "Interview / formal" in cover["gaps"] + cover["well_covered"]
    assert cover["advice"]


def test_how_you_dress_is_shares_of_recorded_wear_with_human_labels():
    usage = occasions.usage([w.dict() for w in history.wears()])
    assert usage["enough_data"] is True
    assert abs(sum(r["share"] for r in usage["rows"]) - 1.0) < 0.01
    assert {"Everyday", "Interview / formal"} <= {r["label"] for r in usage["rows"]}


def test_thin_wear_data_is_admitted_rather_than_dressed_up_as_a_percentage():
    usage = occasions.usage([{"item_id": "own_101", "state": "casual_warm", "worn_at": "2026-01-01"}])
    assert usage["enough_data"] is False
    assert "rough sketch" in usage["lines"][0]
