"""Synthetic purchase / return / wear history.

Deterministic. Patterns are planted rather than random so the miner has real
structure to recover, and so the demo is reproducible:

  * every pair of size-8 boots ever bought was returned (4 for 4), while the
    size-10 pairs stuck around -- the pattern is the size, not the category
  * purchases made at/after 23:00 are returned far more often than the baseline
  * most daytime buys are keepers, which is what makes the late-night rate mean
    something: against a mostly-returned history it would just be noise
  * the charcoal crewnecks are worn rarely despite being bought repeatedly
  * wear events are heavily weighted to casual/gym and almost never formal,
    which is what produces the coverage gap the portfolio engine finds
"""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

from .catalog import CLOSET

SEED = 20260919
_START = datetime(2025, 7, 5, 12, 0)


@dataclass
class Purchase:
    id: str
    item_id: str | None
    title: str
    category: str
    kind: str
    price: float
    size: str | None
    bought_at: str  # iso
    hour: int
    returned: bool
    return_reason: str | None
    color: str = ""

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class Wear:
    item_id: str
    state: str
    worn_at: str

    def dict(self) -> dict:
        return asdict(self)


# (title, price, hour, return reason, colour)
_BOOT_BUYS = [
    ("Leather ankle boots", 135.0, 23, "too narrow", "black"),
    ("Western boots", 148.0, 0, None, "brown"),
    ("Lug-sole boots", 118.0, 23, "too narrow", "black"),
    ("Heeled ankle boots", 162.0, 22, None, "black"),
]

# (title, category, kind, price, size, hour, returned, colour)
_OTHER_BUYS = [
    ("Charcoal crewneck", "top", "crewneck", 58.0, "M", 14, False, "charcoal"),
    ("Charcoal crewneck (heavier)", "top", "crewneck", 72.0, "M", 23, False, "charcoal"),
    ("Grey crewneck", "top", "crewneck", 45.0, "M", 14, False, "grey"),
    ("Sequin halter top", "top", "going_out_top", 55.0, "S", 23, False, "silver"),
    ("Mesh long-sleeve", "top", "going_out_top", 34.0, "S", 1, True, "black"),
    ("Corset top", "top", "going_out_top", 48.0, "S", 23, True, "black"),
    ("Satin blouse", "top", "top", 62.0, "S", 11, False, "cream"),
    ("Faux-leather pants", "bottom", "bottom", 78.0, "27", 23, True, "black"),
    ("Cargo pants", "bottom", "bottom", 68.0, "27", 15, False, "olive"),
    ("Straight-leg jeans", "bottom", "bottom", 88.0, "27", 13, False, "indigo"),
    ("Wide-leg trousers", "bottom", "bottom", 92.0, "27", 16, False, "black"),
    ("Puffer jacket", "outer", "outer", 140.0, "S", 11, False, "black"),
    ("Rain shell", "outer", "rain_outer", 110.0, "S", 16, False, "olive"),
    ("Wool coat", "outer", "outer", 210.0, "S", 23, True, "camel"),
    ("White sneakers", "shoes", "sneakers", 85.0, "8", 12, False, "white"),
    ("Retro runners", "shoes", "sneakers", 110.0, "8", 13, False, "white"),
    ("Strappy heels", "shoes", "heels", 78.0, "8", 22, False, "black"),
    ("Black slip dress", "dress", "going_out_dress", 95.0, "S", 21, False, "black"),
    ("Floral midi dress", "dress", "dress", 84.0, "S", 23, True, "pink"),
    ("Linen shirt dress", "dress", "dress", 76.0, "S", 15, False, "white"),
    ("Sports bra", "top", "athletic", 34.0, "S", 9, False, "black"),
    ("Training tee", "top", "athletic", 26.0, "S", 9, False, "white"),
    ("Running shorts", "bottom", "athletic", 28.0, "S", 10, False, "black"),
    ("Leggings", "bottom", "athletic", 32.0, "S", 18, False, "black"),
    ("Sweatpants", "bottom", "lounge", 45.0, "S", 20, False, "grey"),
    ("Denim jacket", "outer", "outer", 95.0, "S", 15, False, "indigo"),
    ("Denim mini skirt", "bottom", "bottom", 42.0, "27", 23, True, "indigo"),
    ("Off-shoulder top", "top", "going_out_top", 40.0, "S", 19, False, "white"),
    ("Red going-out top", "top", "going_out_top", 38.0, "S", 22, False, "red"),
    ("Black satin cami", "top", "going_out_top", 42.0, "S", 20, False, "black"),
    ("Cashmere beanie", "accessory", "accessory", 48.0, None, 23, True, "cream"),
]

