"""Seeded wardrobe + storefront catalog.

The closet is deliberately shaped so the engine has real structure to find:
  * four near-identical charcoal crewnecks (redundancy / high covariance)
  * six going-out tops (overexposure to one state)
  * nothing that is simultaneously formal and warm (a coverage gap)
"""

from dataclasses import asdict, dataclass, replace


@dataclass
class Item:
    id: str
    title: str
    category: str
    price: float
    formality: int  # 1-5
    warmth: int  # 1-5
    rain_ok: bool
    color: str
    material: str
    size: str | None = None
    quality: float = 0.7  # q_i, the user's rating of the item
    # Finer grouping than category: what the garment *is* (crewneck, puffer,
    # sports_bra). Substitutability keys on this, so a seeded item that
    # leaves it blank silently becomes interchangeable with everything else
    # in its category -- see test_seeded_catalog_declares_a_real_kind.
    kind: str | None = None

    def __post_init__(self) -> None:
        if self.kind is None:
            # Only scraped/user-supplied items should land here.
            self.kind = self.category

    def dict(self) -> dict:
        return asdict(self)


def _i(*args, **kwargs) -> Item:
    return Item(*args, **kwargs)


CLOSET: list[Item] = [
    # --- the crewneck problem -------------------------------------------------
    _i("own_101", "Charcoal crewneck", "top", 58, 2, 3, False, "charcoal", "cotton", "M", 0.75, "crewneck"),
    _i("own_102", "Charcoal crewneck (heavier)", "top", 72, 2, 3, False, "charcoal", "cotton", "M", 0.70, "crewneck"),
    _i("own_103", "Grey crewneck", "top", 45, 2, 3, False, "grey", "cotton", "M", 0.55, "crewneck"),
    _i("own_104", "Charcoal hoodie", "top", 64, 1, 3, False, "charcoal", "fleece", "M", 0.80, "hoodie"),
    # --- going-out tops: overexposure ----------------------------------------
    _i("own_110", "Black satin cami", "top", 42, 4, 1, False, "black", "satin", "S", 0.78, "going_out_top"),
    _i("own_111", "Sequin halter top", "top", 55, 4, 1, False, "silver", "poly", "S", 0.45, "going_out_top"),
    _i("own_112", "Red going-out top", "top", 38, 4, 1, False, "red", "poly", "S", 0.62, "going_out_top"),
    _i("own_113", "Mesh long-sleeve", "top", 34, 4, 1, False, "black", "mesh", "S", 0.50, "going_out_top"),
    _i("own_114", "Corset top", "top", 48, 4, 1, False, "black", "poly", "S", 0.55, "going_out_top"),
    _i("own_115", "Off-shoulder top", "top", 40, 4, 1, False, "white", "poly", "S", 0.60, "going_out_top"),
    # --- everyday bottoms / layers -------------------------------------------
    _i("own_120", "Straight-leg jeans", "bottom", 88, 2, 2, False, "indigo", "denim", "27", 0.90, "jeans"),
    _i("own_121", "Black jeans", "bottom", 78, 3, 2, False, "black", "denim", "27", 0.85, "jeans"),
    _i("own_122", "Sweatpants", "bottom", 45, 1, 3, False, "grey", "cotton", "S", 0.80, "sweatpants"),
    _i("own_123", "Leggings", "bottom", 32, 1, 2, False, "black", "nylon", "S", 0.85, "leggings"),
    _i("own_124", "Denim mini skirt", "bottom", 42, 3, 1, False, "indigo", "denim", "27", 0.50, "skirt"),
    # --- outerwear ------------------------------------------------------------
    _i("own_130", "Puffer jacket", "outer", 140, 2, 5, False, "black", "nylon", "S", 0.85, "puffer"),
    _i("own_131", "Denim jacket", "outer", 95, 2, 2, False, "indigo", "denim", "S", 0.70, "light_jacket"),
    _i("own_132", "Rain shell", "outer", 110, 2, 3, True, "olive", "nylon", "S", 0.75, "rain_outer"),
    # --- athletic -------------------------------------------------------------
    _i("own_140", "Running shorts", "bottom", 28, 1, 1, False, "black", "poly", "S", 0.80, "athletic_shorts"),
    _i("own_141", "Sports bra", "top", 34, 1, 1, False, "black", "nylon", "S", 0.85, "sports_bra"),
    _i("own_142", "Training tee", "top", 26, 1, 2, False, "white", "poly", "S", 0.75, "athletic_top"),
    # --- shoes ----------------------------------------------------------------
    _i("own_150", "White sneakers", "shoes", 85, 2, 2, False, "white", "leather", "8", 0.90, "sneakers"),
    _i("own_151", "Chelsea boots", "shoes", 120, 3, 3, False, "black", "leather", "8", 0.40, "boots"),
    _i("own_152", "Rain boots", "shoes", 65, 1, 3, True, "black", "rubber", "8", 0.70, "rain_boots"),
    _i("own_153", "Strappy heels", "shoes", 78, 4, 1, False, "black", "leather", "8", 0.45, "heels"),
    # --- one nice dress, but it is not warm ----------------------------------
    _i("own_160", "Black slip dress", "dress", 95, 4, 2, False, "black", "silk", "S", 0.78, "going_out_dress"),
]


