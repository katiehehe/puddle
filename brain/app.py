"""Puddle brain API.

One brain, two surfaces: the MV3 extension calls /score_item and /checkout at
the moment of purchase, the dashboard calls /portfolio. The response shapes are
the contract both surfaces were written against.
"""

from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import (
    advice,
    ask,
    closet_store,
    desk,
    history,
    insights,
    ledger,
    market,
    occasions,
    payments,
    pond,
    storage,
    voice,
)
from .catalog import CLOSET, STOREFRONT, Item, coerce_item
from .miner import Miner, rank, verdict
from .portfolio import Closet
from .states import life_mix

# The dashboard is a planning surface, not a 2am checkout. Scoring it at the
# wall-clock hour let the late-night signal leak into every recommendation.
DASHBOARD_HOUR = 14
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

DEFAULT_BUDGET = 500.0

app = FastAPI(title="Puddle Brain", version="0.3.0")
app.include_router(voice.router)
app.include_router(ask.router)
app.mount("/demo-assets", StaticFiles(directory=PROJECT_ROOT / "extension"), name="demo-assets")

DASHBOARD_DIST = PROJECT_ROOT / "web" / "dist"
if DASHBOARD_DIST.is_dir():
    app.mount("/dashboard", StaticFiles(directory=DASHBOARD_DIST, html=True), name="dashboard")


@app.get("/", response_class=HTMLResponse)
def home():
    """The marketing page and the dashboard are the same bundle; assets are
    absolute under /dashboard/, so serving its index here just works."""
    index = DASHBOARD_DIST / "index.html"
    if not index.is_file():
        return HTMLResponse("<h1>Puddle brain</h1><p>Dashboard not built. Run <code>npm run build</code>.</p>")
    return HTMLResponse(index.read_text(encoding="utf-8"))


@app.get("/demo", response_class=HTMLResponse)
def voice_demo():
    page = (PROJECT_ROOT / "mock-shop" / "index.html").read_text(encoding="utf-8")
    page = page.replace("<body>", '<body data-puddle-mode="web">')
    # Same shop, duck and voice controller as the extension. Only transport differs.
    scripts = '<script src="/demo-assets/transport.js"></script>'
    scripts += '<script src="/demo-assets/speech.js"></script>'
    scripts += '<script src="/demo-assets/voice.js"></script>'
    scripts += '<script src="/demo-assets/content.js"></script>'
    return page.replace("</body>", scripts + "</body>")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _context() -> tuple[Closet, Miner, dict[str, int]]:
    """The closet as it stands: seeded, bought through the duck, and typed in.

    Anything the user adds has to land here or nowhere -- this is the closet
    every score, gap and duplicate count is measured against.
    """
    owned = CLOSET + [Item(**raw) for raw in storage.owned()] + closet_store.owned_items()
    counts = closet_store.merge_counts(history.wear_counts())
    mix = life_mix(_wear_events(owned))
    return Closet(owned, mix), Miner(_purchases(), counts), counts


def _purchases() -> list[history.Purchase]:
    return history.purchases() + closet_store.purchases()


def _wear_events(owned: list[Item]) -> list[dict]:
    return [w.dict() for w in history.wears()] + closet_store.wear_events({i.id: i for i in owned})


class ScoreRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    now_hour: int | None = Field(default=None, ge=0, le=23)


class CheckoutRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    prediction_id: str | None = None
    event_id: str | None = Field(default=None, min_length=1, max_length=128)


class SkipRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    prediction_id: str | None = None
    event_id: str | None = Field(default=None, min_length=1, max_length=128)


class ActionRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=128)
    item_id: str | None = None
    item: dict | None = None
    prediction_id: str | None = None
    action: Literal["skip", "buy"]


def _resolve(req) -> Item:
    try:
        item = coerce_item(req.item if req.item is not None else {"id": req.item_id})
        if item is None:
            raise HTTPException(404, "item not found; pass item_id or a complete item")
        if (
            not item.id
            or not math.isfinite(item.price)
            or item.price < 0
            or not math.isfinite(item.quality)
            or not 0 <= item.quality <= 1
            or not 1 <= item.formality <= 5
            or not 1 <= item.warmth <= 5
        ):
            raise ValueError("invalid item attributes")
        return item
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError) as exc:
        raise HTTPException(422, "invalid item attributes") from exc


