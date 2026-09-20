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
from .catalog import CLOSET, STOREFRONT, Item
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

# What the shopper calls a whole rail of the closet. The catalogue's category
# names are filing labels; nobody asks how many "outers" they own.
CATEGORY_WORDS = {
    "outer": ("jacket", "coat", "outerwear"),
    "top": ("top", "shirt", "sweater"),
    "bottom": ("bottom",),
    "shoes": ("shoe", "footwear"),
    "dress": ("dress",),
}

# Words for a group of kinds rather than a whole rail: trousers are not skirts.
KIND_WORDS = {
    "trousers": ("trouser", "pant", "slack"),
}
KIND_GROUPS = {
    "trousers": ("jeans", "sweatpants", "leggings"),
}

_QUANTITY = re.compile(
    r"\b(how many|how much|do i own|do i have|what do i own|what do i have|own any|have any|"
    r"count|recount|tally|enumerate|number of)\b"
)

# What the question is *about* sits after one of these: a preposition, a
# determiner, or a verb of owning and buying. "Spent on Bitcoin" and "own for
# rain" are the same grammar, and only one of the two subjects exists here.
_SUBJECT = re.compile(
    r"\b(?:if|when|whenever|unless|while|whether|because|since|though|although|until|"
    r"on|in|at|for|about|from|with|by|near|among|between|versus|than|like|"
    r"into|onto|off|via|during|before|after|inside|outside|around|"
    r"my|your|a|an|the|this|that|more|another|other|new|some|any|\w+ing|"
    r"say|namely|specifically|such as|including|eg|ie|"
    r"do|does|did|is|are|was|were|has|have|had|"
    r"can|could|may|might|must|shall|should|will|would|"
    r"buy|bought|own|owns|wear|spend|spent)\s+(?=(\w+))"
)

# A question has to be about the shopper's own things before any handler gets
# to read it. Without this, an occasion word inside "will it rain in Boston"
# looks exactly like one inside "what do I own for rain".
_MINE = re.compile(
    r"\b(i|i'm|im|i've|ive|my|mine|me|we|our|you|your|puddle|closet|wardrobe|clothes|outfit|"
    r"own|owned|wear|worn|wearing|buy|bought|purchase|purchases|spend|spent|return|returns|"
    r"returned|saved|savings|pond|skip|skipped|donate)\b"
)

# Words that name nothing in particular: question words, verbs about shopping,
# units of time. Anything outside these and the catalogue's own vocabulary is a
# subject this brain has never heard of -- Tesla stock, Mars, Bitcoin -- and
# borrowing wardrobe grammar around it must not buy an answer.
_GENERIC = set(
    """a an the this that these those there here my mine me you your yours we our us i im ive
    of to for in on at from with without about into over under by off out up down between
    and or but not no nor if then than as so such too very also else own owns owned
    do does did doing done have has had having am is are was were be been being get got
    can could should would will shall may might must let lets
    what which who whose when where why how much many more most less least fewer
    often ever never always again still yet just only same other another anything something
    everything nothing thing things stuff item items piece pieces bit lot lots bunch few couple
    clothes clothing outfit outfits closet wardrobe rotation style wear wears wearing worn
    buy buys buying bought purchase purchases purchased shop shopping shopped order ordered
    spend spends spending spent cost costs costing money budget price prices paid pay worth value
    return returns returned refund refunds send sent back keep keeping rid dead idle
    save saves saved saving savings pond skip skips skipped donate donating
    gap gaps hole holes missing uncovered need needs needed cover covers covered serve serves
    duplicate duplicates dupes redundant copies overexposed unbalanced balance lopsided
    concentrated summary summarise summarize overview tell told say said show shows
    right wrong accurate accuracy track record score trust often times
    day days night nights morning afternoon evening late later time today tomorrow yesterday
    week weeks month months year years season seasons now recently lately ago tonight weekend
    happen happens happened doing well good bad better worse best worst first last next
    per each all any some enough really actually please thanks ok okay
    total altogether overall average percentage percent rate ratio share number count
    one two three four five six seven eight nine ten dozen pair pairs half twice
    currently usually normally mostly suitable appropriate sensible useful
    suggest suggests suggestion recommend recommends advice think thoughts tally tallies
    enumerate enumerated recount recounts present anymore forked fork excluding excepting
    except besides apart aside minus collecting collect collects gathering gather dust
    barely rarely seldom hardly sitting unused spare
    dont doesnt didnt wont cant isnt arent wasnt havent hasnt shouldnt couldnt wouldnt
    whats thats theres heres lets youre theyre
    size sizes fit fits color colors colour colours brand brands
    someone somebody anyone anybody everyone nobody people person myself yourself
    kindly maybe perhaps probably honestly roughly about approximately exactly quite
    pretty bit rather fairly around nearly almost over under above below within
    give given list listing name names describe description break down breakdown
    compare comparison worth while going out formal casual work gym rain snow cold warm
    hot summer winter spring autumn fall weather occasion occasions event events
    wedding interview party date office travel trip holiday vacation
    left over leftover unused unworn untouched forgotten hanging sitting
    end up ends ended instead rather worthwhile sensible smart wise
    honest truth truthfully seriously curious wondering wonder know knows
    help helping useful usefully anyway besides currently presently
    waste wasted wasting predict predicts prediction predictions predicted
    balanced unbalanced worn wears worth accurate inaccurate mistake mistakes
    regret regrets regretted flag flagged flags ledger history log logged
    quick quickly simple simply brief briefly ideal ideally possess possesses
    proportion proportions splurge splurged gather gathering dust habit habits
    once twice already truly basically essentially exactly specifically""".split()
)

