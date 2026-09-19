"""Runnable checks: `python test_brain.py`. No pytest required."""
from __future__ import annotations

import portfolio as pf
from miner import build_insights
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

    print(f"\nAll {ok} checks passed.")


if __name__ == "__main__":
    main()