def _donate(closet: Closet, holdings: list[dict]) -> list[dict]:
    """Dead weight you can actually part with.

    Ranked by expected payoff, but filtered to items whose removal leaves every
    covered occasion still covered -- otherwise the panel tells you to donate
    the one thing holding up a state and the radar then paints it as a gap.
    """
    safe = set(closet.donatable())
    return [h for h in sorted(holdings, key=lambda h: h["expected_payoff"]) if h["id"] in safe][:2]


def recommend(item, closet, miner, now):
    evaluation = closet.evaluate(item)
    insights = rank(
        [
            miner.return_pattern(item),
            miner.redundancy(item, evaluation),
            miner.time_pattern(now),
            miner.coverage_gap(evaluation),
            miner.overexposure(closet.concentration(), evaluation, closet.gaps()),
        ]
    )
    # Return/redundancy evidence takes precedence over portfolio improvement.
    warnings = [i for i in insights if i["type"] in ("return_pattern", "redundancy", "overexposure")]
    if warnings:
        decision = "skip"
        insights = [i for i in insights if i["type"] != "coverage_gap"]
    elif evaluation["alpha"] > 0:
        decision = "buy"
    else:
        decision = "neutral"
    state, confidence, speak = verdict(insights, item.price)
    if decision == "skip" and speak:
        state = "concerned"
    return {
        "decision": decision,
        "reasons": [i["line"] for i in insights],
        "portfolio": evaluation,
        "insights": insights,
        "headline": insights[0]["line"] if insights else "No strong pattern in your history for this item.",
        "duck_state": state,
        "confidence": round(confidence, 3),
        "speak": speak,
    }


def _shopping_context(item: Item, evaluation: dict, counts: dict[str, int]) -> dict:
    """The checkout facts in shopper's terms: how many you own, how much they
    get worn, whether this price is good, what it works out to per wear."""
    purchases = _purchases()
    owned = evaluation["redundant_with"]
    owned_wears = sum(counts.get(d["id"], 0) for d in owned)
    most_worn = max(owned, key=lambda d: counts.get(d["id"], 0), default=None)
    return {
        "owned_count": len(owned),
        "owned_titles": [d["title"] for d in owned],
        "owned_wears": owned_wears,
        "closest": (
            {"title": most_worn["title"], "wears": counts.get(most_worn["id"], 0)} if most_worn else None
        ),
        "resale": market.resale(item, 0),
        "per_wear_at": {n: round(item.price / n, 2) for n in (5, 10, 20)},
        **market.deal(item, purchases),
    }


def _act(req, action):
    item = _resolve(req)
    # Legacy clients can retry the same item/prediction safely. New clients
    # should supply their own event_id and retain it until the request succeeds.
    event_id = req.event_id or f"legacy:{action}:{req.prediction_id or storage.variant(item)}"
    try:
        result = storage.act(
            event_id,
            item,
            action,
            req.prediction_id,
            pay=(lambda: payments.get_provider().pay(item.price, item.id).dict()) if action == "buy" else None,
        )
        return result
    except storage.Conflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404, "prediction not found") from exc


# --- the checkout intervention ---------------------------------------------
@app.post("/score_item")
def score_item(req: ScoreRequest) -> dict:
    item = _resolve(req)
    closet, miner, counts = _context()

    now = datetime.now()
    if req.now_hour is not None:
        now = now.replace(hour=req.now_hour, minute=40)

    result = recommend(item, closet, miner, now)
    shopping = _shopping_context(item, result["portfolio"], counts)
    prediction_id = storage.record(
        item, result["headline"], result["decision"], result["duck_state"], result["confidence"]
    )
    return {
        "item": item.dict(),
        **result,
        "shopping": shopping,
        "advice": advice.advise(
            item,
            result["portfolio"],
            desk.quote(item, closet, miner, counts, now),
            shopping,
            closet.items,
            counts,
            occasions.coverage(closet),
            occasions.usage(_wear_events(closet.items)),
            brand=str((req.item or {}).get("brand", "")),
            brands=advice.brand_stats(closet_store.rows(), counts),
        ),
        "prediction_id": prediction_id,
        "accuracy": ledger.accuracy(),
    }