# Colours and fabrics a shopper may reasonably name. One the closet does not
# stock is a real question with a zero answer, not a stranger.
COLOUR_WORDS = set(
    """black white grey navy blue red green yellow orange pink purple brown beige
    cream ivory tan khaki olive burgundy maroon charcoal silver gold""".split()
)
FABRIC_WORDS = set(
    """denim leather suede cotton wool linen silk satin cashmere fleece nylon polyester
    mesh sequin corduroy velvet knit tweed canvas rubber""".split()
)
QUALITY_WORDS = COLOUR_WORDS | FABRIC_WORDS | {"gray"}

# One spelling of a colour, so "gray crewneck" finds the Grey one.
SPELLINGS = {"gray": "grey"}


def _vocabulary() -> set[str]:
    """Every word the catalogue and the state model can speak about."""
    words: set[str] = set()
    for item in CLOSET + STOREFRONT:
        for field in (item.title, item.category, item.color, item.material, item.kind or ""):
            words.update(re.findall(r"\w+", field.lower()))
    for group in STATE_WORDS.values():
        words.update(word for phrase in group for word in phrase.split())
    for state in STATES:
        words.update(re.findall(r"\w+", state.label.lower()))
    words.update(word for group in KIND_WORDS.values() for word in group)
    words.update(word for group in CATEGORY_WORDS.values() for word in group)
    return words | QUALITY_WORDS


_VOCABULARY = _vocabulary()


def _stems(word: str) -> set[str]:
    """The word as it might be listed: dresses -> dress, wasted -> waste."""
    forms = {word}
    for ending, stem in (("es", 2), ("s", 1), ("ing", 3), ("ed", 2), ("ly", 2)):
        if word.endswith(ending) and len(word) - stem >= 3:
            cut = word[:-stem]
            forms.update({cut, cut + "e"})
            if len(cut) > 3 and cut[-1] == cut[-2]:  # skipping -> skip
                forms.add(cut[:-1])
    return forms


def _stranger(word: str) -> bool:
    """A word this closet has no reading of: Tesla, Mars, Bitcoin, Taylor."""
    plain = word.replace("'", "").lower()
    if len(plain) <= 2 or plain.isdigit():
        return False
    return not _stems(plain) & (_GENERIC | _VOCABULARY)


def _known(text: str) -> bool:
    """False as soon as the question names something the closet has never seen.

    Only the noun slots are read. A stranger is a stranger where a subject goes
    -- "spent on Bitcoin" -- and beside a garment the closet does own: "gucci
    jackets", "crewnecks rihanna owns", "for rain, paris". Everywhere else the
    shopper may say what they like, because English is larger than any list.
    """
    if any(_stranger(word) for word in _SUBJECT.findall(text)):
        return False
    words = text.split()
    for i, word in enumerate(words):
        if not _stems(word) & _VOCABULARY:
            continue
        neighbours = words[max(i - 1, 0) : i] + words[i + 1 : i + 2]
        if any(_stranger(other) for other in neighbours):
            return False
    return True


