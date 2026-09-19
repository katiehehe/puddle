from datetime import datetime

from brain import history
from brain.app import ScoreRequest, portfolio, score_item
from brain.catalog import BY_ID, CLOSET
from brain.miner import Miner, rank, verdict
from brain.portfolio import Closet, payoff
from brain.states import STATES, life_mix, stake_weighted


def _closet() -> Closet:
    return Closet(CLOSET, life_mix([w.dict() for w in history.wears()]))


def test_life_mix_comes_from_wear_events_and_sums_to_one():
    mix = life_mix([w.dict() for w in history.wears()])
    assert abs(sum(mix.values()) - 1.0) < 1e-9
    assert mix["casual_warm"] > mix["formal"]


def test_stake_weighting_lifts_rare_high_cost_states():
    mix = life_mix([w.dict() for w in history.wears()])
    eff = stake_weighted(mix)
    assert eff["formal"] > mix["formal"]
    assert abs(sum(eff.values()) - 1.0) < 1e-9


def test_payoff_punishes_underdressing_more_than_overdressing():
    formal = next(s for s in STATES if s.key == "formal")
    gym = next(s for s in STATES if s.key == "gym")
    hoodie = BY_ID["own_104"]
    blazer = BY_ID["sku_993"]
    assert payoff(hoodie, formal) < payoff(blazer, gym)


def test_covariance_is_symmetric_and_psd():
    c = _closet()
    assert abs(c.sigma - c.sigma.T).max() < 1e-9
    assert min(sorted(__import__("numpy").linalg.eigvalsh(c.sigma))) > -1e-9


def test_optimal_weights_are_a_distribution():
    c = _closet()
    assert abs(c.w.sum() - 1.0) < 1e-6
    assert (c.w >= -1e-9).all()


def test_only_real_gap_is_formal():
    assert [g["state"] for g in _closet().gaps()] == ["formal"]


def test_gap_filler_raises_sharpe_and_duplicate_lowers_it():
    c = _closet()
    blazer = c.evaluate(BY_ID["sku_993"])
    crewneck = c.evaluate(BY_ID["sku_992"])
    assert blazer["style_sharpe_after"] > blazer["style_sharpe_before"]
    assert crewneck["style_sharpe_after"] < crewneck["style_sharpe_before"]
    assert blazer["alpha"] > 0 > crewneck["alpha"]
    assert [d["id"] for d in crewneck["redundant_with"]]


def test_return_pattern_finds_the_planted_boots():
    miner = Miner(history.purchases(), history.wear_counts())
    insight = miner.return_pattern(BY_ID["sku_991"])
    assert insight["stat"] == {
        **insight["stat"],
        "returned": 4,
        "bought": 4,
        "kind": "boots",
    }
    assert "boots" in insight["line"]


def test_time_pattern_only_fires_late():
    miner = Miner(history.purchases(), history.wear_counts())
    assert miner.time_pattern(datetime(2026, 3, 1, 14, 0)) is None
    assert miner.time_pattern(datetime(2026, 3, 1, 23, 40)) is not None


def test_time_pattern_is_dropped_when_nothing_else_is_wrong():
    miner = Miner(history.purchases(), history.wear_counts())
    c = _closet()
    late = miner.time_pattern(datetime(2026, 3, 1, 23, 40))
    gap = miner.coverage_gap(c.evaluate(BY_ID["sku_993"]))
    assert [i["type"] for i in rank([late, gap])] == ["coverage_gap"]


def test_duck_stays_quiet_on_cheap_items():
    _, _, speak = verdict([{"type": "redundancy", "weight": 0.9, "line": "x"}], price=24.0)
    assert speak is False


def test_score_item_contract():
    res = score_item(ScoreRequest(item_id="sku_991", now_hour=23))
    assert set(res) == {
        "item",
        "portfolio",
        "insights",
        "headline",
        "duck_state",
        "confidence",
        "speak",
        "prediction_id",
        "accuracy",
        "decision",
        "reasons",
    }
    assert res["duck_state"] == "concerned"
    assert res["insights"][0]["type"] == "return_pattern"
    assert res["prediction_id"]


def test_blazer_gets_a_green_light():
    res = score_item(ScoreRequest(item_id="sku_993", now_hour=23))
    assert res["duck_state"] == "approving"
    assert res["insights"][0]["type"] == "coverage_gap"


def test_portfolio_view_shape():
    view = portfolio()
    assert view["style_sharpe"] > 0
    assert len(view["holdings"]) == len(CLOSET)
    assert len(view["coverage"]) == 8
    assert view["pond"]["saved"] == 0
    assert "/" in view["ledger"]["accuracy"]
    assert view["rebalance"]["spent"] <= view["rebalance"]["budget"]


def test_storefront_item_dict_from_the_mock_shop_resolves():
    """The mock shop and extension speak their own SKU ids."""
    res = score_item(
        ScoreRequest(
            item={"id": "cand_suit", "title": "Charcoal wool suit", "category": "formal",
                  "formality": 5, "warmth": 3, "price": 320, "q": 0.85},
            now_hour=23,
        )
    )
    assert res["item"]["id"] == "sku_999"
    assert res["duck_state"] == "approving"
