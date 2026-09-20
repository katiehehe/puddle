"""Worth it? -- the answer, before any of the arithmetic behind it.

Every number Puddle has is already computed elsewhere: duplicates and gaps by
the portfolio engine, return rates by the miner, prices by the market module.
What was missing was a judgement. One expected-value figure is a bad judgement
on its own -- it is confident, single-signal, and it means nothing to a person
holding a pair of boots. So this weighs the handful of things a friend would
actually mention, and says one of three human sentences.

The score is a tally, not a model. It is meant to be arguable: every point it
moves comes with the sentence that moved it, and those sentences are the
product. The numbers stay available under "view numbers" for anyone who wants
to check the working.
"""

from __future__ import annotations

import statistics

from .catalog import Item

WORTH_IT = "Probably worth it"
THINK = "Maybe, think about it"
SKIP = "Probably skip"

# Where the tally tips. Wide middle on purpose: most purchases genuinely are
# a judgement call, and pretending otherwise is how advice stops being trusted.
FOR = 1.5
AGAINST = -1.5

WEAR_LADDER = (5, 10, 20, 50)
# Below this many wears on the things you already own like it, "you don't
# really wear these" is a statement about your behaviour rather than noise.
LOW_USE = 5
HIGH_USE = 15


def _avg_wears(ids: list[str], counts: dict[str, int]) -> float:
    return statistics.mean([counts.get(i, 0) for i in ids]) if ids else 0.0


def _same_kind(item: Item, closet_items: list[Item]) -> list[Item]:
    kind = item.kind or item.category
    return [i for i in closet_items if (i.kind or i.category) == kind]


def _noun(item: Item) -> str:
    kind = (item.kind or item.category).replace("_", " ")
    return kind if kind.endswith("s") else kind + "s"