@app.post("/actions")
def record_action(req: ActionRequest):
    return _act(req, req.action)


@app.get("/actions")
def action_history():
    return {"actions": storage.actions(), "pond": pond.state()}


@app.post("/checkout")
def checkout(req: CheckoutRequest) -> dict:
    result = _act(req, "buy")
    return {**result["event"]["payment"], **result}


@app.post("/skip")
def skip(req: SkipRequest) -> dict:
    return _act(req, "skip")


# --- the dashboard ----------------------------------------------------------
@app.get("/portfolio")
def portfolio(now_hour: int | None = None, budget: float = DEFAULT_BUDGET) -> dict:
    if now_hour is not None and not 0 <= now_hour <= 23:
        raise HTTPException(422, "now_hour must be between 0 and 23")
    if not math.isfinite(budget) or budget <= 0:
        raise HTTPException(422, "budget must be a positive number")
    now = datetime.now().replace(hour=DASHBOARD_HOUR if now_hour is None else now_hour, minute=40)
    closet, miner, counts = _context()

    holdings = []
    for idx, item in enumerate(closet.items):
        wears = counts.get(item.id, 0)
        dupes = [d["id"] for d in closet.evaluate(item)["redundant_with"] if d["id"] != item.id]
        holdings.append(
            {
                "id": item.id,
                "title": item.title,
                "category": item.category,
                "price": item.price,
                "wears": wears,
                "expected_payoff": round(float(closet.mu[idx]), 3),
                "weight": round(float(closet.w[idx]), 4),
                "cost_per_wear": round(item.price / max(wears, 1), 2),
                "redundant_with": dupes,
            }
        )

    buys, skips, neutral = [], [], []
    owned_variants = {storage.variant(i) for i in closet.items}
    for candidate in STOREFRONT:
        if storage.variant(candidate) in owned_variants:
            continue
        result = recommend(candidate, closet, miner, now)
        ev = result["portfolio"]
        rec = {
            "decision": result["decision"],
            "reasons": result["reasons"],
            "id": candidate.id,
            "title": candidate.title,
            "price": candidate.price,
            "alpha": ev["alpha"],
            "sharpe_after": ev["style_sharpe_after"],
            # PRD 3.2 ranks by marginal Sharpe per dollar, not raw alpha: a
            # $320 coat with big alpha should not crowd out two cheap fixes.
            "sharpe_per_dollar": round((ev["style_sharpe_after"] - ev["style_sharpe_before"]) / candidate.price, 6),
            "covers_gap": ev["covers_gap"]["label"] if ev["covers_gap"] else None,
            "redundant_with": [d["id"] for d in ev["redundant_with"]],
        }
        {"buy": buys, "skip": skips, "neutral": neutral}[result["decision"]].append(rec)
    buys.sort(key=lambda r: -r["sharpe_per_dollar"])

    spent, picked = 0.0, []
    for b in buys:
        if b["sharpe_per_dollar"] <= 0 or spent + b["price"] > budget:
            continue
        picked.append(b)
        spent += b["price"]

    return {
        "style_sharpe": round(closet.sharpe, 3),
        "risk_free": round(closet.rf, 3),
        "coverage": [
            {"state": c["label"], "coverage": c["best"], "p": c["p"], "covered": c["covered"]}
            for c in closet.coverage()
        ],
        "holdings": holdings,
        "rebalance": {
            "buy": picked,
            "skip": skips,
            "neutral": neutral,
            "donate": _donate(closet, holdings),
            "budget": budget,
            "spent": round(spent, 2),
        },
        "overexposure": closet.concentration(),
        "pond": pond.state(),
        "ledger": {"predictions": ledger.entries(), "accuracy": ledger.accuracy_label()},
    }


