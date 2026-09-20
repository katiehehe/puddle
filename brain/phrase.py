"""The duck's voice: a small language model phrasing facts it did not compute.

Everything Puddle says is decided elsewhere -- the verdict by advice.advise,
the numbers by the portfolio engine and the miner. This module only turns
that finished reasoning into one sentence a friend would say at the till.
The model is given the facts and nothing else, told not to invent a number,
and its output is checked against the facts before it is used. If anything
goes wrong (no key, timeout, a number that was not in the input) the caller
falls back to the deterministic copy, so the product never depends on it.

Cost is kept small on purpose: a small model, a dense prompt with only the
reasons that moved the verdict, a short completion, and an in-process cache
keyed on the facts so the same checkout is never phrased twice.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import OrderedDict

import httpx

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest"
TIMEOUT_S = 4.0
MAX_WORDS = 28
CACHE_SIZE = 256

SYSTEM = (
    "You are Puddle, a small duck that lives in someone's shopping cart and speaks up before they pay. "
    "You will be given a verdict and the facts that produced it. Say the verdict in ONE plain sentence, "
    f"under {MAX_WORDS} words, the way a blunt, kind friend would. Use only the facts given. "
    "Never invent a number, a brand, or a reason. No emoji, no hashtags, no preamble, no quotes."
)

_cache: OrderedDict[str, dict] = OrderedDict()


def configured() -> dict:
    """Which provider will answer, without touching the network."""
    if os.environ.get("OPENAI_API_KEY"):
        return {"provider": "openai", "model": os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)}
    if os.environ.get("ANTHROPIC_API_KEY"):
        return {"provider": "anthropic", "model": os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)}
    return {"provider": None, "model": None}


def _facts(item_title: str, price: float, advice: dict) -> dict:
    return {
        "item": item_title,
        "price": round(price, 2),
        "verdict": advice["verdict"],
        "reasons": [r["text"] for r in advice["reasons"]][:4],
    }


def _numbers_in(text: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*\.?\d*", text)}


def _grounded(sentence: str, facts: dict) -> bool:
    """Every number the model wrote must appear somewhere in what it was given."""
    allowed = _numbers_in(json.dumps(facts))
    allowed |= {str(int(facts["price"])), f"{facts['price']:.0f}", f"{facts['price']:.2f}"}
    return all(any(n == a or n == a.rstrip("0").rstrip(".") for a in allowed) for n in _numbers_in(sentence))


def _openai(prompt: str, model: str) -> str:
    res = httpx.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
        json={
            "model": model,
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
            "max_tokens": 60,
            "temperature": 0.4,
        },
        timeout=TIMEOUT_S,
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


def _anthropic(prompt: str, model: str) -> str:
    res = httpx.post(
        ANTHROPIC_URL,
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"},
        json={
            "model": model,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 60,
            "temperature": 0.4,
        },
        timeout=TIMEOUT_S,
    )
    res.raise_for_status()
    return "".join(block.get("text", "") for block in res.json()["content"])


def _clean(text: str) -> str:
    line = text.strip().strip('"').strip()
    line = line.splitlines()[0] if line else ""
    return line if len(line.split()) <= MAX_WORDS + 4 else ""


def phrase(item_title: str, price: float, advice: dict) -> dict | None:
    """One sentence for the duck to say, or None when the math should speak for itself.

    Returns {"line", "provider", "model", "cached"}.
    """
    cfg = configured()
    if not cfg["provider"]:
        return None
    facts = _facts(item_title, price, advice)
    key = hashlib.sha1(json.dumps([cfg, facts], sort_keys=True).encode()).hexdigest()
    hit = _cache.get(key)
    if hit:
        _cache.move_to_end(key)
        return {**hit, "cached": True}

    prompt = json.dumps(facts, ensure_ascii=False)
    try:
        raw = _openai(prompt, cfg["model"]) if cfg["provider"] == "openai" else _anthropic(prompt, cfg["model"])
    except (httpx.HTTPError, KeyError, ValueError, IndexError, TypeError):
        return None
    line = _clean(raw)
    if not line or not _grounded(line, facts):
        return None

    out = {"line": line, "provider": cfg["provider"], "model": cfg["model"], "cached": False}
    _cache[key] = out
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return out