STOREFRONT: list[Item] = [
    _i("sku_991", "Suede Chelsea boots", "shoes", 128, 3, 3, False, "taupe", "suede", "8", 0.7, "boots"),
    _i("sku_992", "Charcoal crewneck sweatshirt", "top", 68, 2, 3, False, "charcoal", "cotton", "M", 0.7, "crewneck"),
    _i("sku_993", "Wool blazer", "outer", 165, 5, 4, False, "navy", "wool", "S", kind="blazer"),
    _i("sku_994", "Slip dress", "dress", 89, 4, 1, False, "emerald", "satin", "S", 0.7, "going_out_dress"),
    _i("sku_995", "Cashmere scarf", "accessory", 74, 3, 4, False, "camel", "cashmere", None, kind="scarf"),
    _i("sku_996", "Platform sneakers", "shoes", 95, 2, 2, False, "white", "leather", "8", kind="sneakers"),
    _i("sku_997", "Quilted rain parka", "outer", 148, 2, 4, True, "black", "nylon", "S", 0.7, "rain_outer"),
    _i("sku_998", "Ribbed tank", "top", 24, 2, 1, False, "white", "cotton", "S", kind="tank"),
    _i("sku_999", "Charcoal wool suit", "outer", 320, 5, 3, False, "charcoal", "wool", "S", 0.85, "formal"),
]


BY_ID: dict[str, Item] = {item.id: item for item in CLOSET + STOREFRONT}

# The mock storefront and the extension's offline fallback ship their own SKU
# ids; point them at the real catalogue entries.
ALIASES = {
    "cand_boots": "sku_991",
    "cand_crew4": "sku_992",
    "cand_suit": "sku_999",
    "cand_rain": "sku_997",
    "cand_blazer": "sku_993",
}

# A storefront can only tell us a category; kinds are what the return history
# is actually indexed by.
_KIND_BY_CATEGORY = {"boots": "boots", "formal": "formal", "sneakers": "sneakers"}
_CATEGORY_ALIAS = {"boots": "shoes", "sneakers": "shoes", "formal": "outer"}


def _apply_personal_wardrobe() -> None:
    """Swap the seeded closet for a personal one when PUDDLE_WARDROBE is set.

    Imported late: wardrobe builds catalog Items, so a module-level import
    there would be circular. Failures are raised, not swallowed -- silently
    scoring someone else's closet is worse than refusing to start.
    """
    global CLOSET, STOREFRONT, CATALOG, BY_ID
    import os

    if not os.environ.get("PUDDLE_WARDROBE", "").strip():
        return
    from .wardrobe import load, merged_storefront

    data = load()
    if not data:
        return
    CLOSET = data["closet"]
    STOREFRONT = merged_storefront(STOREFRONT, data["storefront"])
    CATALOG = CLOSET + STOREFRONT
    BY_ID = {item.id: item for item in CATALOG}


_apply_personal_wardrobe()


def coerce_item(raw: dict) -> Item | None:
    """Build an Item from whatever a checkout page hands us."""
    known = BY_ID.get(ALIASES.get(raw.get("id", ""), raw.get("id", "")))
    if known is not None:
        return replace(known, size=str(raw["size"]) if raw.get("size") is not None else known.size)
    if "formality" not in raw or "warmth" not in raw:
        # A real storefront publishes a title, not a formality rating. Infer
        # what we can from the words; infer() returns None for anything it
        # does not recognise, so an unreadable garment still gets no opinion.
        from .infer import infer

        guessed = infer(raw.get("title", ""), raw.get("category"))
        if guessed is None:
            return None
        raw = {**guessed, **{k: v for k, v in raw.items() if v is not None}, **{
            k: guessed[k] for k in ("formality", "warmth") if k not in raw
        }}
    category = raw.get("category", "top")
    title = raw.get("title", "this")
    kind = raw.get("kind") or _KIND_BY_CATEGORY.get(category)
    if kind is None:
        lowered = title.lower()
        kind = next((k for k in ("crewneck", "boots", "blazer", "hoodie") if k in lowered), category)
    return Item(
        id=raw.get("id", "unknown"),
        title=title,
        category=_CATEGORY_ALIAS.get(category, category),
        price=float(raw.get("price", 0)),
        formality=int(raw["formality"]),
        warmth=int(raw["warmth"]),
        rain_ok=bool(raw.get("waterproof") or raw.get("rain_ok")),
        color=raw.get("color", ""),
        material=raw.get("material", ""),
        size=raw.get("size"),
        quality=float(raw.get("q", raw.get("quality", 0.7))),
        kind=kind,
    )
