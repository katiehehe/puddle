"""Puddle brain API.

One brain, two surfaces: the MV3 extension calls /score_item and /checkout at
the moment of purchase, the dashboard calls /portfolio. The response shapes are
the contract both surfaces were written against.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import history, ledger, payments, pond, storage
from .catalog import CLOSET, STOREFRONT, Item, coerce_item
from .miner import Miner, rank, verdict
from .portfolio import Closet
from .states import life_mix

# The dashboard is a planning surface, not a 2am checkout. Scoring it at the
# wall-clock hour let the late-night signal leak into every recommendation.
DASHBOARD_HOUR = 14
DEFAULT_BUDGET = 500.0

app = FastAPI(title="Puddle Brain", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _context() -> tuple[Closet, Miner, dict[str, int]]:
    mix = life_mix([w.dict() for w in history.wears()])
    counts = history.wear_counts()
    owned = CLOSET + [Item(**raw) for raw in storage.owned()]
    return Closet(owned, mix), Miner(history.purchases(), counts), counts


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


def recommend(item, closet, miner, now):
    evaluation = closet.evaluate(item)
    insights = rank(
        [
            miner.return_pattern(item),
            miner.redundancy(item, evaluation),
            miner.time_pattern(now),
            miner.coverage_gap(evaluation),
            miner.overexposure(item, closet.concentration(), closet.items),
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
    closet, miner, _ = _context()

    now = datetime.now()
    if req.now_hour is not None:
        now = now.replace(hour=req.now_hour, minute=40)

    result = recommend(item, closet, miner, now)
    prediction_id = storage.record(
        item, result["headline"], result["decision"], result["duck_state"], result["confidence"]
    )
    return {"item": item.dict(), **result, "prediction_id": prediction_id, "accuracy": ledger.accuracy()}


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
            "sharpe_per_dollar": round(
                (ev["style_sharpe_after"] - ev["style_sharpe_before"]) / candidate.price, 6
            ),
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
            "donate": sorted(holdings, key=lambda h: h["expected_payoff"])[:2],
            "budget": budget,
            "spent": round(spent, 2),
        },
        "overexposure": closet.concentration(),
        "pond": pond.state(),
        "ledger": {"predictions": ledger.entries(), "accuracy": ledger.accuracy_label()},
    }


@app.get("/closet")
def closet_items() -> dict:
    closet, _, counts = _context()
    return {
        "closet": [
            {**item.dict(), "wears": counts.get(item.id, 0), "expected_payoff": round(float(closet.mu[i]), 3)}
            for i, item in enumerate(closet.items)
        ]
    }


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
def health() -> dict:
    return {"ok": True, "service": "puddle-brain", "payments": payments.get_provider().name}