def advise(
    item: Item,
    evaluation: dict,
    quote: dict,
    shopping: dict,
    closet_items: list[Item],
    counts: dict[str, int],
    coverage: dict,
    usage: dict,
    brand: str = "",
    brands: dict[str, dict] | None = None,
) -> dict:
    """The verdict, the reasons for it, and what to do next.

    `evaluation` is Closet.evaluate, `quote` is desk.quote, `shopping` is the
    price/duplicate context the checkout already sends. Nothing is recomputed
    here: this decides what any of it means.
    """
    score = 0.0
    reasons: list[dict] = []

    def say(tone: str, kind: str, text: str, weight: float) -> None:
        nonlocal score
        score += weight
        reasons.append({"tone": tone, "kind": kind, "text": text})

    dupes = evaluation["redundant_with"]
    dupe_ids = [d["id"] for d in dupes]
    dupe_wears = _avg_wears(dupe_ids, counts)

    # 1. do I already own it?
    if dupes:
        owned = len(dupes)
        closest = max(dupes, key=lambda d: counts.get(d["id"], 0))
        say(
            "against",
            "duplicates",
            f"You already own {owned} similar thing{'' if owned == 1 else 's'}, "
            f"including your {closest['title'].lower()}.",
            -1.0 - 0.4 * min(owned - 1, 3),
        )

    # 2. will I actually use it? -- their own behaviour with the same things
    if dupes and dupe_wears < LOW_USE:
        say(
            "against",
            "usage",
            f"The ones you own average {dupe_wears:.0f} wear{'' if round(dupe_wears) == 1 else 's'}, "
            "so this kind of thing doesn't get much use from you.",
            -1.0,
        )
    else:
        family = _same_kind(item, closet_items)
        family_wears = _avg_wears([i.id for i in family], counts)
        if family and family_wears >= HIGH_USE:
            say(
                "for",
                "usage",
                f"{_noun(item).capitalize()} are one of your most-used categories, "
                f"yours average {family_wears:.0f} wears.",
                1.0,
            )

    # 3. does it fill a gap?
    gap = evaluation["covers_gap"]
    if gap:
        label = next(
            (o["label"] for o in coverage.get("occasions", []) if o["state"] == gap["state"]),
            gap["label"],
        )
        say(
            "for",
            "gap",
            f"You don't own anything that really works for {label.lower()}, so this fills a real gap.",
            2.0,
        )

    # 4. is the price good?
    difference = shopping.get("difference")
    typical = shopping.get("typical_price")
    if typical is not None and difference is not None:
        if difference >= 0.05 * typical:
            say(
                "for",
                "price",
                f"${item.price:,.0f} is about ${abs(difference):,.0f} below the ~${typical:,.0f} "
                f"you normally pay ({shopping['basis']}).",
                0.8,
            )
        elif difference <= -0.05 * typical:
            say(
                "against",
                "price",
                f"${item.price:,.0f} is about ${abs(difference):,.0f} more than the ~${typical:,.0f} "
                f"you normally pay ({shopping['basis']}).",
                -0.8,
            )

    # A good price on something you already have twice is the classic trap.
    if dupes and typical is not None and difference is not None and difference > 0:
        say(
            "neutral",
            "discount",
            "It is a good price, but a good price on something you already own twice is still money out.",
            -0.3,
        )

    # 5. do things like this come back?
    if quote["return_prob"] >= 0.5:
        say(
            "against",
            "returns",
            f"You send {round(quote['return_prob'] * 100)}% of these back ({quote['return_evidence']}).",
            -1.5,
        )

    # 6. is this the kind of day you actually dress for?
    if usage.get("enough_data"):
        top_state = evaluation["top_state"]
        row = next((r for r in usage["rows"] if r["state"] == top_state), None)
        if row and row["share"] < 0.05:
            say(
                "against",
                "occasions",
                f"This is really a {row['label'].lower()} piece, and that's about "
                f"{round(row['share'] * 100)}% of what you actually dress for.",
                -0.7,
            )
        elif row and row["share"] >= 0.25:
            say(
                "for",
                "occasions",
                f"It suits {row['label'].lower()} days, which is {round(row['share'] * 100)}% of your outfits.",
                0.6,
            )

    # 7. brand you get value from
    history = (brands or {}).get(brand.strip().lower())
    if history and history["cost_per_wear"] is not None and history["items"] > 1:
        say(
            "for",
            "brand",
            f"Your other {history['brand']} things average ${history['cost_per_wear']:.2f} per wear.",
            0.4,
        )

    per_wear = {n: round(item.price / n, 2) for n in WEAR_LADDER}
    expected = quote["expected_wears"]
    if expected > 0:
        realistic = round(item.price / expected, 2)
        tone = "for" if realistic <= quote["your_cost_per_wear"] else "against"
        say(
            tone,
            "per_wear",
            f"Going on how you wear things, you'd get about {expected:.0f} wears out of it, "
            f"roughly ${realistic:,.2f} a wear, against the ${quote['your_cost_per_wear']:,.2f} "
            "your closet averages.",
            0.5 if tone == "for" else -0.5,
        )

    verdict = WORTH_IT if score >= FOR else SKIP if score <= AGAINST else THINK
    return {
        "verdict": verdict,
        "stance": {"Probably worth it": "for", "Maybe, think about it": "think", "Probably skip": "against"}[
            verdict
        ],
        "score": round(score, 2),
        "subhead": f"${item.price:,.0f} {item.title}",
        "reasons": reasons,
        "per_wear": per_wear,
        "expected_wears": expected,
        "resale": shopping.get("resale"),
        "questions": _questions(item, dupes),
        "numbers": {
            "paid": round(item.price, 2),
            "typical_price": typical,
            "resale": shopping.get("resale"),
            "expected_wears": expected,
            "cost_per_wear_if_bought": quote["cost_per_wear_if_bought"],
            "your_cost_per_wear": quote["your_cost_per_wear"],
            "similar_owned": len(dupes),
            "similar_wears": round(dupe_wears, 1),
            "return_prob": quote["return_prob"],
            "ev": quote["ev"],
            "fair_bid": quote["fair_bid"],
            "no_price": quote["no_price"],
            "alpha": evaluation["alpha"],
        },
    }


def _questions(item: Item, dupes: list[dict]) -> list[str]:
    out = []
    if dupes:
        out.append("Show me similar things I own")
    out.append("What if I wear them 30 times?")
    out.append(f"Is ${item.price:,.0f} a good price?")
    return out


def brand_stats(entries: list[dict], counts: dict[str, int]) -> dict[str, dict]:
    """Cost per wear by brand, from the purchases the user typed in.

    Only their own entries carry a brand -- the seeded closet has none -- so
    this quietly says nothing until they have told Puddle where things came
    from, which is the honest behaviour.
    """
    by_brand: dict[str, list[dict]] = {}
    for entry in entries:
        brand = (entry.get("brand") or "").strip()
        if brand:
            by_brand.setdefault(brand.lower(), []).append(entry)
    out: dict[str, dict] = {}
    for key, items in by_brand.items():
        worn = [(i["price"], counts.get(i["id"], 0)) for i in items]
        used = [p / w for p, w in worn if w > 0]
        out[key] = {
            "brand": items[0]["brand"],
            "items": len(items),
            "cost_per_wear": round(statistics.mean(used), 2) if used else None,
        }
    return out