@app.get("/desk/{item_id}")
def desk_quote(item_id: str, now_hour: int | None = None) -> dict:
    """The same item, quoted as a trade: ask, fair bid, EV against her history."""
    if now_hour is not None and not 0 <= now_hour <= 23:
        raise HTTPException(422, "now_hour must be between 0 and 23")
    item = next((i for i in CLOSET + STOREFRONT if i.id == item_id), None)
    if item is None:
        raise HTTPException(404, "unknown item")
    closet, miner, counts = _context()
    now = datetime.now().replace(hour=DASHBOARD_HOUR if now_hour is None else now_hour, minute=40)
    return desk.quote(item, closet, miner, counts, now)


@app.get("/closet")
def closet_items() -> dict:
    closet, _, counts = _context()
    return {
        "closet": [
            {**item.dict(), "wears": counts.get(item.id, 0), "expected_payoff": round(float(closet.mu[i]), 3)}
            for i, item in enumerate(closet.items)
        ]
    }


@app.get("/me")
def me() -> dict:
    """Everything the shopping dashboard needs: what you own, what you bought,
    what it's worth, and what your own history says about how you shop."""
    closet, _, counts = _context()
    purchases = _purchases()
    entries = closet_store.rows()
    extras = {e["id"]: e for e in entries}

    wardrobe = [
        {
            **item.dict(),
            **market.valuation(item, counts.get(item.id, 0), purchases),
            "duplicates": [d["title"] for d in closet.evaluate(item)["redundant_with"] if d["id"] != item.id],
            "tags": occasions.tags(item),
            "brand": extras.get(item.id, {}).get("brand", ""),
            "photo": extras.get(item.id, {}).get("photo", ""),
            "yours": item.id in extras,
        }
        for item in closet.items
    ]
    coverage = occasions.coverage(closet)
    usage = occasions.usage(_wear_events(closet.items))

    # Their own entries first: those are the ones they can edit and wear-log.
    mine = [_purchase_row(e, counts) for e in entries]
    owned_by_title = {item.title: item for item in closet.items}
    recent = []
    for p in sorted(history.purchases(), key=lambda p: p.bought_at, reverse=True)[:12]:
        owned = owned_by_title.get(p.title)
        wears = counts.get(owned.id, 0) if owned else 0
        recent.append(
            {
                "id": p.id,
                "title": p.title,
                "category": p.category,
                "price": p.price,
                "bought_at": p.bought_at,
                "returned": p.returned,
                "return_reason": p.return_reason,
                "in_closet": owned is not None,
                "wears": wears if owned else None,
                "worth_now": market.resale(owned, wears) if owned else None,
                "cost_per_wear": market.cost_per_wear(p.price, wears) if owned else None,
                "brand": "",
                "size": p.size,
                "color": "",
                "photo": "",
                "notes": "",
                "source_url": "",
                "archived": p.returned,
                "archive_reason": p.return_reason,
                "yours": False,
            }
        )

    spent = round(sum(i["paid"] for i in wardrobe), 2)
    worth = round(sum(i["worth_now"] for i in wardrobe), 2)
    return {
        "closet": wardrobe,
        "purchases": mine + recent,
        "shopping": insights.summarise(closet.items, counts, purchases),
        "coverage": coverage,
        "usage": usage,
        "notices": insights.notices(closet.items, counts, coverage),
        "value": {
            "spent": spent,
            "worth_now": worth,
            "value_retained": round(worth / spent, 3) if spent else 0.0,
            "saved": pond.state()["saved"],
        },
    }


def _purchase_row(entry: dict, counts: dict[str, int]) -> dict:
    """One thing the user bought, as the purchase card shows it."""
    garment = closet_store.item(entry)
    wears = counts.get(entry["id"], 0)
    live = entry["in_closet"] and not entry["archived"]
    # Their own estimate beats ours: they can see the thing.
    worth = entry["resale_estimate"] if entry["resale_estimate"] is not None else market.resale(garment, wears)
    return {
        "id": entry["id"],
        "title": entry["title"],
        "category": entry["category"],
        "price": entry["price"],
        "bought_at": entry["bought_at"],
        "returned": entry["archive_reason"] == "returned",
        "return_reason": entry["archive_reason"],
        "in_closet": live,
        "wears": wears,
        "worth_now": worth,
        "cost_per_wear": market.cost_per_wear(entry["price"], wears),
        "brand": entry["brand"],
        "size": entry["size"],
        "color": entry["color"],
        "photo": entry["photo"],
        "notes": entry["notes"],
        "source_url": entry["source_url"],
        "archived": entry["archived"],
        "archive_reason": entry["archive_reason"],
        "tags": occasions.tags(garment),
        "yours": True,
    }


