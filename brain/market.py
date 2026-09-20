"""What a thing is worth, in the two ways a shopper cares about.

Nothing here needs a price feed. The shopper's own purchase history already
says what she pays for this kind of thing, so "a good deal" is measured
against her, not against a market she has no access to:

    typical  = median price she has paid for the same kind (then category)
    resale   = purchase price x what the category holds x wear condition
    per wear = price / wears, the number that decides everything else

Resale is an estimate and is labelled as one everywhere it is shown.
"""

from __future__ import annotations

import statistics

from .catalog import Item
from .history import Purchase

# Roughly what secondhand clothing fetches relative to retail when it is in
# good condition. Shoes and outerwear hold value; fast-moving tops do not.
_HOLDS: dict[str, float] = {
    "outer": 0.55,
    "shoes": 0.50,
    "dress": 0.45,
    "bottom": 0.40,
    "top": 0.32,
    "accessory": 0.35,
}
_HOLDS_DEFAULT = 0.35

# Each wear takes a little off; a heavily worn thing bottoms out rather than
# going to zero, because people still buy well-loved coats.
_WEAR_DECAY = 0.015
_CONDITION_FLOOR = 0.45


def resale(item: Item, wears: int) -> float:
    """Estimated secondhand value today."""
    holds = _HOLDS.get(item.category, _HOLDS_DEFAULT)
    condition = max(_CONDITION_FLOOR, 1.0 - _WEAR_DECAY * wears)
    return round(item.price * holds * condition, 2)


def cost_per_wear(price: float, wears: int) -> float | None:
    return round(price / wears, 2) if wears > 0 else None


def typical_price(item: Item, purchases: list[Purchase]) -> tuple[float | None, str]:
    """What she usually pays for this kind of thing, and what that is based on."""
    kind = item.kind or item.category
    same_kind = [p.price for p in purchases if p.kind == kind]
    if len(same_kind) >= 2:
        label = kind.replace("_", " ")
        label = label if label.endswith("s") else label + "s"
        return round(statistics.median(same_kind), 2), f"{len(same_kind)} {label} you've bought"
    same_category = [p.price for p in purchases if p.category == item.category]
    if len(same_category) >= 2:
        return round(statistics.median(same_category), 2), f"{len(same_category)} {item.category}s you've bought"
    return None, ""


def deal(item: Item, purchases: list[Purchase]) -> dict:
    """Is this price good, measured against her own buying?"""
    typical, basis = typical_price(item, purchases)
    if typical is None:
        return {"typical_price": None, "difference": None, "verdict": "no read", "basis": ""}
    difference = round(typical - item.price, 2)
    if difference >= 0.05 * typical:
        verdict = "below what you usually pay"
    elif difference <= -0.05 * typical:
        verdict = "above what you usually pay"
    else:
        verdict = "about what you usually pay"
    return {"typical_price": typical, "difference": difference, "verdict": verdict, "basis": basis}


def valuation(item: Item, wears: int, purchases: list[Purchase]) -> dict:
    """Everything the closet card shows about one thing she owns."""
    worth = resale(item, wears)
    return {
        "paid": round(item.price, 2),
        "worth_now": worth,
        "value_retained": round(worth / item.price, 3) if item.price else 0.0,
        "lost": round(item.price - worth, 2),
        "cost_per_wear": cost_per_wear(item.price, wears),
        "wears": wears,
        **deal(item, purchases),
    }
