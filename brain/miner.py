"""History miner: turns purchase/return history into the duck's reactive insights.

Transparent rules (the explanation IS the product), plus the portfolio signals
from portfolio.py. Emits insights + a confidence that drives the duck's face.
"""
from __future__ import annotations

import re

from portfolio import score_candidate, herfindahl_overexposure

# A HARD negative is a reason not to buy *this item*. A SOFT negative is context
# about *when* you're buying it -- true, but it must never outrank the
# item-specific verdict or flip a green light red. Without this split, every
# item scored after 9pm came back "concerned", including the ones the duck is
# supposed to approve.
HARD_NEGATIVE = ("return_pattern", "redundancy", "overexposure")
SOFT_NEGATIVE = ("time_pattern",)
POSITIVE = ("coverage_gap",)

# Things that come in pairs read "Fifth pair of boots"; everything else reads
# "Fifth charcoal crewneck".
PAIRED = ("boots", "shoes", "sneakers", "jeans", "pants", "trousers", "shorts")

_ORDINALS = {2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth",
             7: "Seventh", 8: "Eighth", 9: "Ninth", 10: "Tenth"}


def _fmt_pct(x: float) -> str:
    return f"{round(x * 100)}%"


def _ordinal(n: int) -> str:
    return _ORDINALS.get(n, f"{n}th")


def _noun(candidate: dict) -> str:
    """What to call the thing in the duck's line. Drops catalog-only suffixes
    so "Charcoal crewneck (new)" reads as "charcoal crewneck"."""
    cat = candidate.get("category", "item")
    title = re.sub(r"\s*\([^)]*\)\s*$", "", (candidate.get("title") or "")).strip()
    return title.lower() if title else cat


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


def _aligned(insight_type: str, verdict: str) -> bool:
    """Does this insight support the call the duck is actually making?"""
    if verdict == "approving":
        return insight_type in POSITIVE
    if verdict == "concerned":
        return insight_type in HARD_NEGATIVE
    return True


def build_insights(candidate: dict, closet: list[dict], history: list[dict], now_hour: int = 23):
    insights: list[dict] = []

    score = score_candidate(candidate, closet)

    # 1) personal return pattern (category + size)
    size = candidate.get("size")
    returned, _total, rate = return_stats(history, candidate["category"], size)
    if returned >= 3 and rate >= 0.6:
        nth = _ordinal(returned + 1)          # this one would be the next
        sz = f"size-{size} " if size else ""
        cat = candidate.get("category", "item")
        subject = f"pair of {sz}{cat}" if cat in PAIRED else f"{sz}{_noun(candidate)}"
        insights.append({
            "type": "return_pattern",
            "confidence": 0.9,
            "stat": {"returned": returned, "total": returned + 1,
                     "category": cat, "size": size},
            "line": f"{nth} {subject}. You returned the other {returned}.",
        })

    # 2) time-of-day pattern -- only interesting against the daytime baseline
    late_rate, base = time_stats(history, now_hour)
    if late_rate >= 0.5 and late_rate > base + 0.2:
        insights.append({
            "type": "time_pattern",
            "confidence": 0.7,
            "stat": {"hour": now_hour, "return_rate": round(late_rate, 2), "baseline": round(base, 2)},
            "line": (f"It's late — {_fmt_pct(late_rate)} of what you buy this late "
                     f"comes back, against {_fmt_pct(base)} the rest of the day."),
        })

    # 3) redundancy (covariance to owned)
    if len(score.redundant_with) >= 2 and score.alpha <= 0.02:
        n = len(score.redundant_with)
        insights.append({
            "type": "redundancy",
            "confidence": 0.75,
            "stat": {"corr_owned": n, "owned_ids": score.redundant_with},
            "line": (f"{_ordinal(n + 1)} {_noun(candidate)} \u2014 you own {n} already, "
                     f"and they cover the same days."),
        })

    # 4) coverage gap green-light
    if score.covers_gap and score.alpha > 0:
        insights.append({
            "type": "coverage_gap",
            "confidence": 0.65,
            "stat": {"state": score.covers_gap, "alpha": score.alpha},
            "line": f"Buy it — you've got nothing for '{score.covers_gap}', and this actually covers it.",
        })

    # 5) overexposure
    hhi = herfindahl_overexposure(closet)
    if hhi > 0.45 and score.alpha <= 0.02 and not score.covers_gap:
        insights.append({
            "type": "overexposure",
            "confidence": 0.5,
            "stat": {"concentration": round(hhi, 2)},
            "line": "Your closet's already piled into a few occasions. More of the same won't help.",
        })

    # ---- verdict -----------------------------------------------------------
    has_positive = any(i["type"] in POSITIVE for i in insights)
    has_hard = any(i["type"] in HARD_NEGATIVE for i in insights)
    has_soft = any(i["type"] in SOFT_NEGATIVE for i in insights)

    if has_hard:
        duck_state = "concerned"
    elif has_positive:
        duck_state = "approving"
    elif has_soft or insights:
        duck_state = "curious"
    else:
        duck_state = "idle"

    # Headline = the strongest insight that *supports the call being made*, not
    # whichever rule happened to run first. Both surfaces read insights[0].
    insights.sort(key=lambda i: (_aligned(i["type"], duck_state), i["confidence"]), reverse=True)

    confidence = insights[0]["confidence"] if insights else 0.0
    # Never interrupt on timing alone -- that's how the duck gets annoying.
    speak = confidence >= 0.6 and (has_hard or has_positive)

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