# Daytime keepers. Boring on purpose: the late-night return rate is only an
# insight if the rest of the year is unremarkable, and two pairs of size-10
# boots that never came back keep the boots story honest.
_DAYTIME_KEEPERS = [
    ("Hiking boots", "shoes", "boots", 145.0, "10", 15, False, "brown"),
    ("Duck boots", "shoes", "boots", 120.0, "10", 12, False, "brown"),
    ("White tee (3-pack)", "top", "top", 32.0, "S", 14, False, "white"),
    ("Oxford shirt", "top", "top", 58.0, "S", 11, False, "blue"),
    ("Merino sweater", "top", "knit", 88.0, "S", 16, False, "navy"),
    ("Flannel shirt", "top", "top", 54.0, "S", 10, False, "red"),
    ("Striped tee", "top", "top", 28.0, "S", 13, False, "navy"),
    ("Waffle henley", "top", "top", 36.0, "S", 15, False, "cream"),
    ("Grey hoodie", "top", "lounge", 62.0, "S", 17, False, "grey"),
    ("Thermal base layer", "top", "athletic", 40.0, "S", 18, False, "black"),
    ("Dri-fit tank", "top", "athletic", 24.0, "S", 9, False, "grey"),
    ("Olive chinos", "bottom", "bottom", 72.0, "27", 11, False, "olive"),
    ("Corduroys", "bottom", "bottom", 78.0, "27", 17, False, "tan"),
    ("Track pants", "bottom", "athletic", 48.0, "S", 10, False, "navy"),
    ("Swim shorts", "bottom", "bottom", 38.0, "S", 16, False, "blue"),
    ("Bike shorts", "bottom", "athletic", 30.0, "S", 9, False, "black"),
    ("Ribbed tank", "top", "top", 22.0, "S", 12, False, "white"),
    ("Fleece half-zip", "outer", "outer", 85.0, "S", 16, False, "green"),
    ("Quilted vest", "outer", "outer", 98.0, "S", 14, False, "olive"),
    ("Canvas sneakers", "shoes", "sneakers", 65.0, "8", 14, False, "white"),
    ("Running shoes", "shoes", "sneakers", 125.0, "8", 16, False, "blue"),
    ("Slides", "shoes", "sneakers", 35.0, "8", 10, False, "black"),
    ("Wool socks (6-pack)", "accessory", "accessory", 26.0, None, 15, False, "grey"),
    ("Beanie", "accessory", "accessory", 24.0, None, 13, False, "charcoal"),
    ("Leather belt", "accessory", "accessory", 45.0, None, 12, False, "brown"),
    ("Everyday tote", "accessory", "accessory", 68.0, None, 17, False, "tan"),
]

# How often each occasion actually shows up in this person's life. The engine
# never reads these directly -- it reads the wear events generated from them.
_WEAR_MIX = {
    "casual_warm": 62,
    "casual_cold": 48,
    "gym": 34,
    "lounge": 30,
    "night_out": 22,
    "date": 9,
    "formal": 2,
    "rain": 17,
}

_TITLE_TO_ID = {item.title: item.id for item in CLOSET}


_PERSONAL_CACHE: dict | None | str = "unset"


def _personal() -> dict | None:
    """The personal wardrobe, or None when PUDDLE_WARDROBE is not set."""
    global _PERSONAL_CACHE
    if _PERSONAL_CACHE == "unset":
        from .wardrobe import load

        _PERSONAL_CACHE = load()
    return _PERSONAL_CACHE if isinstance(_PERSONAL_CACHE, dict) else None


def _spread(n: int, rng: random.Random) -> list[datetime]:
    days = sorted(rng.sample(range(0, 420), n))
    return [_START + timedelta(days=d) for d in days]


def purchases() -> list[Purchase]:
    personal = _personal()
    if personal is not None:
        return [Purchase(**row) for row in personal["purchases"]]
    rng = random.Random(SEED)
    rows: list[tuple] = []
    for title, price, hour, reason, color in _BOOT_BUYS:
        rows.append((title, "shoes", "boots", price, "8", hour, True, reason, color))
    for title, category, kind, price, size, hour, returned, color in _OTHER_BUYS + _DAYTIME_KEEPERS:
        rows.append((title, category, kind, price, size, hour, returned, None, color))

    rng.shuffle(rows)
    dates = _spread(len(rows), rng)
    out: list[Purchase] = []
    for idx, (row, day) in enumerate(zip(rows, dates, strict=True)):
        title, category, kind, price, size, hour, returned, reason, color = row
        when = day.replace(hour=hour)
        out.append(
            Purchase(
                id=f"buy_{idx:03d}",
                item_id=_TITLE_TO_ID.get(title),
                title=title,
                category=category,
                kind=kind,
                price=price,
                size=size,
                bought_at=when.isoformat(),
                hour=hour,
                returned=returned,
                return_reason=reason,
                color=color,
            )
        )
    return sorted(out, key=lambda p: p.bought_at)


def _eligible(state: str, item) -> bool:
    if state == "gym":
        return item.formality == 1 and item.category in ("top", "bottom", "shoes")
    if state == "lounge":
        return item.formality <= 2
    if state == "night_out":
        return item.formality >= 4
    if state == "date":
        return item.formality >= 3
    if state == "formal":
        return item.formality >= 4
    if state == "rain":
        return item.rain_ok or item.warmth >= 4
    if state == "casual_cold":
        return item.warmth >= 3 and item.formality <= 3
    return item.formality <= 3


def wears() -> list[Wear]:
    personal = _personal()
    if personal is not None:
        return [Wear(**row) for row in personal["wears"]]
    rng = random.Random(SEED + 1)
    out: list[Wear] = []
    for state, count in _WEAR_MIX.items():
        pool = [i for i in CLOSET if _eligible(state, i)]
        if not pool:
            continue
        # quality biases what actually gets reached for
        weights = [i.quality**2 for i in pool]
        for _ in range(count):
            item = rng.choices(pool, weights=weights, k=1)[0]
            day = _START + timedelta(days=rng.randrange(0, 420), hours=rng.randrange(7, 22))
            out.append(Wear(item_id=item.id, state=state, worn_at=day.isoformat()))
    return sorted(out, key=lambda w: w.worn_at)


def wear_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for w in wears():
        counts[w.item_id] = counts.get(w.item_id, 0) + 1
    return counts
