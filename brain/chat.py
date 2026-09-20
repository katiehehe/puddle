"""The conversational layer over the closet facts.

The rule handlers in ask.py compute; this turns what they computed, plus the
whole fact sheet, into an answer in a shopper's own words and keeps the thread
of a conversation. The model is told the facts and told to stay inside them.
Without a key, or when the model is unreachable, the rule answer stands alone.
"""

from __future__ import annotations

import json
import os

import httpx

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"
MAX_HISTORY = 8
TIMEOUT_S = 12.0

SYSTEM = """You are Puddle, a friendly duck who lives in someone's closet and helps them shop \
less badly. You know exactly what they own, how often each thing gets worn, what it cost, \
what it resells for, which occasions the closet covers, and how they shop.

Rules:
- Answer ONLY from the facts JSON you are given. Never invent items, numbers, brands or events. \
If the facts do not cover the question, say so plainly and offer the closest thing you do know.
- When a "computed_answer" is provided, its numbers are authoritative: keep them exactly, but \
you may rephrase and add one useful piece of context from the facts.
- Sound like a warm, slightly cheeky friend, not a report. Two to four short sentences. \
Plain words. No bullet lists, no headings, no emoji, no em dashes.
- Money as $1,234; whole dollars unless cents matter (cost per wear).
- If asked whether to buy something, weigh it against duplicates, wear habits, gaps and \
return history in the facts, and give a lean: probably worth it, maybe, or probably skip.
- Questions about anything other than this person's closet and shopping: decline in one \
friendly line and steer back.

Respond with JSON only: {"answer": "...", "followups": ["...", "...", "..."]}. Follow-ups are \
three short questions the shopper might naturally ask next, answerable from the facts, \
phrased in the first person (e.g. "Which of those do I wear least?")."""


def api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def model() -> str:
    return os.getenv("OPENAI_MODEL", "").strip() or DEFAULT_MODEL


def enabled() -> bool:
    return bool(api_key())


def _messages(question: str, facts: dict, history: list[dict], computed: dict | None) -> list[dict]:
    context = {"facts": facts}
    if computed is not None:
        context["computed_answer"] = {"answer": computed["answer"], "facts": computed.get("facts", {})}
    out = [
        {"role": "system", "content": SYSTEM},
        {"role": "system", "content": "Closet facts:\n" + json.dumps(context, default=str)},
    ]
    for turn in history[-MAX_HISTORY:]:
        q, a = (turn.get("question") or "").strip(), (turn.get("answer") or "").strip()
        if q:
            out.append({"role": "user", "content": q})
        if a:
            out.append({"role": "assistant", "content": a})
    out.append({"role": "user", "content": question})
    return out


def reply(question: str, facts: dict, history: list[dict], computed: dict | None) -> dict | None:
    """An answer and follow-ups from the model, or None if it cannot be had."""
    if not enabled():
        return None
    body = {
        "model": model(),
        "temperature": 0.5,
        "max_tokens": 350,
        "response_format": {"type": "json_object"},
        "messages": _messages(question, facts, history, computed),
    }
    try:
        res = httpx.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key()}"},
            json=body,
            timeout=TIMEOUT_S,
        )
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None
    answer = str(parsed.get("answer") or "").strip()
    if not answer:
        return None
    followups = [str(f).strip() for f in parsed.get("followups") or [] if str(f).strip()][:3]
    return {"answer": answer, "followups": followups}
