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

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class Wear:
    item_id: str
    state: str
    worn_at: str

    def dict(self) -> dict:
        return asdict(self)


_BOOT_BUYS = [
    ("Leather ankle boots", 135.0, 23, "too narrow"),
    ("Western boots", 148.0, 0, None),
    ("Lug-sole boots", 118.0, 23, "too narrow"),
    ("Heeled ankle boots", 162.0, 22, None),
]

# (title, category, kind, price, size, hour, returned)
_OTHER_BUYS = [
    ("Charcoal crewneck", "top", "crewneck", 58.0, "M", 14, False),
    ("Charcoal crewneck (heavier)", "top", "crewneck", 72.0, "M", 23, False),
    ("Grey crewneck", "top", "crewneck", 45.0, "M", 14, False),
    ("Sequin halter top", "top", "going_out_top", 55.0, "S", 23, False),
    ("Mesh long-sleeve", "top", "going_out_top", 34.0, "S", 1, True),
    ("Corset top", "top", "going_out_top", 48.0, "S", 23, True),
    ("Satin blouse", "top", "top", 62.0, "S", 11, False),
    ("Faux-leather pants", "bottom", "bottom", 78.0, "27", 23, True),
    ("Cargo pants", "bottom", "bottom", 68.0, "27", 15, False),
    ("Straight-leg jeans", "bottom", "bottom", 88.0, "27", 13, False),
    ("Wide-leg trousers", "bottom", "bottom", 92.0, "27", 16, False),
    ("Puffer jacket", "outer", "outer", 140.0, "S", 11, False),
    ("Rain shell", "outer", "rain_outer", 110.0, "S", 16, False),
    ("Wool coat", "outer", "outer", 210.0, "S", 23, True),
    ("White sneakers", "shoes", "sneakers", 85.0, "8", 12, False),
    ("Retro runners", "shoes", "sneakers", 110.0, "8", 13, False),
    ("Strappy heels", "shoes", "heels", 78.0, "8", 22, False),
    ("Black slip dress", "dress", "going_out_dress", 95.0, "S", 21, False),
    ("Floral midi dress", "dress", "dress", 84.0, "S", 23, True),
    ("Linen shirt dress", "dress", "dress", 76.0, "S", 15, False),
    ("Sports bra", "top", "athletic", 34.0, "S", 9, False),
    ("Training tee", "top", "athletic", 26.0, "S", 9, False),
    ("Running shorts", "bottom", "athletic", 28.0, "S", 10, False),
    ("Leggings", "bottom", "athletic", 32.0, "S", 18, False),
    ("Sweatpants", "bottom", "lounge", 45.0, "S", 20, False),
    ("Denim jacket", "outer", "outer", 95.0, "S", 15, False),
    ("Denim mini skirt", "bottom", "bottom", 42.0, "27", 23, True),
    ("Off-shoulder top", "top", "going_out_top", 40.0, "S", 19, False),
    ("Red going-out top", "top", "going_out_top", 38.0, "S", 22, False),
    ("Black satin cami", "top", "going_out_top", 42.0, "S", 20, False),
    ("Cashmere beanie", "accessory", "accessory", 48.0, None, 23, True),
]

# Daytime keepers. Boring on purpose: the late-night return rate is only an
# insight if the rest of the year is unremarkable, and two pairs of size-10
# boots that never came back keep the boots story honest.
_DAYTIME_KEEPERS = [
    ("Hiking boots", "shoes", "boots", 145.0, "10", 15, False),
    ("Duck boots", "shoes", "boots", 120.0, "10", 12, False),
    ("White tee (3-pack)", "top", "top", 32.0, "S", 14, False),
    ("Oxford shirt", "top", "top", 58.0, "S", 11, False),
    ("Merino sweater", "top", "knit", 88.0, "S", 16, False),
    ("Flannel shirt", "top", "top", 54.0, "S", 10, False),
    ("Striped tee", "top", "top", 28.0, "S", 13, False),
    ("Waffle henley", "top", "top", 36.0, "S", 15, False),
    ("Grey hoodie", "top", "lounge", 62.0, "S", 17, False),
    ("Thermal base layer", "top", "athletic", 40.0, "S", 18, False),
    ("Dri-fit tank", "top", "athletic", 24.0, "S", 9, False),
    ("Olive chinos", "bottom", "bottom", 72.0, "27", 11, False),
    ("Corduroys", "bottom", "bottom", 78.0, "27", 17, False),
    ("Track pants", "bottom", "athletic", 48.0, "S", 10, False),
    ("Swim shorts", "bottom", "bottom", 38.0, "S", 16, False),
    ("Bike shorts", "bottom", "athletic", 30.0, "S", 9, False),
    ("Ribbed tank", "top", "top", 22.0, "S", 12, False),
    ("Fleece half-zip", "outer", "outer", 85.0, "S", 16, False),
    ("Quilted vest", "outer", "outer", 98.0, "S", 14, False),
    ("Canvas sneakers", "shoes", "sneakers", 65.0, "8", 14, False),
    ("Running shoes", "shoes", "sneakers", 125.0, "8", 16, False),
    ("Slides", "shoes", "sneakers", 35.0, "8", 10, False),
    ("Wool socks (6-pack)", "accessory", "accessory", 26.0, None, 15, False),
    ("Beanie", "accessory", "accessory", 24.0, None, 13, False),
    ("Leather belt", "accessory", "accessory", 45.0, None, 12, False),
    ("Everyday tote", "accessory", "accessory", 68.0, None, 17, False),
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


def _spread(n: int, rng: random.Random) -> list[datetime]:
    days = sorted(rng.sample(range(0, 420), n))
    return [_START + timedelta(days=d) for d in days]


def purchases() -> list[Purchase]:
    rng = random.Random(SEED)
    rows: list[tuple] = []
    for title, price, hour, reason in _BOOT_BUYS:
        rows.append((title, "shoes", "boots", price, "8", hour, True, reason))
    for title, category, kind, price, size, hour, returned in _OTHER_BUYS + _DAYTIME_KEEPERS:
        rows.append((title, category, kind, price, size, hour, returned, None))

    rng.shuffle(rows)
    dates = _spread(len(rows), rng)
    out: list[Purchase] = []
    for idx, (row, day) in enumerate(zip(rows, dates, strict=True)):
        title, category, kind, price, size, hour, returned, reason = row
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
