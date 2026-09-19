"""History miner: turns purchase/return history into typed, cited insights.

Every insight carries the statistic it was derived from. The duck's line is a
rendering of that statistic, never a substitute for it -- if we can't show the
number behind a sentence, we don't say the sentence.
"""

from __future__ import annotations

from datetime import datetime

from .catalog import Item
from .history import Purchase

LATE_HOUR = 23


def _rate(returned: int, total: int) -> float:
    return returned / total if total else 0.0


class Miner:
    def __init__(self, purchases: list[Purchase], wear_counts: dict[str, int]):
        self.purchases = purchases
        self.wear_counts = wear_counts

    # --- aggregates ---------------------------------------------------------
    def baseline_return_rate(self) -> float:
        return _rate(sum(p.returned for p in self.purchases), len(self.purchases))

    def by_kind_size(self, kind: str, size: str | None) -> tuple[int, int]:
        rows = [p for p in self.purchases if p.kind == kind and (size is None or p.size == size)]
        return sum(p.returned for p in rows), len(rows)

    def by_hour_bucket(self, late: bool) -> tuple[int, int]:
        rows = [p for p in self.purchases if (p.hour >= LATE_HOUR or p.hour <= 2) == late]
        return sum(p.returned for p in rows), len(rows)

    def late_night_share_of_returns(self) -> tuple[int, int]:
        returns = [p for p in self.purchases if p.returned]
        late = [p for p in returns if p.hour >= LATE_HOUR or p.hour <= 2]
        return len(late), len(returns)

    # --- insights -----------------------------------------------------------
    def return_pattern(self, item: Item) -> dict | None:
        kind = item.kind or item.category
        returned, total = self.by_kind_size(kind, item.size)
        if total < 3 or returned == 0:
            return None
        rate = _rate(returned, total)
        if rate < 0.5:
            return None
        ordinal = {1: "Second", 2: "Third", 3: "Fourth", 4: "Fifth", 5: "Sixth"}.get(total, f"{total + 1}th")
        noun = "pair" if item.category in ("shoes", "bottom") else "one"
        label = kind.replace("_", " ")
        sized = f"size-{item.size} " if item.size else ""
        count = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}.get(returned, str(returned))
        line = (
            f"{ordinal} {noun} of {sized}{label} you've bought. "
            f"You returned the other {count}."
        )
        return {
            "type": "return_pattern",
            "stat": {
                "returned": returned,
                "bought": total,
                "total": total,
                "kind": kind,
                "category": item.category,
                "size": item.size,
                "rate": round(rate, 3),
                "baseline": round(self.baseline_return_rate(), 3),
            },
            "line": line,
            "weight": min(1.0, 0.45 + 0.5 * rate),
        }

    def time_pattern(self, now: datetime) -> dict | None:
        late = now.hour >= LATE_HOUR or now.hour <= 2
        if not late:
            return None
        share, total_returns = self.late_night_share_of_returns()
        returned, bought = self.by_hour_bucket(late=True)
        if bought < 3 or total_returns == 0:
            return None
        rate = _rate(returned, bought)
        baseline = self.baseline_return_rate()
        if rate <= baseline * 1.3:
            return None
        return {
            "type": "time_pattern",
            "stat": {
                "hour": now.hour,
                "rate": round(rate, 3),
                "return_rate": round(rate, 3),
                "baseline": round(baseline, 3),
                "share_of_returns": round(share / total_returns, 3),
                "bought_late": bought,
            },
            "line": (
                f"It's {now.strftime('%-I:%M%p').lower()} — "
                f"{round(100 * share / total_returns)}% of everything you've returned was bought after 11pm."
            ),
            "weight": min(1.0, 0.35 + 0.6 * (rate - baseline)),
        }

    def redundancy(self, item: Item, evaluation: dict) -> dict | None:
        dupes = evaluation["redundant_with"]
        if not dupes:
            return None
        same_kind = any(d.get("kind") == (item.kind or item.category) for d in dupes)
        # An item that still carries alpha isn't redundant, however it looks.
        if evaluation["alpha"] > 0.1 and len(dupes) < 2 and not same_kind:
            return None
        worn = sum(self.wear_counts.get(d["id"], 0) for d in dupes)
        titles = ", ".join(d["title"] for d in dupes[:2])
        if len(dupes) == 1:
            line = (
                f"You already own {titles.lower()} — it covers the same days, "
                f"and you've worn it {worn} times."
            )
        else:
            line = (
                f"You own {len(dupes)} of these already ({titles}) — "
                f"they cover the same days, and you've worn them {worn} times between them."
            )
        return {
            "type": "redundancy",
            "stat": {
                "owned_similar": len(dupes),
                "corr": dupes[0]["corr"],
                "wears_of_similar": worn,
                "alpha": evaluation["alpha"],
            },
            "line": line,
            "weight": min(1.0, 0.4 + dupes[0]["corr"] * 0.5),
        }

    def coverage_gap(self, evaluation: dict) -> dict | None:
        covers = evaluation["covers_gap"]
        if not covers or evaluation["alpha"] <= 0:
            return None
        return {
            "type": "coverage_gap",
            "stat": {
                "state": covers["label"],
                "state_key": covers["state"],
                "payoff": covers["payoff"],
                "alpha": evaluation["alpha"],
                "sharpe_before": evaluation["style_sharpe_before"],
                "sharpe_after": evaluation["style_sharpe_after"],
            },
            "line": (
                f"Get it. You have nothing for \"{covers['label'].lower()}\" — "
                f"this is the first thing in your closet that would cover it."
            ),
            "weight": -min(1.0, 0.5 + evaluation["alpha"]),  # negative weight = green light
        }

    def overexposure(self, item: Item, concentration: dict, closet: list[Item]) -> dict | None:
        if concentration["top_share"] < 0.16:
            return None
        same = [i for i in closet if i.category == item.category and abs(i.formality - item.formality) <= 1]
        if len(same) < 5 or item.formality < 4:
            return None
        return {
            "type": "overexposure",
            "stat": {
                "top_state": concentration["top_state"],
                "share": concentration["top_share"],
                "hhi": concentration["hhi"],
                "count": len(same),
            },
            "line": (
                f"You already have {len(same)} of these and nothing for an interview. "
                f"You're very concentrated in one occasion."
            ),
            "weight": 0.35,
        }


def rank(insights: list[dict]) -> list[dict]:
    kept = [i for i in insights if i]
    # The late-night pattern is context, not a verdict: it only speaks when
    # something else is already worrying. Otherwise it argues against a
    # purchase the portfolio just endorsed.
    if not any(i["weight"] > 0 for i in kept if i["type"] != "time_pattern"):
        kept = [i for i in kept if i["type"] != "time_pattern"]
    return sorted(kept, key=lambda i: -abs(i["weight"]))


SPEAK_FLOOR = 45.0  # below this the duck stays quiet; nagging is how you get muted


def verdict(insights: list[dict], price: float = 1e9) -> tuple[str, float, bool]:
    """Fold insight weights into a duck face. The number never reaches the user."""
    if not insights:
        return "idle", 0.0, False
    positive = sum(i["weight"] for i in insights if i["weight"] > 0)
    negative = -sum(i["weight"] for i in insights if i["weight"] < 0)
    net = positive - negative
    confidence = max(0.0, min(1.0, abs(net) / 1.6))

    if net <= -0.4:
        state = "approving"
    elif net >= 0.85:
        state = "concerned"
    elif net >= 0.35:
        state = "curious"
    else:
        return "idle", confidence, False

    if price < SPEAK_FLOOR and state != "approving":
        return "curious", confidence, False
    return state, confidence, True
