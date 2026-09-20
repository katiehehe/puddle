"""One trustworthy picture of the closet, gathered for anything that gives advice.

Every number here is one the brain already computes for the dashboard or the
duck: wears, cost per wear, resale, occasion coverage, gaps, duplicates,
returns, the pond and the prediction ledger. The chat layer reasons over this
and nothing else, so an answer can only ever cite what is actually true.
"""

from __future__ import annotations

from fastapi import APIRouter

from . import closet_store, insights, ledger, market, pond
from .catalog import Item
from .miner import Miner
from .portfolio import Closet
from .states import STATES

router = APIRouter(tags=["facts"])

# Above this the model starts skimming; the closet is small enough today.
MAX_ITEMS = 80


def _label(key: str) -> str:
    return next((s.label for s in STATES if s.key == key), key)


def _covers(closet: Closet, item: Item) -> list[str]:
    return [s.label for s in STATES if any(i.id == item.id for i, _ in closet.serving(s.key))]


def closet_facts(closet: Closet, miner: Miner, counts: dict[str, int]) -> dict:
    """Everything an adviser may say about this shopper, as plain data."""
    items = closet.items
    brands = {
        row["id"]: (row.get("brand") or "").strip()
        for row in closet_store.rows()
        if row.get("in_closet") and not row.get("archived")
    }
    wears = lambda i: counts.get(i.id, 0)  # noqa: E731

    rows = []
    for item in sorted(items, key=lambda i: -i.price)[:MAX_ITEMS]:
        n = wears(item)
        cpw = market.cost_per_wear(item.price, n)
        rows.append(
            {
                "title": item.title,
                "kind": (item.kind or item.category).replace("_", " "),
                "category": item.category,
                "brand": brands.get(item.id) or None,
                "color": item.color,
                "material": item.material,
                "size": item.size,
                "price": round(item.price, 2),
                "wears": n,
                "cost_per_wear": None if cpw is None else round(cpw, 2),
                "resale_now": round(market.resale(item, n)),
                "good_for": _covers(closet, item),
            }
        )

    piles: dict[str, list[Item]] = {}
    for item in items:
        piles.setdefault((item.kind or item.category).replace("_", " "), []).append(item)
    duplicates = sorted(
        (
            {"kind": k, "count": len(v), "titles": [i.title for i in v], "wears": sum(wears(i) for i in v)}
            for k, v in piles.items()
            if len(v) > 1
        ),
        key=lambda d: -d["count"],
    )

    coverage = [
        {
            "occasion": c["label"],
            "how_often": round(c["p"], 3),
            "covered": c["covered"],
            "options": len(closet.serving(c["state"])),
        }
        for c in closet.coverage()
    ]
    concentration = closet.concentration()
    unworn = sorted([i for i in items if wears(i) == 0], key=lambda i: -i.price)
    safe = set(closet.donatable())
    purchases = miner.purchases
    returned = [p for p in purchases if p.returned]
    late_returned, late_bought = miner.by_hour_bucket(late=True)
    day_returned, day_bought = miner.by_hour_bucket(late=False)
    summary = insights.summarise(items, counts, purchases)
    spent = round(sum(i.price for i in items))
    worth = round(sum(market.resale(i, wears(i)) for i in items))

    return {
        "items": rows,
        "totals": {
            "things_owned": len(items),
            "spent_on_them": spent,
            "worth_today": worth,
            "spent_recently": summary["spent_recently"],
            "recent_days": summary["recent_days"],
            "in_regular_rotation_pct": next(
                (int(line.split("%")[0]) for line in summary["lines"] if "%" in line), None
            ),
        },
        "coverage": coverage,
        "gaps": [_label(g["state"]) for g in closet.gaps()],
        "concentration": {
            "top_occasion": concentration["top_label"],
            "share": round(concentration["top_share"], 3),
            "count": concentration["top_count"],
        },
        "duplicates": duplicates,
        "never_worn": [i.title for i in unworn],
        "never_worn_value": round(sum(i.price for i in unworn)),
        "safe_to_let_go": [i.title for i in unworn if i.id in safe],
        "shopping": {
            "bought": len(purchases),
            "returned": len(returned),
            "return_rate": round(miner.baseline_return_rate(), 3),
            "late_night_bought": late_bought,
            "late_night_returned": late_returned,
            "daytime_bought": day_bought,
            "daytime_returned": day_returned,
        },
        "pond": pond.state(),
        "track_record": ledger.accuracy(),
        "observations": summary["lines"],
    }


@router.get("/facts")
def facts() -> dict:
    from .app import _context

    closet, miner, counts = _context()
    return closet_facts(closet, miner, counts)
