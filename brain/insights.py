"""Plain-English facts about how someone shops, read off their own history.

Every line here is a count or a median over data the brain already has. No
model, no jargon: the point is that a person who knows nothing about any of
the machinery can read a sentence and recognise themselves in it.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta

from .catalog import Item
from .history import Purchase
from .market import cost_per_wear

# "Still in the rotation" has to mean something. Two wears is the line: once
# is a trial, twice is a thing you actually use.
USED_THRESHOLD = 2
RECENT_DAYS = 90

_PLURAL = {
    "top": "tops",
    "bottom": "bottoms",
    "dress": "dresses",
    "outer": "jackets",
    "shoes": "pairs of shoes",
    "accessory": "accessories",
}

_KIND_PLURAL = {
    "sneakers": "pairs of sneakers",
    "boots": "pairs of boots",
    "heels": "pairs of heels",
    "jeans": "pairs of jeans",
    "crewneck": "crewnecks",
    "going_out_top": "going-out tops",
    "going_out_dress": "going-out dresses",
    "rain_outer": "rain jackets",
    "athletic": "pieces of gym kit",
    "lounge": "loungewear pieces",
}


def _kind_label(kind: str, count: int) -> str:
    label = _KIND_PLURAL.get(kind, kind.replace("_", " ") + "s")
    return f"{count} {label}"


def _biggest_pile(closet: list[Item]) -> tuple[str, int]:
    counts: dict[str, int] = {}
    for item in closet:
        key = item.kind or item.category
        counts[key] = counts.get(key, 0) + 1
    kind, count = max(counts.items(), key=lambda kv: kv[1])
    return kind, count


def category_counts(closet: list[Item]) -> list[dict]:
    counts: dict[str, int] = {}
    for item in closet:
        counts[item.category] = counts.get(item.category, 0) + 1
    return [
        {"category": c, "label": _PLURAL.get(c, c + "s"), "count": n}
        for c, n in sorted(counts.items(), key=lambda kv: -kv[1])
    ]


def notices(closet: list[Item], wear_counts: dict[str, int], coverage: dict) -> list[dict]:
    """"Puddle noticed..." -- the three things worth saying today.

    Each one is a headline and the evidence for it, because an observation a
    shopper can't check is just an opinion with a duck attached.
    """
    out: list[dict] = []

    piles: dict[str, list[Item]] = {}
    for item in closet:
        piles.setdefault(item.kind or item.category, []).append(item)

    big = max(piles.items(), key=lambda kv: len(kv[1]), default=None)
    if big and len(big[1]) >= 4:
        kind, items = big
        idle = [i for i in items if wear_counts.get(i.id, 0) < USED_THRESHOLD]
        detail = f"You own {len(items)}"
        if idle:
            detail += f", and {len(idle)} barely {'gets' if len(idle) == 1 else 'get'} worn"
        out.append({"title": f"You might not need another {kind.replace('_', ' ')}.", "detail": detail + "."})

    worked = [
        (kind, statistics.mean([wear_counts.get(i.id, 0) for i in items]))
        for kind, items in piles.items()
        if len(items) >= 2
    ]
    if worked:
        kind, avg = max(worked, key=lambda kv: kv[1])
        if avg >= 5:
            label = _KIND_PLURAL.get(kind, kind.replace("_", " ") + "s")
            out.append(
                {
                    "title": f"Your {label} earn their keep.",
                    "detail": f"They average {avg:.0f} wears each — your most-used category.",
                }
            )

    gaps = coverage.get("gaps") or []
    if gaps:
        out.append({"title": f"One gap: {gaps[0].lower()}.", "detail": coverage.get("advice", "")})
    return out[:3]


def summarise(closet: list[Item], wear_counts: dict[str, int], purchases: list[Purchase]) -> dict:
    """The "your shopping" panel: six or so sentences about this person."""
    lines: list[str] = []

    kind, pile = _biggest_pile(closet)
    if pile > 1:
        lines.append(f"You own {_kind_label(kind, pile)}.")

    used = [i for i in closet if wear_counts.get(i.id, 0) >= USED_THRESHOLD]
    if closet:
        share = round(100 * len(used) / len(closet))
        lines.append(f"{share}% of what you own is still in regular rotation.")

    returned = [p.price for p in purchases if p.returned]
    kept = [p.price for p in purchases if not p.returned]
    if len(returned) >= 3 and kept:
        threshold = round(statistics.median(returned))
        lines.append(f"Purchases over ${threshold} are the ones you tend to send back.")

    latest = max((datetime.fromisoformat(p.bought_at) for p in purchases), default=None)
    recent_spend = 0.0
    if latest is not None:
        cutoff = latest - timedelta(days=RECENT_DAYS)
        recent = [p for p in purchases if datetime.fromisoformat(p.bought_at) >= cutoff and not p.returned]
        recent_spend = round(sum(p.price for p in recent), 2)
        lines.append(f"You've spent ${recent_spend:,.0f} on clothes in the last {RECENT_DAYS} days.")

    priced = [(i, cost_per_wear(i.price, wear_counts.get(i.id, 0))) for i in closet]
    worn = [(i, c) for i, c in priced if c is not None]
    best = min(worn, key=lambda ic: ic[1]) if worn else None
    if best:
        lines.append(f"Your best buy is your {best[0].title.lower()} — ${best[1]:.2f} a wear.")

    unworn = [i for i in closet if wear_counts.get(i.id, 0) == 0]
    dead = max(unworn, key=lambda i: i.price, default=None)
    if dead is not None:
        lines.append(f"You've never worn your {dead.title.lower()}, and it cost ${dead.price:,.0f}.")
    else:
        least = min(closet, key=lambda i: wear_counts.get(i.id, 0), default=None)
        if least is not None:
            lines.append(
                f"Your least-used thing is your {least.title.lower()} — "
                f"{wear_counts.get(least.id, 0)} wears."
            )

    return {
        "lines": lines,
        "categories": category_counts(closet),
        "items_owned": len(closet),
        "in_rotation": len(used),
        "spent_recently": recent_spend,
        "recent_days": RECENT_DAYS,
        "best_value": (
            {"title": best[0].title, "cost_per_wear": best[1], "id": best[0].id} if best else None
        ),
        "least_used": (
            {"title": dead.title, "wears": 0, "price": dead.price, "id": dead.id} if dead is not None else None
        ),
        "returned_count": len([p for p in purchases if p.returned]),
        "purchase_count": len(purchases),
    }
