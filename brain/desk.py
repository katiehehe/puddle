"""Pricing a garment the way a desk prices anything: ask, bid, EV, P&L.

The shop quotes an ask. What the shopper should pay is a different number,
and it comes out of her own closet: the wears this item would actually take,
priced at what she already pays per wear, discounted by how often things like
it come back.

    expected_wears = w*_new x wears_logged        (w* from the optimiser)
    fair_value     = expected_wears x her cost per wear
    EV(at ask)     = (1 - p_return)(fair_value - ask) - p_return x FRICTION
    fair_bid       = the ask at which that EV is zero

Nothing here is a new model: the weight is the same allocation the portfolio
engine already solves for, and the return probability is the same statistic
the duck quotes out loud.
"""

from __future__ import annotations

import statistics
from datetime import datetime

from .catalog import Item
from .miner import Miner
from .portfolio import Closet, moments, weights_with_floor

# Sending something back is not free even when the refund is: packaging, the
# trip to the drop-off, the days the money is gone.
FRICTION = 15.0
LATE_HOUR = 23


def _return_prob(item: Item, miner: Miner, now: datetime) -> tuple[float, str]:
    """How often this shopper sends this kind of thing back."""
    kind = item.kind or item.category
    returned, total = miner.by_kind_size(kind, item.size)
    if total >= 3:
        sized = f" in size {item.size}" if item.size else ""
        return returned / total, f"{returned} of {total} {kind.replace('_', ' ')}{sized} went back"
    if now.hour >= LATE_HOUR or now.hour <= 2:
        late_returned, late_bought = miner.by_hour_bucket(late=True)
        if late_bought >= 3:
            return late_returned / late_bought, f"{late_returned} of {late_bought} late-night buys went back"
    base = miner.baseline_return_rate()
    return base, f"your lifetime return rate, {round(100 * base)}%"


def _cost_per_wear(closet: Closet, counts: dict[str, int]) -> float:
    """What a wear currently costs her, across everything she owns."""
    worn = [i.price / counts[i.id] for i in closet.items if counts.get(i.id, 0) > 0]
    return round(statistics.median(worn), 2) if worn else 0.0


def quote(item: Item, closet: Closet, miner: Miner, counts: dict[str, int], now: datetime) -> dict:
    """Two-sided market in one garment: what it's offered at, what it's worth."""
    ask = float(item.price)

    # The optimiser's post-buy weight is literally "share of wears", so the
    # wear budget she has already demonstrated splits along it.
    after = closet.items + [item]
    mu_a, sigma_a = moments(after, closet.mix)
    floor = 1.0 / len(after)
    w = weights_with_floor(mu_a, sigma_a, len(after) - 1, floor)
    share = float(w[-1])
    logged = sum(counts.get(i.id, 0) for i in closet.items)
    expected_wears = round(share * logged, 1)

    cpw = _cost_per_wear(closet, counts)
    fair_value = round(expected_wears * cpw, 2)

    p_return, evidence = _return_prob(item, miner, now)
    p_return = round(min(p_return, 0.9), 3)
    ev = round((1 - p_return) * (fair_value - ask) - p_return * FRICTION, 2)
    break_even = fair_value - (p_return * FRICTION) / max(1 - p_return, 0.05)
    fair_bid = round(max(0.0, break_even), 2)

    evaluation = closet.evaluate(item)
    dupes = evaluation["redundant_with"]
    units = len(dupes)

    return {
        "item": item.dict(),
        "ask": round(ask, 2),
        "fair_bid": fair_bid,
        # When the return friction alone outweighs the wears, there is no price
        # at which this is worth owning -- not a rounding artefact, an answer.
        "no_price": break_even <= 0,
        "fair_value": fair_value,
        "expected_wears": expected_wears,
        "wear_share": round(share, 4),
        "wears_logged": logged,
        "your_cost_per_wear": cpw,
        "cost_per_wear_if_bought": round(ask / expected_wears, 2) if expected_wears > 0 else None,
        "return_prob": p_return,
        "return_evidence": evidence,
        "friction": FRICTION,
        "ev": ev,
        # Skipping is the other side of the same trade.
        "ev_if_skipped": round(-ev, 2),
        "units_held": units,
        "units": [{"id": d["id"], "title": d["title"], "wears": counts.get(d["id"], 0)} for d in dupes],
        "unit_wears": sum(counts.get(d["id"], 0) for d in dupes),
        "alpha": evaluation["alpha"],
        "covers_gap": evaluation["covers_gap"],
    }
