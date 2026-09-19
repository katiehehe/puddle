"""History miner: turns purchase/return history into the duck's reactive insights.

Transparent rules (the explanation IS the product), plus the portfolio signals
from portfolio.py. Emits insights + a confidence that drives the duck's face.
"""
from __future__ import annotations

from portfolio import score_candidate, herfindahl_overexposure


def _fmt_pct(x: float) -> str:
    return f"{round(x * 100)}%"


def return_stats(history: list[dict], category: str, size: str | None):
    same = [h for h in history if h["category"] == category and (size is None or h.get("size") == size)]
    returned = sum(1 for h in same if h["returned"])
    total = len(same)
    rate = returned / total if total else 0.0
    return returned, total, rate


def time_stats(history: list[dict], hour: int, window: int = 2):
    late = [h for h in history if abs(h["hour"] - hour) <= window or abs(h["hour"] - hour) >= 24 - window]
    late_rate = (sum(1 for h in late if h["returned"]) / len(late)) if late else 0.0
    base = (sum(1 for h in history if h["returned"]) / len(history)) if history else 0.0
    return late_rate, base


def build_insights(candidate: dict, closet: list[dict], history: list[dict], now_hour: int = 23):
    insights: list[dict] = []
    confidence = 0.0

    score = score_candidate(candidate, closet)

    # 1) personal return pattern (category + size)
    size = candidate.get("size")
    returned, total, rate = return_stats(history, candidate["category"], size)
    if returned >= 3 and rate >= 0.6:
        total = returned + 1
        n_word = {2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh"}.get(total, f"{total}th")
        sz = f" size-{size}" if size else ""
        insights.append({
            "type": "return_pattern",
            "stat": {"returned": returned, "total": total, "category": candidate["category"], "size": size},
            "line": f"{n_word} pair of{sz} {candidate['category']}. You returned the other {returned}.",
        })
        confidence = max(confidence, 0.9)

    # 2) time-of-day pattern
    late_rate, base = time_stats(history, now_hour)
    if late_rate >= 0.5 and late_rate > base + 0.2:
        insights.append({
            "type": "time_pattern",
            "stat": {"hour": now_hour, "return_rate": round(late_rate, 2), "baseline": round(base, 2)},
            "line": f"It's late \u2014 {_fmt_pct(late_rate)} of what you buy around now gets returned.",
        })
        confidence = max(confidence, 0.7)

    # 3) redundancy (covariance to owned)
    if len(score.redundant_with) >= 2 and score.alpha <= 0.02:
        insights.append({
            "type": "redundancy",
            "stat": {"corr_owned": len(score.redundant_with), "owned_ids": score.redundant_with},
            "line": f"You already own {len(score.redundant_with)} things that cover the same days. This adds nothing new.",
        })
        confidence = max(confidence, 0.75)

    # 4) coverage gap green-light
    if score.covers_gap and score.alpha > 0:
        insights.append({
            "type": "coverage_gap",
            "stat": {"state": score.covers_gap, "alpha": score.alpha},
            "line": f"Buy it \u2014 you've got nothing for '{score.covers_gap}', and this actually covers it.",
        })
        confidence = max(confidence, 0.65)

    # 5) overexposure
    hhi = herfindahl_overexposure(closet)
    if hhi > 0.45 and score.alpha <= 0.02 and not score.covers_gap:
        insights.append({
            "type": "overexposure",
            "stat": {"concentration": round(hhi, 2)},
            "line": "Your closet's already piled into a few occasions. More of the same won't help.",
        })
        confidence = max(confidence, 0.5)

    # duck state
    positive = any(i["type"] == "coverage_gap" for i in insights)
    negative = any(i["type"] in ("return_pattern", "redundancy", "overexposure", "time_pattern") for i in insights)
    if positive and not negative:
        duck_state = "approving"
    elif negative:
        duck_state = "concerned"
    elif insights:
        duck_state = "curious"
    else:
        duck_state = "idle"

    speak = confidence >= 0.6

    return {
        "portfolio": {
            "style_sharpe_before": score.sharpe_before,
            "style_sharpe_after": score.sharpe_after,
            "alpha": score.alpha,
            "beta": score.beta,
            "redundant_with": score.redundant_with,
            "covers_gap": score.covers_gap,
        },
        "insights": insights,
        "duck_state": duck_state,
        "confidence": round(confidence, 2),
        "speak": speak,
    }
