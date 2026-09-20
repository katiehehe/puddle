"""Wardrobe-scoped questions: the duck answering about everything you own.

`/voice/respond` answers about the one item in front of you. This answers about
the closet as a whole -- what you own for an occasion, where the holes are,
what never gets worn, what you have spent, how often the duck has been right.

Every answer is a statistic this brain already computes, rendered as a
sentence, and it ships the statistic alongside the sentence. A question that
matches no evidence returns nothing rather than a guess: there is no model here
and no generation, which is the point.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import insights, ledger, market, pond
from .catalog import STOREFRONT, Item
from .miner import Miner
from .portfolio import Closet
from .states import STATES

router = APIRouter(tags=["ask"])

# Occasion words a shopper would actually use, mapped onto the states the
# portfolio is defined over.
STATE_WORDS: dict[str, tuple[str, ...]] = {
    "rain": ("rain", "rainy", "raining", "snow", "wet", "storm"),
    "formal": ("formal", "interview", "wedding", "funeral", "job", "smart"),
    "gym": ("gym", "workout", "work out", "working out", "running", "athletic", "exercise", "training"),
    "night_out": ("night out", "party", "club", "clubbing", "going out"),
    "date": ("date", "dinner", "date night"),
    "lounge": ("lounge", "loungewear", "comfy", "around the house"),
    "casual_cold": ("cold", "winter", "freezing", "chilly"),
    "casual_warm": ("casual", "class", "everyday"),
}

_QUANTITY = re.compile(r"\b(how many|how much|do i own|do i have|what do i own|what do i have|own any|have any)\b")


def money(value: float) -> str:
    return f"${round(value):,}"


def _state_in(text: str) -> str | None:
    for key, words in STATE_WORDS.items():
        if any(re.search(rf"\b{re.escape(word)}\b", text) for word in words):
            return key
    return None


def _label(key: str) -> str:
    return next(s.label for s in STATES if s.key == key)


def _listing(titles: list[str], limit: int = 3) -> str:
    shown = titles[:limit]
    rest = len(titles) - len(shown)
    joined = ", ".join(shown)
    return f"{joined} and {rest} more" if rest > 0 else joined


class Wardrobe:
    """The facts every answer below is drawn from, gathered once."""

    def __init__(self, closet: Closet, miner: Miner, counts: dict[str, int]):
        self.closet = closet
        self.miner = miner
        self.counts = counts
        self.items = closet.items
        self.purchases = miner.purchases

    def wears(self, item: Item) -> int:
        return self.counts.get(item.id, 0)

    def matching(self, text: str) -> tuple[str, list[Item]] | None:
        """Items the question names, by kind, category, colour or title word."""
        for item in self.items:
            kind = (item.kind or item.category).replace("_", " ")
            if kind and re.search(rf"\b{re.escape(kind)}s?\b", text):
                matched = [i for i in self.items if (i.kind or i.category) == item.kind]
                return kind, matched
        for category in {i.category for i in self.items}:
            if re.search(rf"\b{re.escape(category)}s?\b", text):
                return category, [i for i in self.items if i.category == category]
        for colour in {i.color for i in self.items}:
            if re.search(rf"\b{re.escape(colour)}\b", text):
                return colour, [i for i in self.items if i.color == colour]
        return None


# --- answers ----------------------------------------------------------------
# Each takes (text, wardrobe) and returns (answer, facts) or None when it has
# no evidence to stand on.


def _saved(text: str, w: Wardrobe):
    if not re.search(r"\b(saved|saving|savings|pond|skipped)\b", text):
        return None
    state = pond.state()
    if not state["skips"]:
        return (
            "Nothing in the pond yet. It fills the first time you skip something I flagged.",
            state,
        )
    return (
        f"{money(state['saved'])} in the pond, from {state['skips']} "
        f"skip{'' if state['skips'] == 1 else 's'}.",
        state,
    )


def _accuracy(text: str, w: Wardrobe):
    if not re.search(r"\b(accurate|accuracy|right|wrong|track record|score|trust)\b", text):
        return None
    stat = ledger.accuracy()
    if not stat["total"]:
        return (
            "Nothing graded yet, so I have no record to stand on. Every call I make gets "
            "logged and graded later, and you can see the running number on the dashboard.",
            stat,
        )
    return (f"Right {stat['right']} of {stat['total']} times so far. Every call is logged and graded.", stat)


def _gaps(text: str, w: Wardrobe):
    if not re.search(r"\b(gap|gaps|missing|uncovered|need|should i buy|hole|holes)\b", text):
        return None
    gaps = sorted(w.closet.gaps(), key=lambda g: -g["p"])
    if not gaps:
        return ("Nothing uncovered. Every occasion in your life mix has something that serves it.", {"gaps": []})
    worst = gaps[0]
    labels = [g["label"].lower() for g in gaps]
    fix = next(
        (
            candidate
            for candidate in sorted(STOREFRONT, key=lambda c: c.price)
            if (w.closet.evaluate(candidate)["covers_gap"] or {}).get("state") == worst["state"]
        ),
        None,
    )
    answer = f"You have nothing for {_listing(labels)}."
    if fix is not None:
        answer += (
            f" The cheapest thing in this catalog that would cover {labels[0]} "
            f"is {fix.title}, {money(fix.price)}."
        )
    return (answer, {"gaps": gaps, "fix": fix.dict() if fix else None})


def _duplicates(text: str, w: Wardrobe):
    if not re.search(r"\b(duplicate|duplicates|dupes|redundant|too many|same thing|copies)\b", text):
        return None
    piles: dict[str, list[Item]] = {}
    for item in w.items:
        piles.setdefault(item.kind or item.category, []).append(item)
    stacked = sorted([(k, v) for k, v in piles.items() if len(v) > 1], key=lambda kv: -len(kv[1]))
    if not stacked:
        return ("Nothing in here duplicates anything else.", {"piles": []})
    kind, items = stacked[0]
    worn = sum(w.wears(i) for i in items)
    facts = {
        "piles": [{"kind": k, "count": len(v), "wears": sum(w.wears(i) for i in v)} for k, v in stacked],
        "titles": [i.title for i in items],
    }
    return (
        f"{insights.kind_label(kind, len(items)).capitalize()}: {_listing([i.title for i in items])}. "
        f"{worn} wears between them.",
        facts,
    )


def _unworn(text: str, w: Wardrobe):
    if not re.search(r"\b(never worn|unworn|don't wear|dont wear|never wear|least worn|donate|get rid|dead)\b", text):
        return None
    unworn = sorted([i for i in w.items if w.wears(i) == 0], key=lambda i: -i.price)
    if not unworn:
        least = min(w.items, key=w.wears, default=None)
        if least is None:
            return None
        return (
            f"You've worn everything at least once. Your least-used is your {least.title.lower()}, "
            f"{w.wears(least)} wears.",
            {"unworn": [], "least_used": least.title},
        )
    idle = round(sum(i.price for i in unworn))
    safe = set(w.closet.donatable())
    droppable = [i.title for i in unworn if i.id in safe]
    answer = (
        f"{len(unworn)} thing{'' if len(unworn) == 1 else 's'} you've never worn, "
        f"{money(idle)} of them: {_listing([i.title for i in unworn])}."
    )
    if droppable:
        answer += f" You could let {droppable[0]} go without opening a gap."
    return (answer, {"unworn": [i.title for i in unworn], "idle_value": idle, "donatable": droppable})


def _value(text: str, w: Wardrobe):
    if not re.search(r"\b(cost per wear|per wear|best buy|best value|worst value|worth it|value)\b", text):
        return None
    priced = [(i, market.cost_per_wear(i.price, w.wears(i))) for i in w.items]
    worn = [(i, c) for i, c in priced if c is not None]
    if not worn:
        return None
    best = min(worn, key=lambda ic: ic[1])
    worst = max(worn, key=lambda ic: ic[1])
    return (
        f"Your best buy is your {best[0].title.lower()} at ${best[1]:.2f} a wear. "
        f"The worst of what you actually wear is your {worst[0].title.lower()}, ${worst[1]:.2f} a wear.",
        {
            "best": {"title": best[0].title, "cost_per_wear": best[1]},
            "worst": {"title": worst[0].title, "cost_per_wear": worst[1]},
        },
    )


def _spend(text: str, w: Wardrobe):
    if not re.search(r"\b(spend|spent|spending|cost me|how much.*(clothes|closet))\b", text):
        return None
    summary = insights.summarise(w.items, w.counts, w.purchases)
    spent = round(sum(i.price for i in w.items))
    worth = round(sum(market.resale(i, w.wears(i)) for i in w.items))
    return (
        f"{money(spent)} on what you still own, worth about {money(worth)} secondhand today. "
        f"{money(summary['spent_recently'])} of it in the last {summary['recent_days']} days.",
        {"spent": spent, "worth_now": worth, "recent": summary["spent_recently"], "days": summary["recent_days"]},
    )


def _returns(text: str, w: Wardrobe):
    if not re.search(r"\b(return|returns|returned|send back|sent back|refund)\b", text):
        return None
    baseline = w.miner.baseline_return_rate()
    returned = [p for p in w.purchases if p.returned]
    if not returned:
        return None
    piles: dict[tuple[str, str | None], list] = {}
    for purchase in w.purchases:
        piles.setdefault((purchase.kind, purchase.size), []).append(purchase)
    worst = max(
        (pair for pair in piles.items() if len(pair[1]) >= 3),
        key=lambda pair: sum(p.returned for p in pair[1]) / len(pair[1]),
        default=None,
    )
    answer = f"You send back {round(100 * baseline)}% of what you buy: {len(returned)} of {len(w.purchases)}."
    facts = {"baseline": round(baseline, 3), "returned": len(returned), "bought": len(w.purchases)}
    if worst is not None:
        (kind, size), rows = worst
        sent = sum(p.returned for p in rows)
        label = kind.replace("_", " ")
        sized = f"size-{size} " if size else ""
        answer += f" The worst of it is {sized}{label}: {sent} of {len(rows)} returned."
        facts["worst"] = {"kind": kind, "size": size, "returned": sent, "bought": len(rows)}
    return (answer, facts)


def _late_night(text: str, w: Wardrobe):
    if not re.search(r"\b(late|night|nights|after 11|11pm|midnight|time of day)\b", text):
        return None
    returned, bought = w.miner.by_hour_bucket(late=True)
    if bought < 3:
        return None
    share, total = w.miner.late_night_share_of_returns()
    rate = returned / bought
    baseline = w.miner.baseline_return_rate()
    return (
        f"{round(100 * rate)}% of what you buy after 11pm comes back, against "
        f"{round(100 * baseline)}% the rest of the day. It accounts for {share} of your {total} returns.",
        {
            "late_rate": round(rate, 3),
            "baseline": round(baseline, 3),
            "bought_late": bought,
            "share_of_returns": share,
            "returns": total,
        },
    )


def _overexposure(text: str, w: Wardrobe):
    if not re.search(r"\b(overexposed|over exposed|concentrat|unbalanced|balance|lopsided)\b", text):
        return None
    top = w.closet.concentration()
    gaps = w.closet.gaps()
    answer = (
        f"{round(100 * top['top_share'])}% of your closet is built for {top['top_label'].lower()}: "
        f"{top['top_count']} pieces."
    )
    if gaps:
        answer += f" Meanwhile you have nothing for {gaps[0]['label'].lower()}."
    return (answer, {"concentration": top, "gaps": gaps})


def _for_occasion(text: str, w: Wardrobe):
    state_key = _state_in(text)
    if state_key is None:
        return None
    covering = w.closet.serving(state_key)
    label = _label(state_key).lower()
    if not covering:
        return (
            f"Nothing in your closet covers {label}. It's the clearest hole you have.",
            {"state": state_key, "covers": []},
        )
    titles = [item.title for item, _ in covering]
    worn = sum(w.wears(item) for item, _ in covering)
    if len(covering) == 1:
        return (
            f"One thing covers {label}: {titles[0]}, {worn} wears.",
            {"state": state_key, "covers": titles, "wears": worn},
        )
    return (
        f"{len(covering)} things for {label}, best first: {_listing(titles)}. "
        f"{worn} wears between them.",
        {"state": state_key, "covers": titles, "wears": worn},
    )


def _count(text: str, w: Wardrobe):
    match = w.matching(text)
    if match is None:
        return None
    subject, items = match
    if not _QUANTITY.search(text) and not re.search(r"\b(own|have|got)\b", text):
        return None
    worn = sum(w.wears(i) for i in items)
    paid = round(sum(i.price for i in items))
    return (
        f"{insights.kind_label(subject.replace(' ', '_'), len(items)).capitalize()}: "
        f"{_listing([i.title for i in items])}. {money(paid)} of them, {worn} wears between them.",
        {"subject": subject, "count": len(items), "wears": worn, "paid": paid},
    )


def _summary(text: str, w: Wardrobe):
    if not re.search(r"\b(my closet|my wardrobe|how do i shop|tell me about|summar|overview|anything else)\b", text):
        return None
    summary = insights.summarise(w.items, w.counts, w.purchases)
    return (" ".join(summary["lines"][:3]), summary)


# Order is the priority. A question naming an occasion is about that occasion
# even when it also says "own"; savings and accuracy are asked about the duck
# itself and never about a garment.
ANSWERS = [
    ("saved", _saved),
    ("accuracy", _accuracy),
    ("occasion", _for_occasion),
    ("gaps", _gaps),
    ("duplicates", _duplicates),
    ("unworn", _unworn),
    ("late_night", _late_night),
    ("returns", _returns),
    ("overexposure", _overexposure),
    ("spend", _spend),
    ("value", _value),
    ("count", _count),
    ("summary", _summary),
]

EXAMPLES = [
    "What am I missing?",
    "What do I own for rain?",
    "What do I never wear?",
    "How much have I spent?",
    "How often are you right?",
]


def answer(question: str, closet: Closet, miner: Miner, counts: dict[str, int]) -> dict | None:
    """The best-supported wardrobe answer, or None if nothing here fits."""
    text = re.sub(r"[^\w\s']", " ", question.lower()).strip()
    if not text:
        return None
    wardrobe = Wardrobe(closet, miner, counts)
    for intent, handler in ANSWERS:
        found = handler(text, wardrobe)
        if found is not None:
            line, facts = found
            return {"intent": intent, "answer": line, "facts": facts, "scope": "wardrobe"}
    return None


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    item_id: str | None = None
    item: dict | None = None
    now_hour: int | None = Field(default=None, ge=0, le=23)


@router.post("/ask")
def ask(req: Question) -> dict:
    """Ask Puddle anything about the closet, with or without an item in front of you.

    With an item in context an item-scoped question still goes to the checkout
    handler, so the panel and the duck never disagree about the same garment.
    """
    from .app import _context
    from .voice import VoiceQuestion, intent, respond

    text = req.question.strip()
    if not text:
        raise HTTPException(422, "Please ask a question.")
    has_item = req.item_id is not None or req.item is not None
    if has_item and intent(text)[0] != "unknown":
        return respond(
            VoiceQuestion(transcript=text, item_id=req.item_id, item=req.item, now_hour=req.now_hour)
        )
    closet, miner, counts = _context()
    found = answer(text, closet, miner, counts)
    if found is None:
        return {
            "intent": "unknown",
            "scope": "wardrobe",
            "answer": "I can only answer from your own history. Try: " + " ".join(EXAMPLES[:3]),
            "facts": {},
            "examples": EXAMPLES,
        }
    return {**found, "question": text, "examples": EXAMPLES}