def _plural(subject: str, qualities: list[str]) -> str:
    """How the shopper would say it: black tops, pairs of jeans, rain boots."""
    spelled = insights.KIND_PLURAL.get(subject.replace(" ", "_"))
    if spelled is None or qualities:
        spelled = subject if subject.endswith("s") else subject + ("es" if subject[-1] in "sxz" else "s")
    return " ".join([*qualities, spelled])


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

    def matching(self, text: str) -> tuple[str, list[str], list[Item]] | None:
        """Items the question names, by kind, category, colour or title word.

        A colour or fabric in the question narrows the answer, and narrows it to
        nothing when the closet holds no such thing: red jeans are not jeans.
        """
        found = self._named(text)
        if found is None:
            return None
        subject, items, _ = found
        qualities = [q for q in self._qualities(text) if q not in subject.split()]
        refused = [q for q in qualities if self._denied(text, q)]
        wanted = [q for q in qualities if q not in refused]
        spoken: list[str] = []
        if re.search(r"\bor\b", text):
            # "black or white cotton tops" is two colours and one fabric: an
            # "or" widens within a kind of quality, never across two of them.
            for group, field in ((COLOUR_WORDS, "color"), (FABRIC_WORDS, "material")):
                said = [q for q in wanted if q in group]
                if len(said) < 2:
                    continue
                items = [i for i in items if getattr(i, field) in said]
                wanted = [q for q in wanted if q not in said]
                spoken.append(" or ".join(said))
        for quality in wanted:
            items = [i for i in items if quality in (i.color, i.material)]
        for quality in refused:
            items = [i for i in items if quality not in (i.color, i.material)]
        return subject, spoken + wanted + [f"non-{q}" for q in refused], items

    @staticmethod
    def _denied(text: str, quality: str) -> bool:
        """"Tops that are not black" asks for the rest of the rail."""
        said = [q for q in (quality, *SPELLINGS) if SPELLINGS.get(q, q) == quality]
        return any(
            re.search(rf"\b(not|non|without|except|excepting|excluding|besides|apart from|"
                      rf"other than|isn't|aren't|don't|dont|doesn't|doesnt)\b[\w\s]{{0,12}}?"
                      rf"\b{re.escape(q)}\b", text)
            for q in said
        )

    def _qualities(self, text: str) -> list[str]:
        """Colours and fabrics named in the question, stocked here or not."""
        known = {i.color for i in self.items} | {i.material for i in self.items}
        spoken = {q for q in known if q} | QUALITY_WORDS
        found = [q for q in sorted(spoken) if re.search(rf"\b{re.escape(q)}\b", text)]
        said = [SPELLINGS.get(q, q) for q in found]
        return [q for q in dict.fromkeys(said) if not any(q != o and q in o.split() for o in said)]

    def names_a_rail(self, text: str) -> bool:
        """True when the question names a kind or a rail, not just a stray word.

        "How many rain boots" is a count; "what do I own for rain" is coverage.
        """
        found = self._named(text)
        return found is not None and found[2]

    def _named(self, text: str) -> tuple[str, list[Item], bool] | None:
        # Longest kind first, so "rain boots" beats "boots"; a plain "boots"
        # still gathers the rain pair, which is what the shopper means.
        kinds = sorted({i.kind or i.category for i in self.items}, key=len, reverse=True)
        for kind in kinds:
            spoken = kind.replace("_", " ")
            if re.search(rf"\b{re.escape(spoken)}(?:s|es)?\b", text):
                return (
                    spoken,
                    [
                        i
                        for i in self.items
                        if (i.kind or i.category).replace("_", " ").endswith(spoken)
                    ],
                    True,
                )
        for label, words in KIND_WORDS.items():
            if any(re.search(rf"\b{word}(?:s|es)?\b", text) for word in words):
                kinds = KIND_GROUPS[label]
                return label, [i for i in self.items if i.kind in kinds], True
        for category, words in CATEGORY_WORDS.items():
            if any(re.search(rf"\b{word}(?:s|es)?\b", text) for word in (category, *words)):
                return words[0], [i for i in self.items if i.category == category], True
        for colour in {i.color for i in self.items}:
            if re.search(rf"\b{re.escape(colour)}\b", text):
                return f"{colour} piece", [i for i in self.items if i.color == colour], False
        titles = {word for i in self.items for word in re.findall(r"\w{4,}", i.title.lower())}
        for word in sorted(titles):
            if re.search(rf"\b{re.escape(word)}(?:s|es)?\b", text):
                return word, [i for i in self.items if word in i.title.lower()], False
        return None


