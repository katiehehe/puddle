"""Your own closet and returns, instead of the seeded ones.

Set PUDDLE_WARDROBE to a JSON file and the brain scores that instead. It is
off unless the variable is set, so the seeded demo and the tests are untouched.

You write titles and prices. Everything the engine needs -- category, kind,
formality, warmth, rain -- is inferred from the words (brain/infer.py), and any
field you state explicitly wins. An item whose name means nothing to the
inferrer is reported rather than quietly dropped, because a closet that is
silently missing your coat produces confident, wrong advice.

    {
      "closet": [
        {"title": "Charcoal crewneck", "price": 58, "wears": 22},
        {"title": "Rain shell", "price": 110, "wears": 6, "rain_ok": true}
      ],
      "purchases": [
        {"title": "Suede boots", "price": 128, "size": "8", "hour": 23, "returned": true}
      ]
    }
"""

from __future__ import annotations

import json
import os
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

from .infer import infer

ENV_VAR = "PUDDLE_WARDROBE"
_START = datetime(2025, 7, 5, 12, 0)


class WardrobeError(ValueError):
    """Something in the file cannot be scored. Said out loud, never swallowed."""


def path() -> Path | None:
    raw = os.environ.get(ENV_VAR, "").strip()
    return Path(raw) if raw else None


def _item(row: dict, index: int, prefix: str):
    """Build a catalog Item. Imported lazily: catalog calls into this module
    while it is still initialising, so a top-level import would be circular."""
    from .catalog import Item

    title = str(row.get("title", "")).strip()
    if not title:
        raise WardrobeError(f"{prefix}[{index}] has no title")

    guessed = infer(title, row.get("category")) or {}
    missing = [k for k in ("category", "formality", "warmth") if k not in guessed and k not in row]
    if missing:
        raise WardrobeError(
            f'{prefix}[{index}] "{title}": could not work out {", ".join(missing)}. '
            f"Add them to the entry, or rename it to something like "
            f'"charcoal crewneck" / "rain jacket" / "chelsea boots".'
        )

    def field(name, default=None):
        return row.get(name, guessed.get(name, default))

    price = row.get("price")
    if price is None:
        raise WardrobeError(f'{prefix}[{index}] "{title}" has no price')

    return Item(
        id=row.get("id") or f"{prefix}_{index:03d}",
        title=title,
        category=field("category"),
        price=float(price),
        formality=int(field("formality")),
        warmth=int(field("warmth")),
        rain_ok=bool(field("rain_ok", False)),
        color=row.get("color", ""),
        material=row.get("material", ""),
        size=str(row["size"]) if row.get("size") is not None else None,
        quality=float(row.get("quality", 0.7)),
        kind=field("kind"),
    )


def _purchase(row: dict, index: int) -> dict:
    title = str(row.get("title", "")).strip()
    if not title:
        raise WardrobeError(f"purchases[{index}] has no title")
    guessed = infer(title, row.get("category")) or {}
    category = row.get("category") or guessed.get("category") or "top"
    hour = int(row.get("hour", 14))
    if not 0 <= hour <= 23:
        raise WardrobeError(f'purchases[{index}] "{title}": hour must be 0-23, got {hour}')
    bought = _START + timedelta(days=index * 3, hours=hour - 12)
    return {
        "id": f"buy_{index:03d}",
        "item_id": row.get("item_id"),
        "title": title,
        "category": category,
        "kind": row.get("kind") or guessed.get("kind") or category,
        "price": float(row.get("price", 0)),
        "size": str(row["size"]) if row.get("size") is not None else None,
        "bought_at": bought.isoformat(),
        "hour": hour,
        "returned": bool(row.get("returned", False)),
        "return_reason": row.get("return_reason"),
    }


def _wear_events(closet: list, wears: dict[str, int]) -> list[dict]:
    """Turn per-item wear counts into the events life_mix expects.

    Each wear is attributed to the occasion that item is best for, which is the
    same argmax the concentration measure already uses. That keeps your life mix
    a statement about what you actually wear rather than a table someone typed.
    """
    from .portfolio import payoff
    from .states import STATES

    events: list[dict] = []
    when = _START
    for item in closet:
        best = max(STATES, key=lambda s: payoff(item, s))
        for _ in range(max(0, wears.get(item.id, 0))):
            when += timedelta(hours=7)
            events.append({"item_id": item.id, "state": best.key, "worn_at": when.isoformat()})
    return events


def load() -> dict | None:
    """{'closet', 'purchases', 'wears'} from the file, or None when unset."""
    file = path()
    if file is None:
        return None
    if not file.exists():
        raise WardrobeError(f"{ENV_VAR}={file} but that file does not exist")
    try:
        raw = json.loads(file.read_text())
    except json.JSONDecodeError as exc:
        raise WardrobeError(f"{file} is not valid JSON: {exc}") from exc

    rows = raw.get("closet") or []
    if not rows:
        raise WardrobeError(f"{file} has no 'closet' entries")

    closet = [_item(row, i, "own") for i, row in enumerate(rows)]
    ids = [i.id for i in closet]
    if len(set(ids)) != len(ids):
        raise WardrobeError("two closet entries share an id")

    wears = {item.id: int(row.get("wears", 0)) for item, row in zip(closet, rows, strict=True)}
    if not any(wears.values()):
        raise WardrobeError(
            "every item has 0 wears, so there is no life mix to score against. "
            "Put a rough wear count on the things you actually wear."
        )

    purchases = [_purchase(row, i) for i, row in enumerate(raw.get("purchases") or [])]
    storefront = [_item(row, i, "cand") for i, row in enumerate(raw.get("storefront") or [])]

    return {
        "closet": closet,
        "purchases": purchases,
        "wears": _wear_events(closet, wears),
        "wear_counts": wears,
        "storefront": storefront or None,
        "source": str(file),
    }


def merged_storefront(default: list, custom: list | None) -> list:
    """Your candidates if you listed any, otherwise the seeded ones re-sized to
    match what you own, so the duck still has something to react to."""
    if custom:
        return custom
    return [replace(item) for item in default]
