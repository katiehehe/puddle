"""Occasions, said the way a person says them.

The engine reasons over states of the world with probabilities and payoffs.
Nobody shops that way. This module is the translation layer: the same numbers,
renamed to the situations someone actually dresses for, and turned into the
two sentences that matter -- what your closet is good for, and what it isn't.

Nothing here computes anything new. `payoff` and `life_mix` already exist; this
decides what to call the answers and when there is enough data to say them.
"""

from __future__ import annotations

from .catalog import Item
from .portfolio import COVERED, payoff
from .states import STATE_INDEX, STATES

# The occasion names the dashboard shows. Keyed by the engine's state keys so
# renaming a label never changes a calculation.
LABELS: dict[str, str] = {
    "casual_warm": "Everyday",
    "casual_cold": "Cold weather",
    "gym": "Athletic",
    "lounge": "Lounge",
    "night_out": "Going out",
    "date": "Dinner / date",
    "formal": "Interview / formal",
    "rain": "Rain",
}

# What to suggest when an occasion has nothing that serves it.
SUGGESTIONS: dict[str, str] = {
    "casual_warm": "a couple of plain everyday tops",
    "casual_cold": "a warm layer you can wear over anything",
    "gym": "proper training kit",
    "lounge": "something comfortable that isn't gym wear",
    "night_out": "one going-out outfit you like",
    "date": "something smarter than your everyday clothes",
    "formal": "a versatile blazer or a formal shoe",
    "rain": "a waterproof jacket or rain boots",
}

# Under this many recorded wears, percentages are a guess dressed as a fact.
ENOUGH_WEARS = 25


def tags(item: Item) -> list[str]:
    """The occasions this one garment genuinely works for."""
    return [LABELS[s.key] for s in STATES if payoff(item, s) >= COVERED]


def coverage(closet) -> dict:
    """What your closet covers, and where it runs thin.

    `closet.coverage()` gives the best payoff available for each occasion.
    Here that becomes three buckets a person can read at a glance, plus the
    sentence that tells them what to do about the weakest one.
    """
    rows = []
    for row in closet.coverage():
        label = LABELS.get(row["state"], row["label"])
        strength = "good" if row["best"] >= COVERED else "thin" if row["best"] >= 0.35 else "none"
        rows.append(
            {
                "state": row["state"],
                "label": label,
                "strength": strength,
                # 0-1, what the radar plots.
                "score": row["best"],
                "covered": row["covered"],
                "best_item": row["best_item"],
                "options": sum(1 for i in closet.items if payoff(i, _state(row["state"])) >= COVERED),
            }
        )

    covered = [r for r in rows if r["covered"]]
    gaps = [r for r in rows if not r["covered"]]
    strongest = sorted(covered, key=lambda r: -r["options"])[:3]
    weakest = sorted(rows, key=lambda r: (r["score"], r["options"]))[0] if rows else None

    if gaps:
        names = _join([g["label"].lower() for g in gaps])
        headline = f"You're covered for most things, but you're light on {names}."
    else:
        headline = "Your closet covers every kind of day you dress for."

    advice = ""
    if weakest is not None:
        thing = SUGGESTIONS.get(weakest["state"], "something for it")
        if weakest["options"] == 0:
            advice = (
                f"You don't own anything that really works for {weakest['label'].lower()}. "
                f"{thing.capitalize()} would fill a real gap."
            )
        elif weakest["options"] == 1:
            advice = (
                f"You have exactly one option for {weakest['label'].lower()}. "
                f"{thing.capitalize()} would give you a second."
            )
        else:
            advice = (
                f"{weakest['label']} is your thinnest area, with {weakest['options']} things that work."
            )

    return {
        "headline": headline,
        "advice": advice,
        "well_covered": [r["label"] for r in strongest],
        "gaps": [r["label"] for r in gaps],
        "weakest": weakest["state"] if weakest else None,
        "occasions": rows,
    }


def usage(wear_events: list[dict]) -> dict:
    """How you actually dress: the share of recorded wears per occasion.

    Deliberately the raw share rather than the stake-weighted mix the engine
    prices against -- this panel answers "what is my life like", and inflating
    interviews because they matter more would be a lie at that question.
    """
    counts = {s.key: 0 for s in STATES}
    for event in wear_events:
        if event["state"] in counts:
            counts[event["state"]] += 1
    total = sum(counts.values())
    rows = [
        {
            "state": key,
            "label": LABELS.get(key, key),
            "wears": n,
            "share": round(n / total, 4) if total else 0.0,
        }
        for key, n in sorted(counts.items(), key=lambda kv: -kv[1])
    ]

    enough = total >= ENOUGH_WEARS
    lines: list[str] = []
    if not enough:
        lines.append(
            f"Only {total} wear{'' if total == 1 else 's'} logged so far, so treat this as a rough sketch. "
            "Tap 'Wore today' on things as you wear them and it sharpens quickly."
        )
    else:
        casual = sum(r["share"] for r in rows if r["state"] in ("casual_warm", "casual_cold"))
        if casual >= 0.4:
            lines.append(
                f"Most of what you wear is casual — {round(casual * 100)}% of your recorded outfits "
                "are everyday or cold-weather clothes."
            )
        top = rows[0]
        if top["state"] not in ("casual_warm", "casual_cold"):
            lines.append(f"{top['label']} is what you dress for most, at {round(top['share'] * 100)}%.")
        rare = [r for r in rows if r["share"] < 0.05]
        if rare:
            worst = rare[-1]
            lines.append(
                f"{worst['label']} is rare for you — about {round(worst['share'] * 100)}% of your outfits — "
                f"so another one of those won't get much use unless you have something coming up."
            )
    return {"rows": rows, "total_wears": total, "enough_data": enough, "lines": lines}


def _state(key: str):
    return STATES[STATE_INDEX[key]]


def _join(words: list[str]) -> str:
    if len(words) <= 1:
        return words[0] if words else ""
    return ", ".join(words[:-1]) + " and " + words[-1]
