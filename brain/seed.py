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
# returned=True means the user sent it back. Boots size 8 are a graveyard.
HISTORY = [
    {"category": "boots", "size": "8", "hour": 23, "returned": True,  "title": "Suede boots"},
    {"category": "boots", "size": "8", "hour": 0,  "returned": True,  "title": "Combat boots"},
    {"category": "boots", "size": "8", "hour": 22, "returned": True,  "title": "Leather boots"},
    {"category": "boots", "size": "8", "hour": 23, "returned": True,  "title": "Chukka boots"},
    {"category": "top",   "size": "M", "hour": 14, "returned": False, "title": "Tee"},
    {"category": "top",   "size": "M", "hour": 23, "returned": True,  "title": "Graphic tee"},
    {"category": "bottom","size": "32","hour": 15, "returned": False, "title": "Jeans"},
    {"category": "outer", "size": "M", "hour": 13, "returned": False, "title": "Jacket"},
    {"category": "top",   "size": "M", "hour": 12, "returned": False, "title": "Polo"},
    {"category": "shoes", "size": "9", "hour": 23, "returned": True,  "title": "Loafers"},
    {"category": "shoes", "size": "9", "hour": 11, "returned": False, "title": "Trainers"},
    {"category": "top",   "size": "M", "hour": 23, "returned": True,  "title": "Henley"},
]