class PurchaseRequest(BaseModel):
    title: str
    price: float = 0.0
    bought_at: str | None = None
    brand: str | None = None
    category: str | None = None
    size: str | None = None
    color: str | None = None
    source_url: str | None = None
    photo: str | None = None
    notes: str | None = None
    resale_estimate: float | None = None
    wears: int | None = None
    add_to_closet: bool = True


class WearRequest(BaseModel):
    item_ids: list[str]
    worn_at: str | None = None


class PurchaseEdit(BaseModel):
    title: str | None = None
    price: float | None = None
    bought_at: str | None = None
    brand: str | None = None
    size: str | None = None
    color: str | None = None
    source_url: str | None = None
    photo: str | None = None
    notes: str | None = None
    resale_estimate: float | None = None
    wears: int | None = None
    in_closet: bool | None = None
    archived: bool | None = None
    archive_reason: str | None = None


@app.get("/purchases")
def list_purchases() -> dict:
    counts = closet_store.merge_counts(history.wear_counts())
    return {"purchases": [_purchase_row(e, counts) for e in closet_store.rows()]}


@app.post("/purchases")
def add_purchase(req: PurchaseRequest) -> dict:
    """Add something you bought. It joins the closet the duck scores against."""
    try:
        entry = closet_store.add(req.model_dump())
    except closet_store.Unknown as exc:
        raise HTTPException(422, str(exc)) from exc
    counts = closet_store.merge_counts(history.wear_counts())
    return {"purchase": _purchase_row(entry, counts)}


@app.patch("/purchases/{purchase_id}")
def edit_purchase(purchase_id: str, req: PurchaseEdit) -> dict:
    """Fix a field, correct the wear count, or archive it out of the closet.

    Archiving keeps the purchase: what you bought is history and stays true
    even once the thing is sold, returned or given away.
    """
    entry = closet_store.update(purchase_id, req.model_dump(exclude_unset=True))
    if entry is None:
        raise HTTPException(404, "purchase not found")
    counts = closet_store.merge_counts(history.wear_counts())
    return {"purchase": _purchase_row(entry, counts)}


@app.post("/wears")
def wore_today(req: WearRequest) -> dict:
    """One click per thing worn. Everything downstream reads these events."""
    for item_id in req.item_ids:
        closet_store.log_wear(item_id, req.worn_at)
    counts = closet_store.merge_counts(history.wear_counts())
    return {"logged": len(req.item_ids), "wears": {i: counts.get(i, 0) for i in req.item_ids}}


@app.get("/guess")
def guess_item(title: str, url: str = "") -> dict:
    """What we can infer before the user types anything else."""
    return closet_store.guess(title, url)


@app.get("/pond")
def pond_state() -> dict:
    return pond.state()


@app.get("/catalog")
def catalog() -> dict:
    return {
        "catalog": [i.dict() for i in CLOSET + STOREFRONT],
        "candidates": [i.dict() for i in STOREFRONT],
    }


@app.post("/predict/{prediction_id}/grade")
def grade(prediction_id: str, correct: bool) -> dict:
    entry = ledger.grade(prediction_id, correct)
    if entry is None:
        raise HTTPException(404, "prediction not found")
    return {"prediction": entry, "accuracy": ledger.accuracy_label()}


@app.get("/health")
def health(check_payments: bool = False) -> dict:
    provider = payments.get_provider()
    out = {"ok": True, "service": "puddle-brain", "payments": provider.name}
    if check_payments:
        out["payments_check"] = provider.ping()
    return out
