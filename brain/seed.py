"""Synthetic catalog, closet, and purchase/return history with planted patterns.

Planted so the demo fires:
  - 3 near-identical charcoal crewnecks owned -> redundancy insight
  - no formal/interview piece, no rain layer -> coverage gaps (green-lights)
  - user has returned 4 pairs of size-8 boots, returns spike at 11pm -> return/time patterns
"""
from __future__ import annotations


def _item(id, title, category, formality, warmth, price, q=0.7,
          waterproof=False, color="", material="", owned=False, size=None, wears=0):
    return {
        "id": id, "title": title, "category": category,
        "formality": formality, "warmth": warmth, "price": price, "q": q,
        "waterproof": waterproof, "color": color, "material": material,
        "owned": owned, "size": size, "wears": wears,
    }


# ---- Owned closet ---------------------------------------------------------
CLOSET = [
    _item("own_tee1", "White cotton tee", "top", 2, 2, 18, q=0.85, color="white", material="cotton", owned=True, wears=40),
    _item("own_crew1", "Charcoal crewneck", "top", 2, 3, 55, q=0.8, color="charcoal", material="cotton", owned=True, wears=22),
    _item("own_crew2", "Charcoal crewneck (older)", "top", 2, 3, 50, q=0.6, color="charcoal", material="cotton", owned=True, wears=9),
    _item("own_crew3", "Heather-charcoal sweatshirt", "top", 2, 3, 48, q=0.55, color="charcoal", material="cotton", owned=True, wears=6),
    _item("own_jeans", "Dark wash jeans", "bottom", 2, 3, 78, q=0.9, color="indigo", material="denim", owned=True, wears=55),
    _item("own_chinos", "Olive chinos", "bottom", 3, 3, 60, q=0.7, color="olive", material="cotton", owned=True, wears=18),
    _item("own_hoodie", "Grey hoodie", "outer", 1, 4, 45, q=0.75, color="grey", material="cotton", owned=True, wears=48),
    _item("own_gymtop", "Dri-fit gym tee", "top", 1, 2, 25, q=0.7, color="black", material="poly", owned=True, wears=30),
    _item("own_gymshort", "Running shorts", "bottom", 1, 2, 28, q=0.7, color="black", material="poly", owned=True, wears=27),
    _item("own_sneak", "White sneakers", "shoes", 2, 2, 90, q=0.85, color="white", material="leather", owned=True, wears=60),
    _item("own_going", "Silky night-out top", "top", 4, 2, 65, q=0.65, color="black", material="satin", owned=True, wears=5),
]

# ---- Candidates (not owned) ----------------------------------------------
CANDIDATES = [
    _item("cand_crew4", "Charcoal crewneck (new)", "top", 2, 3, 68, q=0.7, color="charcoal", material="cotton"),
    _item("cand_suit", "Charcoal wool suit", "formal", 5, 3, 320, q=0.85, color="charcoal", material="wool"),
    _item("cand_rain", "Packable rain shell", "outer", 2, 4, 95, q=0.8, waterproof=True, color="navy", material="nylon"),
    _item("cand_boots", "Chelsea boots (size 8)", "boots", 3, 3, 128, q=0.6, color="brown", material="leather", size="8"),
    _item("cand_oxford", "Oxford dress shirt", "top", 4, 2, 60, q=0.75, color="white", material="cotton"),
]

CATALOG = CLOSET + CANDIDATES

# ---- Purchase / return history (planted) ---------------------------------
# returned=True means the user sent it back.
#
# Planted so two things are true AND surprising at the same time:
#   - boots, size 8: bought 4, returned 4      -> the return_pattern insight
#   - the late window (21:00-01:00) returns at ~88% against a ~18% lifetime
#     baseline                                  -> the time_pattern insight
#
# The baseline is the whole point of #2. With a mostly-returned history the
# duck ends up saying "100% of what you buy now comes back" against a 58%
# baseline, which is noise dressed up as an insight. Most daytime purchases
# have to be keepers for the late-night number to mean anything.


def _h(category, size, hour, returned, title):
    return {"category": category, "size": size, "hour": hour,
            "returned": returned, "title": title}


# Late-night purchases: where the regret lives. Size-8 boots are a graveyard.
_LATE = [
    _h("boots",  "8",  23, True,  "Suede boots"),
    _h("boots",  "8",  0,  True,  "Combat boots"),
    _h("boots",  "8",  22, True,  "Leather boots"),
    _h("boots",  "8",  23, True,  "Chukka boots"),
    _h("shoes",  "9",  23, True,  "Loafers"),
    _h("top",    "M",  23, True,  "Graphic tee"),
    _h("top",    "M",  22, True,  "Henley"),
    _h("outer",  "M",  21, False, "Flannel overshirt"),
]

# Daytime purchases: mostly keepers. Note the size-10 boots that stuck around --
# the return pattern is specific to size 8, not to boots.
_DAY_ROWS = [
    ("top",    "M",  12, False, "Polo"),
    ("top",    "M",  14, False, "White tee (3-pack)"),
    ("top",    "M",  11, False, "Oxford shirt"),
    ("top",    "M",  16, False, "Merino sweater"),
    ("top",    "M",  10, False, "Flannel shirt"),
    ("top",    "M",  15, False, "Linen shirt"),
    ("top",    "M",  13, False, "Striped tee"),
    ("top",    "M",  14, True,  "Cropped tee"),
    ("top",    "M",  17, False, "Grey hoodie"),
    ("top",    "M",  9,  False, "Dri-fit gym tee"),
    ("top",    "M",  18, False, "Thermal base layer"),
    ("top",    "M",  12, False, "Rugby shirt"),
    ("top",    "M",  15, False, "Waffle henley"),
    ("bottom", "32", 15, False, "Dark wash jeans"),
    ("bottom", "32", 11, False, "Olive chinos"),
    ("bottom", "32", 17, False, "Corduroys"),
    ("bottom", "M",  9,  False, "Running shorts"),
    ("bottom", "32", 13, False, "Cargo pants"),
    ("bottom", "32", 10, False, "Track pants"),
    ("bottom", "32", 16, False, "Swim trunks"),
    ("bottom", "32", 9,  False, "Sweatpants"),
    ("outer",  "M",  13, False, "Denim jacket"),
    ("outer",  "M",  16, False, "Fleece"),
    ("outer",  "M",  12, False, "Bomber jacket"),
    ("outer",  "M",  14, False, "Quilted vest"),
    ("shoes",  "9",  11, False, "Trainers"),
    ("shoes",  "9",  14, False, "Canvas sneakers"),
    ("shoes",  "9",  16, False, "Running shoes"),
    ("shoes",  "9",  10, False, "Slides"),
    ("boots",  "10", 15, False, "Hiking boots"),
    ("boots",  "10", 12, False, "Duck boots"),
    ("acc",    None, 13, False, "Beanie"),
    ("acc",    None, 15, False, "Socks (6-pack)"),
    ("acc",    None, 11, False, "Leather belt"),
    ("acc",    None, 17, False, "Baseball cap"),
    ("acc",    None, 10, False, "Canvas tote"),
]

HISTORY = _LATE + [_h(*r) for r in _DAY_ROWS]
