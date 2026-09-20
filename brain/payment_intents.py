"""Signed, short-lived purchase instructions for explicit checkout consent."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid

from . import payments

INTENT_TTL_SECONDS = 10 * 60
_EPHEMERAL_SECRET = secrets.token_bytes(32)


class InvalidIntent(ValueError):
    pass


def _secret() -> bytes:
    configured = os.environ.get("PAYMENT_INTENT_SECRET", "").strip()
    return configured.encode() if configured else _EPHEMERAL_SECRET


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _sign(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    signature = hmac.new(_secret(), raw, hashlib.sha256).digest()
    return f"{_encode(raw)}.{_encode(signature)}"


def verify(token: str) -> dict:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        raw = _decode(encoded_payload)
        supplied = _decode(encoded_signature)
        expected = hmac.new(_secret(), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(supplied, expected):
            raise InvalidIntent("Payment intent signature is invalid.")
        payload = json.loads(raw)
    except InvalidIntent:
        raise
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise InvalidIntent("Payment intent is unreadable.") from exc
    if not isinstance(payload, dict):
        raise InvalidIntent("Payment intent is unreadable.")
    if payload.get("version") != 1:
        raise InvalidIntent("Payment intent version is unsupported.")
    if payload.get("expires_at", 0) < int(time.time()):
        raise InvalidIntent("Payment intent has expired. Review checkout again.")
    return payload


def create(item, prediction_id: str | None, budget_limit: float, evidence: list[str]) -> dict:
    provider = payments.provider_status()
    amount_cents = round(item.price * 100)
    budget_cents = round(budget_limit * 100)
    budget_ok = amount_cents <= budget_cents and payments._capped(item.price) is None
    created_at = int(time.time())
    payload = {
        "version": 1,
        "intent_id": "pi_" + uuid.uuid4().hex,
        "event_id": "buy_" + uuid.uuid4().hex,
        "item": item.dict(),
        "prediction_id": prediction_id,
        "amount_cents": amount_cents,
        "currency": "USD",
        "budget_cents": budget_cents,
        "provider_mode": provider["mode"],
        "created_at": created_at,
        "expires_at": created_at + INTENT_TTL_SECONDS,
    }
    blocked_reason = None
    if not budget_ok:
        blocked_reason = f"This ${item.price:g} purchase exceeds the ${budget_limit:g} checkout limit."
    elif not provider["ready"]:
        blocked_reason = "Visa setup is incomplete."
    return {
        "intent_id": payload["intent_id"],
        "token": _sign(payload),
        "item": {"id": item.id, "title": item.title},
        "amount": item.price,
        "currency": "USD",
        "budget_limit": budget_limit,
        "provider": provider,
        "evidence": evidence[:2],
        "requires_confirmation": True,
        "checkout_enabled": blocked_reason is None,
        "blocked_reason": blocked_reason,
        "expires_at": payload["expires_at"],
    }
