"""What the user typed in: their own purchases, and every wear they logged.

The seeded history is a demo. This is the part that makes Puddle theirs --
anything added here joins the closet the engine scores against, so the ninth
sweatshirt is genuinely the ninth and the advice changes accordingly.

Two tables, both in the same SQLite file as the rest of the demo state:

    wardrobe  one row per purchase, whether or not it is still owned
    wear_log  one row per "wore it today", so counts are events, not a field

Wears are stored as events rather than a number because everything downstream
-- the life mix, the coverage map, cost per wear -- is computed from events,
and a number would have to be reconciled with them forever.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone

from .catalog import Item
from .history import Purchase
from .infer import infer
from .portfolio import payoff
from .states import STATES
from .storage import connect

# Brands worth recognising by hostname. Anything else is title-cased from the
# domain, which is right far more often than it is wrong.
_BRANDS = {
    "uniqlo": "Uniqlo",
    "zara": "Zara",
    "hm": "H&M",
    "nike": "Nike",
    "newbalance": "New Balance",
    "adidas": "Adidas",
    "aritzia": "Aritzia",
    "everlane": "Everlane",
    "madewell": "Madewell",
    "lululemon": "Lululemon",
    "patagonia": "Patagonia",
    "arcteryx": "Arc'teryx",
    "cos": "COS",
    "gap": "Gap",
    "jcrew": "J.Crew",
    "doc martens": "Dr. Martens",
    "drmartens": "Dr. Martens",
}

_QUALITY = 0.7  # nothing to rate a new item on yet; the seeded closet's middle


class Unknown(ValueError):
    """The name doesn't describe a garment we can score. Said, never guessed."""


def _schema(db) -> None:
    db.executescript("""
        CREATE TABLE IF NOT EXISTS wardrobe (
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS wear_log (
            id TEXT PRIMARY KEY, item_id TEXT NOT NULL, worn_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS wear_log_item ON wear_log(item_id);
    """)


def brand_from_url(url: str) -> str:
    """"https://www.uniqlo.com/us/en/products/..." -> "Uniqlo"."""
    if not url:
        return ""
    host = url.split("//")[-1].split("/")[0].lower()
    host = host.removeprefix("www.").removeprefix("shop.")
    stem = host.split(".")[0]
    if stem in _BRANDS:
        return _BRANDS[stem]
    return stem.replace("-", " ").title() if stem else ""


def guess(title: str, url: str = "", category: str | None = None) -> dict:
    """Everything we can work out without asking the user another question."""
    attrs = infer(title, category)
    out: dict = {"brand": brand_from_url(url), "recognised": attrs is not None}
    if attrs:
        out.update(
            category=attrs["category"],
            kind=attrs["kind"],
            formality=attrs["formality"],
            warmth=attrs["warmth"],
            rain_ok=attrs["rain_ok"],
        )
    return out


def add(row: dict) -> dict:
    """Record a purchase. Raises Unknown when the name means nothing to us."""
    title = str(row.get("title", "")).strip()
    if not title:
        raise Unknown("Give it a name first.")
    attrs = infer(title, row.get("category") or None)
    if attrs is None:
        raise Unknown(
            f"I can't tell what \"{title}\" is. Try something like \"black chelsea boots\" "
            "or \"grey wool sweater\", or pick a category."
        )

    price = float(row.get("price") or 0)
    if price < 0:
        raise Unknown("Price can't be negative.")

    entry = {
        "id": "own_u" + uuid.uuid4().hex[:8],
        "title": title,
        "price": round(price, 2),
        "bought_at": _when(row.get("bought_at")),
        "brand": (row.get("brand") or brand_from_url(row.get("source_url") or "")).strip(),
        "category": row.get("category") or attrs["category"],
        "kind": attrs["kind"],
        "formality": attrs["formality"],
        "warmth": attrs["warmth"],
        "rain_ok": attrs["rain_ok"],
        "size": (str(row["size"]).strip() if row.get("size") else None),
        "color": (row.get("color") or "").strip().lower(),
        "source_url": (row.get("source_url") or "").strip(),
        "photo": row.get("photo") or "",
        "notes": (row.get("notes") or "").strip(),
        "resale_estimate": _money(row.get("resale_estimate")),
        "seed_wears": max(0, int(row.get("wears") or 0)),
        # Purchases are history; the closet is what you still have. Adding a
        # purchase puts it in the closet unless the user says otherwise.
        "in_closet": bool(row.get("add_to_closet", True)),
        "archived": False,
        "archive_reason": None,
        "created_at": _now(),
    }
    with connect() as db:
        _schema(db)
        db.execute("INSERT INTO wardrobe VALUES (?, ?, ?)", (entry["id"], entry["created_at"], json.dumps(entry)))
    return entry


def rows() -> list[dict]:
    """Every purchase the user has entered, newest first."""
    with connect() as db:
        _schema(db)
        return [json.loads(r["data"]) for r in db.execute("SELECT data FROM wardrobe ORDER BY created_at DESC")]


