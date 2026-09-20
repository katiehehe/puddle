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


def test_baseline_is_low_enough_for_the_late_signal_to_mean_something():
    miner = Miner(history.purchases(), history.wear_counts())
    baseline = miner.baseline_return_rate()
    assert baseline < 0.25  # PRD 7 assumes ~18%
    returned_late, bought_late = miner.by_hour_bucket(late=True)
    assert returned_late / bought_late > 3 * baseline


def test_size10_boots_are_not_part_of_the_graveyard():
    miner = Miner(history.purchases(), history.wear_counts())
    assert miner.by_kind_size("boots", "10") == (0, 2)
    assert miner.by_kind_size("boots", "8") == (4, 4)


def test_portfolio_ranks_marginal_sharpe_per_dollar_under_budget():
    view = portfolio()
    assert [b["id"] for b in view["rebalance"]["buy"]] == ["sku_999", "sku_993"]
    assert view["rebalance"]["spent"] == 485
    tight = portfolio(budget=200)
    assert [b["id"] for b in tight["rebalance"]["buy"]] == ["sku_993"]


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
        "shopping",
        "advice",
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


# --- insight-rule regressions (P1-1 / P1-2 / P1-3) --------------------------


def test_overexposure_actually_fires_somewhere_in_the_storefront():
    """It used to be unreachable: the gate keyed on the candidate's own
    category and formality, which never lined up with where the concentration
    was. A rule that can never fire is a rule we do not have."""
    from brain.catalog import STOREFRONT

    closet = _closet()
    miner = Miner(history.purchases(), history.wear_counts())
    fired = [
        it.title
        for it in STOREFRONT
        if miner.overexposure(closet.concentration(), closet.evaluate(it), closet.gaps())
    ]
    assert fired, "overexposure never fires -- one of five insight types is dead code"


def test_overexposure_names_the_crowded_occasion_and_the_empty_one():
    from brain.catalog import STOREFRONT

    closet = _closet()
    miner = Miner(history.purchases(), history.wear_counts())
    conc = closet.concentration()
    hit = next(
        o
        for it in STOREFRONT
        if (o := miner.overexposure(conc, closet.evaluate(it), closet.gaps()))
    )
    assert hit["stat"]["top_state"] == conc["top_state"]
    assert hit["stat"]["uncovered"] in {g["state"] for g in closet.gaps()}
    assert hit["stat"]["count"] >= 4


def test_overexposure_stays_quiet_for_something_that_closes_a_gap():
    """More-of-the-same is the claim; an item covering an unserved occasion
    is the opposite of that, however much it duplicates."""
    from brain.catalog import STOREFRONT

    closet = _closet()
    miner = Miner(history.purchases(), history.wear_counts())
    candidate = next(it for it in STOREFRONT if closet.evaluate(it)["covers_gap"])
    ev = closet.evaluate(candidate)
    assert ev["covers_gap"], "fixture no longer covers a gap; pick another candidate"
    assert miner.overexposure(closet.concentration(), ev, closet.gaps()) is None


def test_rain_layer_and_warm_layer_are_not_called_duplicates():
    """A rain shell and a puffer trace near-identical payoff curves and are
    still not substitutes: they protect against different things."""
    closet = _closet()
    puffer = next(i for i in CLOSET if i.title == "Puffer jacket")
    shell = next(i for i in CLOSET if i.title == "Rain shell")
    assert puffer.rain_ok != shell.rain_ok, "fixture changed; this test is meaningless now"
    dupes = {d["id"] for d in closet.evaluate(puffer)["redundant_with"]}
    assert shell.id not in dupes
    dupes = {d["id"] for d in closet.evaluate(shell)["redundant_with"]}
    assert puffer.id not in dupes


def test_genuine_duplicates_are_still_caught():
    """The guard above must not buy its correctness by going blind."""
    closet = _closet()
    crew = next(i for i in CLOSET if i.title == "Charcoal crewneck")
    dupes = {d["title"] for d in closet.evaluate(crew)["redundant_with"] if d["id"] != crew.id}
    assert len(dupes) >= 2, f"real crewneck duplicates went missing: {dupes}"


def test_donate_never_recommends_the_only_thing_serving_an_occasion():
    """Lowest expected payoff is the wrong test alone: a rare-occasion item is
    rarely worn *because* the occasion is rare. Donating it opens the gap the
    radar then paints red."""
    from brain.portfolio import COVERED

    closet = _closet()
    safe = set(closet.donatable())
    covered_before = {c["state"]: c for c in closet.coverage() if c["covered"]}
    mix = life_mix([w.dict() for w in history.wears()])
    for item in CLOSET:
        if item.id not in safe:
            continue
        after = Closet([i for i in CLOSET if i.id != item.id], mix)
        for c in after.coverage():
            if c["state"] in covered_before:
                assert c["best"] >= COVERED, (
                    f"donating {item.title} drops {c['label']} to {c['best']}"
                )


def test_portfolio_donate_panel_is_coverage_safe():
    board = portfolio()
    closet = _closet()
    safe = set(closet.donatable())
    for d in board["rebalance"]["donate"]:
        assert d["id"] in safe, f"dashboard suggests donating {d['title']}, which opens a gap"


def test_seeded_catalog_declares_a_real_kind():
    """Item.kind falls back to category for scraped items, which is fine for
    something pulled off a page but wrong for a seed: substitutability keys on
    kind, so a blank one quietly makes an item interchangeable with everything
    else in its category."""
    from brain.catalog import STOREFRONT

    lazy = [i.title for i in list(CLOSET) + list(STOREFRONT) if i.kind == i.category]
    assert not lazy, f"seeded items leaning on the category fallback: {lazy}"


def test_different_garments_in_one_category_are_not_substitutes():
    """A sports bra and a ribbed tank are both 'top' and both minimal and warm-
    weather, so payoff correlation cannot separate them. Kind can."""
    closet = _closet()
    from brain.catalog import STOREFRONT

    tank = next(i for i in STOREFRONT if i.title == "Ribbed tank")
    bra = next(i for i in CLOSET if i.title == "Sports bra")
    assert tank.category == bra.category, "fixture changed; this test is meaningless now"
    assert tank.kind != bra.kind
    dupes = {d["id"] for d in closet.evaluate(tank)["redundant_with"]}
    assert bra.id not in dupes


def test_every_flagged_duplicate_pair_shares_a_kind():
    """The whole closet at once, so a future catalog edit that reintroduces a
    cross-garment pair fails here rather than on stage."""
    closet = _closet()
    by_id = {i.id: i for i in closet.items}
    for item in closet.items:
        for d in closet.evaluate(item)["redundant_with"]:
            if d["id"] == item.id:
                continue
            other = by_id[d["id"]]
            assert other.kind == item.kind, (
                f"{item.title} ({item.kind}) flagged as a duplicate of "
                f"{other.title} ({other.kind})"
            )
