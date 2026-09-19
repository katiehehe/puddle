"""Puddle brain API. Serves the portfolio dashboard and the checkout duck."""
from __future__ import annotations

import uuid
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import portfolio as pf
import visa
from miner import build_insights
from seed import CATALOG, CLOSET, CANDIDATES, HISTORY

app = FastAPI(title="Puddle Brain", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# in-memory prediction ledger (seeded so the duck has a public track record)
PREDICTIONS: list[dict] = [
    {"id": "p_0001", "item": "Suede boots", "call": "skip", "graded": True, "correct": True},
    {"id": "p_0002", "item": "Third hoodie", "call": "skip", "graded": True, "correct": True},
    {"id": "p_0003", "item": "Wool coat", "call": "buy", "graded": True, "correct": True},
    {"id": "p_0004", "item": "Neon sneakers", "call": "skip", "graded": True, "correct": False},
    {"id": "p_0005", "item": "Linen shirt", "call": "buy", "graded": True, "correct": True},
]


def _by_id(item_id: str) -> dict | None:
    for it in CATALOG:
        if it["id"] == item_id:
            return it
    return None


class ScoreRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None
    now_hour: int = 23


@app.get("/health")
def health():
    return {"ok": True, "service": "puddle-brain"}


@app.get("/catalog")
def catalog():
    return {"catalog": CATALOG, "candidates": CANDIDATES}


@app.get("/closet")
def closet():
    A = pf.payoff_matrix(CLOSET)
    mu = pf.w_mean(A)
    items = []
    for it, m in zip(CLOSET, mu):
        items.append({**it, "expected_payoff": round(float(m), 3)})
    return {"closet": items}


@app.get("/portfolio")
def portfolio():
    sb, w = pf.closet_sharpe(CLOSET)
    A = pf.payoff_matrix(CLOSET)
    mu = pf.w_mean(A)

    # coverage by state
    cov = pf.coverage_by_state(CLOSET)
    coverage = [{"state": s["name"], "coverage": round(float(c), 3), "p": s["p"]}
                for s, c in zip(pf.STATES, cov)]

    # holdings with redundancy flag
    holdings = []
    for i, it in enumerate(CLOSET):
        a_i = A[i]
        dupes = []
        for j, other in enumerate(CLOSET):
            if i != j and other["category"] == it["category"] and pf.w_corr(a_i, A[j]) > 0.80:
                dupes.append(other["id"])
        holdings.append({
            "id": it["id"], "title": it["title"], "category": it["category"],
            "price": it["price"], "wears": it.get("wears", 0),
            "expected_payoff": round(float(mu[i]), 3),
            "cost_per_wear": round(it["price"] / max(it.get("wears", 0), 1), 2),
            "redundant_with": dupes,
        })

    # rebalance: score candidates, decide buy / skip
    buys, skips = [], []
    for c in CANDIDATES:
        sc = pf.score_candidate(c, CLOSET)
        rec = {
            "id": c["id"], "title": c["title"], "price": c["price"],
            "alpha": sc.alpha, "sharpe_after": sc.sharpe_after,
            "covers_gap": sc.covers_gap, "redundant_with": sc.redundant_with,
        }
        if sc.alpha > 0.0:
            buys.append(rec)
        else:
            skips.append(rec)
    buys.sort(key=lambda r: r["alpha"], reverse=True)

    # greedy under budget
    budget, spent, picked = 400.0, 0.0, []
    for b in buys:
        if spent + b["price"] <= budget:
            picked.append(b)
            spent += b["price"]

    # donate: lowest expected-payoff owned items (dead weight)
    donate = sorted(holdings, key=lambda h: h["expected_payoff"])[:2]

    saved = round(sum(s["price"] for s in skips), 2)
    graded = [p for p in PREDICTIONS if p["graded"]]
    acc = sum(1 for p in graded if p["correct"])

    return {
        "style_sharpe": round(sb, 3),
        "coverage": coverage,
        "holdings": holdings,
        "rebalance": {"buy": picked, "skip": skips, "donate": donate, "budget": budget, "spent": round(spent, 2)},
        "overexposure": round(pf.herfindahl_overexposure(CLOSET), 3),
        "pond": {"saved": saved},
        "ledger": {"predictions": PREDICTIONS, "accuracy": f"{acc}/{len(graded)}"},
    }


@app.post("/score_item")
def score_item(req: ScoreRequest):
    item = req.item or (_by_id(req.item_id) if req.item_id else None)
    if item is None:
        raise HTTPException(404, "item not found; pass item_id or item")
    result = build_insights(item, CLOSET, HISTORY, now_hour=req.now_hour)
    pid = "p_" + uuid.uuid4().hex[:6]
    top = result["insights"][0]["line"] if result["insights"] else "That one's fine."
    PREDICTIONS.append({
        "id": pid, "item": item["title"],
        "call": "skip" if result["duck_state"] == "concerned" else "buy",
        "graded": False, "correct": None,
    })
    return {"item": item, "prediction_id": pid, "headline": top, **result}


@app.post("/predict/{pid}/grade")
def grade(pid: str, correct: bool):
    for p in PREDICTIONS:
        if p["id"] == pid:
            p["graded"], p["correct"] = True, correct
            return p
    raise HTTPException(404, "prediction not found")


class CheckoutRequest(BaseModel):
    item_id: str | None = None
    item: dict | None = None


@app.post("/checkout")
def checkout(req: CheckoutRequest):
    item = req.item or (_by_id(req.item_id) if req.item_id else None)
    if item is None:
        raise HTTPException(404, "item not found")
    return visa.checkout(item)