def get(item_id: str) -> dict | None:
    with connect() as db:
        _schema(db)
        row = db.execute("SELECT data FROM wardrobe WHERE id=?", (item_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def update(item_id: str, changes: dict) -> dict | None:
    """Edit wear count, archive it, or fix a field that was typed wrong."""
    allowed = {
        "title", "price", "brand", "size", "color", "notes", "source_url",
        "photo", "resale_estimate", "in_closet", "archived", "archive_reason",
        "bought_at",
    }
    with connect() as db:
        _schema(db)
        db.execute("BEGIN IMMEDIATE")
        found = db.execute("SELECT data FROM wardrobe WHERE id=?", (item_id,)).fetchone()
        if found is None:
            return None
        entry = json.loads(found["data"])
        for key, value in changes.items():
            if key in allowed and value is not None:
                entry[key] = value
        if changes.get("archived"):
            entry["in_closet"] = False
        # A typed wear count is a correction to the log, so it replaces the
        # seed and the events rather than stacking on top of them.
        if changes.get("wears") is not None:
            entry["seed_wears"] = max(0, int(changes["wears"]))
            db.execute("DELETE FROM wear_log WHERE item_id=?", (item_id,))
        db.execute("UPDATE wardrobe SET data=? WHERE id=?", (json.dumps(entry), item_id))
        return entry


def log_wear(item_id: str, when: str | None = None) -> int:
    """One click, one wear. Returns the new total for that item."""
    with connect() as db:
        _schema(db)
        db.execute(
            "INSERT INTO wear_log VALUES (?, ?, ?)",
            ("w_" + uuid.uuid4().hex[:10], item_id, when or _now()),
        )
    return wear_counts().get(item_id, 0)


def logged_wears() -> dict[str, int]:
    with connect() as db:
        _schema(db)
        return {
            r["item_id"]: r["n"]
            for r in db.execute("SELECT item_id, COUNT(*) AS n FROM wear_log GROUP BY item_id")
        }


def wear_counts() -> dict[str, int]:
    """Typed-in starting count plus every wear logged since."""
    logged = logged_wears()
    return {row["id"]: row["seed_wears"] + logged.get(row["id"], 0) for row in rows()}


def merge_counts(base: dict[str, int]) -> dict[str, int]:
    """Seeded wear history plus everything logged since, for any item.

    "Wore today" works on the whole closet, not only on things the user typed
    in, so logged wears have to add to the seeded counts rather than replace
    them.
    """
    out = dict(base)
    for item_id, n in logged_wears().items():
        out[item_id] = out.get(item_id, 0) + n
    for row in rows():
        out[row["id"]] = out.get(row["id"], 0) + row["seed_wears"]
    return out


def wear_times() -> dict[str, list[str]]:
    with connect() as db:
        _schema(db)
        out: dict[str, list[str]] = {}
        for r in db.execute("SELECT item_id, worn_at FROM wear_log ORDER BY worn_at"):
            out.setdefault(r["item_id"], []).append(r["worn_at"])
        return out


def item(entry: dict) -> Item:
    """A stored row, as the thing the portfolio engine understands."""
    return Item(
        id=entry["id"],
        title=entry["title"],
        category=entry["category"],
        price=float(entry["price"]),
        formality=int(entry["formality"]),
        warmth=int(entry["warmth"]),
        rain_ok=bool(entry["rain_ok"]),
        color=entry.get("color") or "",
        material="",
        size=entry.get("size"),
        quality=_QUALITY,
        kind=entry.get("kind"),
    )


def owned_items() -> list[Item]:
    """What the user still has: their purchases minus anything archived."""
    return [item(r) for r in rows() if r["in_closet"] and not r["archived"]]


def purchases() -> list[Purchase]:
    """Their purchases in the shape the miner and the price history expect."""
    out = []
    for row in rows():
        bought = row["bought_at"]
        out.append(
            Purchase(
                id="ubuy_" + row["id"],
                item_id=row["id"],
                title=row["title"],
                category=row["category"],
                kind=row.get("kind") or row["category"],
                price=float(row["price"]),
                size=row.get("size"),
                bought_at=bought,
                hour=_hour(bought),
                returned=bool(row["archived"]) and row.get("archive_reason") == "returned",
                return_reason="returned" if row.get("archive_reason") == "returned" else None,
            )
        )
    return out


def wear_events(known: dict[str, Item]) -> list[dict]:
    """Logged wears, attributed to the occasion each item is best for.

    Same attribution the seeded history uses, so a user's wears and the demo's
    land in one life mix rather than two incompatible ones. `known` is every
    item the closet can identify; a wear on something since deleted is dropped
    rather than guessed at.
    """
    lookup = dict(known)
    for row in rows():
        lookup.setdefault(row["id"], item(row))

    events: list[dict] = []

    def add(item_id: str, stamp: str) -> None:
        garment = lookup.get(item_id)
        if garment is None:
            return
        best = max(STATES, key=lambda s: payoff(garment, s))
        events.append({"item_id": item_id, "state": best.key, "worn_at": stamp})

    for item_id, stamps in wear_times().items():
        for stamp in stamps:
            add(item_id, stamp)
    for row in rows():
        for _ in range(row["seed_wears"]):
            add(row["id"], row["bought_at"])
    return events


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _when(raw) -> str:
    if not raw:
        return date.today().isoformat()
    text = str(raw).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat()
    except ValueError as exc:
        raise Unknown(f'"{text}" is not a date I understand. Use the date picker.') from exc


def _hour(iso: str) -> int:
    try:
        return datetime.fromisoformat(iso).hour
    except ValueError:
        return 14


def _money(raw) -> float | None:
    if raw in (None, ""):
        return None
    return round(float(raw), 2)
