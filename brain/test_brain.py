"""Runnable checks: `python test_brain.py`. No pytest required."""
from __future__ import annotations

import app
import portfolio as pf
from miner import build_insights, time_stats
from seed import CLOSET, HISTORY, CANDIDATES


def _cand(cid):
    return next(c for c in CANDIDATES if c["id"] == cid)


def main():
    ok = 0

    sb, w = pf.closet_sharpe(CLOSET)
    assert sb > 0, "closet Sharpe should be positive"
    assert abs(sum(w) - 1.0) < 1e-6, "weights should sum to 1"
    print(f"[ok] closet Style Sharpe = {sb:.3f}")
    ok += 1

    # boots -> return + time patterns, concerned
    boots = build_insights(_cand("cand_boots"), CLOSET, HISTORY, now_hour=23)
    types = {i["type"] for i in boots["insights"]}
    assert "return_pattern" in types, f"boots should flag return_pattern, got {types}"
    assert boots["duck_state"] == "concerned", boots["duck_state"]
    assert boots["speak"] is True
    print(f"[ok] boots -> {sorted(types)} | duck={boots['duck_state']} | \"{boots['insights'][0]['line']}\"")
    ok += 1

    # 4th charcoal crewneck -> redundancy
    crew = build_insights(_cand("cand_crew4"), CLOSET, HISTORY, now_hour=14)
    types = {i["type"] for i in crew["insights"]}
    assert "redundancy" in types, f"crewneck should flag redundancy, got {types}"
    assert len(crew["portfolio"]["redundant_with"]) >= 2
    print(f"[ok] crewneck#4 -> redundancy, dupes={crew['portfolio']['redundant_with']}")
    ok += 1

    # suit -> covers a gap, positive alpha, approving
    suit = build_insights(_cand("cand_suit"), CLOSET, HISTORY, now_hour=14)
    assert suit["portfolio"]["alpha"] > 0, f"suit alpha should be > 0, got {suit['portfolio']['alpha']}"
    assert suit["portfolio"]["covers_gap"], "suit should cover a gap"
    print(f"[ok] suit -> alpha={suit['portfolio']['alpha']} covers '{suit['portfolio']['covers_gap']}' | duck={suit['duck_state']}")
    ok += 1

    # rain shell -> covers rain gap
    rain = build_insights(_cand("cand_rain"), CLOSET, HISTORY, now_hour=14)
    assert rain["portfolio"]["alpha"] > 0, f"rain alpha should be > 0, got {rain['portfolio']['alpha']}"
    print(f"[ok] rain shell -> alpha={rain['portfolio']['alpha']} covers '{rain['portfolio']['covers_gap']}'")
    ok += 1

    # --- P0 regressions -----------------------------------------------------

    # P0-1: the dashboard may not recommend what the duck refuses. The boots
    # have positive alpha, so only the shared miner keeps them out of "buy".
    board = app.portfolio()
    buy_ids = {b["id"] for b in board["rebalance"]["buy"]}
    skip_ids = {s["id"] for s in board["rebalance"]["skip"]}
    assert "cand_boots" not in buy_ids, "dashboard must not recommend the boots the duck refuses"
    assert "cand_boots" in skip_ids, "boots belong in skip, with the duck's reason"
    assert "cand_suit" in buy_ids, "the suit is the demo's green light; it must appear in buy"
    boots_rec = next(s for s in board["rebalance"]["skip"] if s["id"] == "cand_boots")
    assert boots_rec["blocked_by"] == ["return_pattern"], boots_rec["blocked_by"]
    assert boots_rec["alpha"] > 0, "this only proves anything while alpha disagrees"
    print(f"[ok] dashboard agrees with the duck | buy={sorted(buy_ids)} | boots blocked by {boots_rec['blocked_by']}")
    ok += 1

    # P0-2: a late hour must not flip a green light red, or bury it.
    suit_late = build_insights(_cand("cand_suit"), CLOSET, HISTORY, now_hour=23)
    assert suit_late["duck_state"] == "approving", \
        f"suit at 11pm should still approve, got {suit_late['duck_state']}"
    assert suit_late["insights"][0]["type"] == "coverage_gap", \
        f"headline should be the green light, got {suit_late['insights'][0]['type']}"
    boots_late = build_insights(_cand("cand_boots"), CLOSET, HISTORY, now_hour=23)
    assert boots_late["insights"][0]["type"] == "return_pattern", \
        f"strongest insight should lead, got {boots_late['insights'][0]['type']}"
    # timing alone is never enough to interrupt
    ox = build_insights(_cand("cand_oxford"), CLOSET, HISTORY, now_hour=23)
    assert {i["type"] for i in ox["insights"]} == {"time_pattern"}, ox["insights"]
    assert ox["speak"] is False, "the duck must not interrupt on the clock alone"
    print(f"[ok] 11pm demo holds | suit={suit_late['duck_state']} | oxford silent")
    ok += 1

    # P0-3: the late-night rate needs a quiet baseline to be surprising.
    late_rate, base = time_stats(HISTORY, 23)
    assert base <= 0.25, f"lifetime return baseline should be ~18%, got {base:.2f}"
    assert late_rate - base >= 0.5, f"late-vs-baseline gap too small: {late_rate:.2f} vs {base:.2f}"
    print(f"[ok] history contrast | late={late_rate:.0%} vs baseline={base:.0%}")
    ok += 1

    print(f"\nAll {ok} checks passed.")


if __name__ == "__main__":
    main()
