"""Puddle brain API.

One brain, two surfaces: the MV3 extension calls /score_item and /checkout at
the moment of purchase, the dashboard calls /portfolio. The response shapes are
the contract both surfaces were written against.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import history, ledger, payments, pond
from .catalog import BY_ID, CLOSET, STOREFRONT, coerce_item
from .miner import Miner, rank, verdict
from .portfolio import Closet
from .states import life_mix

BUDGET = 400.0

app = FastAPI(title="Puddle Brain", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def _context() -> tuple[Closet, Miner, dict[str, int]]:
    mix = life_mix([w.dict() for w in history.wears()])
    counts = history.wear_counts()
    return Closet(CLOSET, mix), Miner(history.purchases(), counts), counts


class ScoreRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    now_hour: int | None = None


class CheckoutRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    prediction_id: str | None = None


class SkipRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    prediction_id: str | None = None


def _resolve(req) -> object:
    item = coerce_item(req.item) if req.item else (BY_ID.get(req.item_id) if req.item_id else None)
    if item is None:
        raise HTTPException(404, "item not found; pass item_id or item")
    return item


# --- the checkout intervention ---------------------------------------------
@app.post("/score_item")
def score_item(req: ScoreRequest) -> dict:
    item = _resolve(req)
    closet, miner, _ = _context()

    now = datetime.now()
    if req.now_hour is not None:
        now = now.replace(hour=req.now_hour, minute=40)

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
    duck_state, confidence, speak = verdict(insights, item.price)
    headline = insights[0]["line"] if insights else "Nothing in your history says anything about this."

    prediction_id = None
    if speak:
        prediction_id = ledger.record(
            item.title, headline, duck_state, confidence, call="buy" if duck_state == "approving" else "skip"
        )

    return {
        "item": item.dict(),
        "portfolio": evaluation,
        "insights": insights,
        "headline": headline,
        "duck_state": duck_state,
        "confidence": round(confidence, 3),
        "speak": speak,
        "prediction_id": prediction_id,
        "accuracy": ledger.accuracy(),
    }


@app.post("/checkout")
def checkout(req: CheckoutRequest) -> dict:
    item = _resolve(req)
    if req.prediction_id:
        ledger.act(req.prediction_id, "bought")
    return payments.get_provider().pay(item.price, item.id).dict()


@app.post("/skip")
def skip(req: SkipRequest) -> dict:
    item = _resolve(req)
    if req.prediction_id:
        ledger.act(req.prediction_id, "skipped")
    return {"pond": pond.add(item.price)}


# --- the dashboard ----------------------------------------------------------
@app.get("/portfolio")
def portfolio() -> dict:
    closet, _, counts = _context()

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

    buys, skips = [], []
    for candidate in STOREFRONT:
        ev = closet.evaluate(candidate)
        rec = {
            "id": candidate.id,
            "title": candidate.title,
            "price": candidate.price,
            "alpha": ev["alpha"],
            "sharpe_after": ev["style_sharpe_after"],
            "covers_gap": ev["covers_gap"]["label"] if ev["covers_gap"] else None,
            "redundant_with": [d["id"] for d in ev["redundant_with"]],
        }
        (buys if ev["alpha"] > 0 else skips).append(rec)
    buys.sort(key=lambda r: -r["alpha"])

    spent, picked = 0.0, []
    for b in buys:
        if spent + b["price"] <= BUDGET:
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
            "donate": sorted(holdings, key=lambda h: h["expected_payoff"])[:2],
            "budget": BUDGET,
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
