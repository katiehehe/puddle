"""The conversational layer over the closet facts.

The rule handlers in ask.py compute; this turns what they computed, plus the
whole fact sheet, into an answer in a shopper's own words and keeps the thread
of a conversation. The model is told the facts and told to stay inside them.
Anthropic is preferred when its key is present, OpenAI otherwise. Without a
key, or when the model is unreachable, the rule answer stands alone.
"""

from __future__ import annotations

import json
import os

import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
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


def anthropic_key() -> str:
    for name in ("PUDDLE_ANTHROPIC_KEY", "ANTHROPIC_API_KEY"):
        key = os.getenv(name, "").strip()
        if key.startswith("sk-ant-"):
            return key
    return ""


def openai_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def provider() -> str | None:
    if anthropic_key():
        return "anthropic"
    if openai_key():
        return "openai"
    return None


def enabled() -> bool:
    return provider() is not None


def _system(facts: dict, computed: dict | None) -> str:
    context = {"facts": facts}
    if computed is not None:
        context["computed_answer"] = {"answer": computed["answer"], "facts": computed.get("facts", {})}
    return SYSTEM + "\n\nCloset facts:\n" + json.dumps(context, default=str)


def _turns(question: str, history: list[dict]) -> list[dict]:
    out: list[dict] = []
    for turn in history[-MAX_HISTORY:]:
        q, a = (turn.get("question") or "").strip(), (turn.get("answer") or "").strip()
        if q:
            out.append({"role": "user", "content": q})
        if a:
            out.append({"role": "assistant", "content": a})
    out.append({"role": "user", "content": question})
    return out


def _anthropic(system: str, turns: list[dict]) -> str:
    body = {
        "model": os.getenv("ANTHROPIC_MODEL", "").strip() or DEFAULT_ANTHROPIC_MODEL,
        "max_tokens": 350,
        "temperature": 0.5,
        "system": system,
        "messages": turns,
    }
    headers = {"x-api-key": anthropic_key(), "anthropic-version": ANTHROPIC_VERSION}
    workspace = os.getenv("ANTHROPIC_WORKSPACE_ID", "").strip()
    if workspace:
        headers["anthropic-workspace-id"] = workspace
    res = httpx.post(
        ANTHROPIC_URL,
        headers=headers,
        json=body,
        timeout=TIMEOUT_S,
    )
    res.raise_for_status()
    return "".join(block.get("text", "") for block in res.json()["content"])


def _openai(system: str, turns: list[dict]) -> str:
    body = {
        "model": os.getenv("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL,
        "temperature": 0.5,
        "max_tokens": 350,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, *turns],
    }
    res = httpx.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {openai_key()}"},
        json=body,
        timeout=TIMEOUT_S,
    )
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


def _parse(content: str) -> dict:
    text = content.strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no json object in reply")
    return json.loads(text[start : end + 1])


def _plain(text: str) -> str:
    return text.replace(" \u2014 ", ", ").replace("\u2014", ", ").replace(" \u2013 ", ", ").strip()


def reply(question: str, facts: dict, history: list[dict], computed: dict | None) -> dict | None:
    """An answer and follow-ups from the model, or None if it cannot be had."""
    which = provider()
    if which is None:
        return None
    system, turns = _system(facts, computed), _turns(question, history)
    try:
        content = _anthropic(system, turns) if which == "anthropic" else _openai(system, turns)
        parsed = _parse(content)
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        return None
    if not isinstance(parsed, dict):
        return None
    answer = _plain(str(parsed.get("answer") or ""))
    if not answer:
        return None
    followups = [_plain(str(f)) for f in parsed.get("followups") or [] if str(f).strip()][:3]
    return {"answer": answer, "followups": followups}