def _counting(text: str, w: Wardrobe) -> bool:
    """"How many rain boots do I own" is a count, not a question about rain."""
    return bool(_QUANTITY.search(text)) and w.names_a_rail(text)


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
    # "How many jeans do I have right now" is a count; "right now" is a time.
    if re.search(r"\bright (now|away|then)\b", text) or _counting(text, w):
        return None
    stat = ledger.accuracy()
    if not stat["total"]:
        return (
            "Nothing graded yet, so I have no record to stand on. Every call I make is "
            "logged now and graded once you have worn or returned the thing.",
            stat,
        )
    return (f"Right {stat['right']} of {stat['total']} times so far. Every call is logged and graded.", stat)


def _gaps(text: str, w: Wardrobe):
    if not re.search(r"\b(gap|gaps|missing|uncovered|hole|holes)\b|\bwhat (do|should) i need\b", text):
        return None
    if _counting(text, w):
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
    if not re.search(
        r"\b(never worn|unworn|never wear|least worn|worn the least|wearing the least|"
        r"wear the least|gathering dust|collecting dust|donate|get rid|dead)\b|"
        r"\b(don't|dont|doesn't|doesnt|haven't|havent|hasn't|hasnt|not|barely|rarely|seldom)\b"
        r"[\w\s']{0,12}?\b(worn|wear|wearing)\b",
        text,
    ):
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
    if not re.search(
        r"\b(cost per wear|per wear|best buy|best value|worst value|worth it|"
        r"best purchase|worst purchase|best buys)\b",
        text,
    ) or not re.search(
        r"\b(my|i|mine|closet|wardrobe|own)\b", text
    ):
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
    if not re.search(r"\b(return|returns|returned|returning|send back|sent back|refund|refunds)\b", text):
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
    day_returned, day_bought = w.miner.by_hour_bucket(late=False)
    daytime = day_returned / day_bought if day_bought else 0.0
    return (
        f"{round(100 * rate)}% of what you buy after 11pm comes back, against "
        f"{round(100 * daytime)}% the rest of the day. It accounts for {share} of your {total} returns.",
        {
            "late_rate": round(rate, 3),
            "daytime_rate": round(daytime, 3),
            "bought_daytime": day_bought,
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
    if _counting(text, w):
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
    subject, qualities, items = match
    if not _QUANTITY.search(text) and not re.search(r"\b(own|have|got)\b", text):
        return None
    named = " ".join([*qualities, subject])
    worn = sum(w.wears(i) for i in items)
    paid = round(sum(i.price for i in items))
    if not items:
        return (
            f"None: you own no {_plural(subject, qualities)}.",
            {"subject": named, "count": 0, "wears": 0, "paid": 0},
        )
    if len(items) == 1:
        return (
            f"One: {items[0].title}. {money(paid)}, {worn} wears.",
            {"subject": named, "count": 1, "wears": worn, "paid": paid},
        )
    return (
        f"{len(items)} {_plural(subject, qualities)}: {_listing([i.title for i in items])}. "
        f"{money(paid)} of them, {worn} wears between them.",
        {"subject": named, "count": len(items), "wears": worn, "paid": paid},
    )


def _summary(text: str, w: Wardrobe):
    if not re.search(
        r"\b(my closet|my wardrobe|how do i shop|how am i doing|summar|overview|anything else)\b", text
    ):
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
    if not text or not _known(text):
        return None
    wardrobe = Wardrobe(closet, miner, counts)
    # "How many tops are not black" leaves the owner unsaid; counting a rail of
    # this closet is about this closet, and a stranger in it was refused above.
    if not _MINE.search(text) and not _counting(text, wardrobe):
        return None
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
