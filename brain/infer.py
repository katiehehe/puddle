"""Guessing a garment's attributes from the words on a product page.

The catalog refuses an item with no formality or warmth, and it is right to:
scoring needs them, and a default would be a silent invention. But a real
storefront publishes a title and a price, not a formality rating, so something
has to bridge the two or the duck can never speak outside our own mock shop.

This is the rule-based arm of PRD 3.1 -- keyword -> attributes, no model. It is
deliberately narrow: an unrecognised garment returns None and the duck stays
quiet, because being silent is a much cheaper mistake than confidently pricing
the risk of a thing we could not identify.
"""

from __future__ import annotations

import re

# kind -> (category, formality, warmth, rain_ok). Ordered most specific first:
# "rain jacket" must beat "jacket", "dress shirt" must beat "dress".
_RULES: list[tuple[tuple[str, ...], str, str, int, int, bool]] = [
    # outerwear -- rain before warmth, because the words overlap
    (("rain jacket", "rain shell", "raincoat", "rain coat", "parka", "anorak", "windbreaker"),
     "rain_outer", "outer", 2, 3, True),
    (("puffer", "down jacket", "parka jacket"), "puffer", "outer", 2, 5, False),
    (("blazer", "sport coat", "sports coat"), "blazer", "outer", 5, 3, False),
    (("suit",), "formal", "outer", 5, 3, False),
    (("peacoat", "overcoat", "wool coat", "trench"), "puffer", "outer", 4, 4, False),
    (("denim jacket", "jean jacket", "bomber", "windcheater"), "light_jacket", "outer", 2, 2, False),
    (("jacket", "coat"), "light_jacket", "outer", 3, 3, False),
    # tops
    (("dress shirt", "oxford shirt", "button-down", "button down"), "crewneck", "top", 4, 2, False),
    (("crewneck", "sweatshirt", "jumper", "pullover", "sweater", "knit"), "crewneck", "top", 2, 3, False),
    (("hoodie", "hooded"), "hoodie", "top", 1, 3, False),
    (("sports bra", "sport bra"), "sports_bra", "top", 1, 1, False),
    (("gym tee", "training tee", "performance tee", "dri-fit", "athletic top"),
     "athletic_top", "top", 1, 2, False),
    (("camisole", "cami", "halter", "corset", "going-out top", "bodysuit",
      "off-shoulder", "off shoulder", "mesh", "bandeau", "tube top"),
     "going_out_top", "top", 4, 1, False),
    (("tank", "vest top", "singlet"), "tank", "top", 2, 1, False),
    (("blouse", "shirt", "tee", "t-shirt", "top", "polo", "henley"), "crewneck", "top", 2, 2, False),
    # bottoms
    (("jeans", "denim pant"), "jeans", "bottom", 2, 2, False),
    (("sweatpant", "joggers", "track pant"), "sweatpants", "bottom", 1, 3, False),
    (("legging", "tights"), "leggings", "bottom", 1, 2, False),
    (("running short", "gym short", "athletic short"), "athletic_shorts", "bottom", 1, 1, False),
    (("skirt",), "skirt", "bottom", 3, 1, False),
    (("chino", "trouser", "slacks", "pant"), "jeans", "bottom", 3, 2, False),
    (("shorts",), "athletic_shorts", "bottom", 1, 1, False),
    # shoes
    (("rain boot", "wellington", "wellie"), "rain_boots", "shoes", 1, 3, True),
    (("chelsea boot", "boot"), "boots", "shoes", 3, 3, False),
    (("heel", "pump", "stiletto"), "heels", "shoes", 4, 1, False),
    (("sneaker", "trainer", "running shoe"), "sneakers", "shoes", 2, 2, False),
    (("loafer", "oxford shoe", "derby"), "heels", "shoes", 4, 2, False),
    # dresses and accessories
    (("slip dress", "cocktail dress", "party dress"), "going_out_dress", "dress", 4, 1, False),
    (("dress",), "going_out_dress", "dress", 4, 2, False),
    (("scarf", "beanie", "glove", "hat", "belt", "sock"), "scarf", "accessory", 3, 4, False),
]

# Words that shift the guess without changing what the garment is.
_WARM_WORDS = re.compile(r"\b(wool|cashmere|fleece|sherpa|thermal|quilted|insulated|merino|down)\b")
_LIGHT_WORDS = re.compile(r"\b(linen|mesh|sheer|lightweight|cropped)\b")
_FORMAL_WORDS = re.compile(r"\b(silk|satin|sequin|velvet|tailored|formal)\b")
_RAIN_WORDS = re.compile(r"\b(waterproof|water-resistant|gore-tex|rainproof)\b")


def _clamp(value: int) -> int:
    return max(1, min(5, value))


def infer(title: str, category: str | None = None) -> dict | None:
    """Attributes for a garment named `title`, or None if we cannot tell.

    None is a real answer here, not a failure: it is how the duck declines to
    have an opinion about something it did not recognise.
    """
    text = re.sub(r"\s+", " ", (title or "").lower()).strip()
    if not text:
        return None

    for words, kind, cat, formality, warmth, rain_ok in _RULES:
        if not any(w in text for w in words):
            continue
        if _WARM_WORDS.search(text):
            warmth += 1
        if _LIGHT_WORDS.search(text):
            warmth -= 1
        if _FORMAL_WORDS.search(text):
            formality += 1
        return {
            "category": category or cat,
            "kind": kind,
            "formality": _clamp(formality),
            "warmth": _clamp(warmth),
            "rain_ok": bool(rain_ok or _RAIN_WORDS.search(text)),
            "inferred": True,
        }
    return None
