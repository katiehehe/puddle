"""Payment providers.

Both implementations sit behind one interface so the Visa sandbox can be
swapped in without touching a caller. The mock is the default; setting
VISA_API_KEY + VISA_SHARED_SECRET switches the same call onto Visa's sandbox
(X-Pay-Token auth), and failures remain failures. No automatic successful mock fallback is used.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import asdict, dataclass
from typing import Protocol

BUDGET_CAP = 500.0
SANDBOX_BASE = "https://sandbox.api.visa.com"
RESOURCE_PATH = "src/v1/checkout"


@dataclass
class PaymentResult:
    mode: str
    approved: bool
    amount: float
    token: str
    network: str = "VISA"
    reason: str | None = None
    message: str = ""

    def dict(self) -> dict:
        return {
            **asdict(self),
            "status": "approved" if self.approved else "error" if self.reason == "provider_error" else "declined",
        }


class PaymentProvider(Protocol):
    name: str

    def pay(self, amount: float, item_id: str) -> PaymentResult: ...


def _capped(amount: float) -> str | None:
    if not math.isfinite(amount) or amount < 0:
        return "Invalid payment amount"
    return None if amount <= BUDGET_CAP else f"Over budget cap (${BUDGET_CAP:.0f})"


class MockProvider:
    name = "mock"

    def pay(self, amount: float, item_id: str) -> PaymentResult:
        reason = _capped(amount)
        return PaymentResult(
            mode="mock",
            approved=reason is None,
            amount=amount,
            token="tok_" + uuid.uuid4().hex[:16],
            reason=reason,
            message="Paid (simulated)." if reason is None else "Declined (simulated).",
        )


class VisaSandboxProvider:
    """Visa Developer sandbox, authenticated with an X-Pay-Token."""

    name = "visa_sandbox"

    def __init__(self, api_key: str, shared_secret: str):
        self.api_key = api_key
        self.shared_secret = shared_secret

    def _x_pay_token(self, query: str, body: str) -> str:
        timestamp = str(int(time.time()))
        message = timestamp + RESOURCE_PATH + query + body
        digest = hmac.new(self.shared_secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return f"xv2:{timestamp}:{digest}"

    def pay(self, amount: float, item_id: str) -> PaymentResult:
        reason = _capped(amount)
        if reason:
            return PaymentResult(
                mode=self.name,
                approved=False,
                amount=amount,
                token="",
                reason=reason,
                message="Declined before dispatch.",
            )

        query = f"apikey={self.api_key}"
        body = json.dumps({"amount": round(amount, 2), "currency": "USD", "reference": item_id})
        request = urllib.request.Request(
            f"{SANDBOX_BASE}/{RESOURCE_PATH}?{query}",
            data=body.encode(),
            headers={
                "Content-Type": "application/json",
                "x-pay-token": self._x_pay_token(query, body),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=6) as response:
                payload = json.loads(response.read() or b"{}")
        except (urllib.error.URLError, TimeoutError, ValueError):
            return PaymentResult(
                mode=self.name,
                approved=False,
                amount=amount,
                token="",
                reason="provider_error",
                message="Sandbox payment could not be confirmed.",
            )

        approved = isinstance(payload, dict) and payload.get("approved") is True
        return PaymentResult(
            mode=self.name,
            approved=approved,
            amount=amount,
            token=(payload.get("transactionId") or payload.get("token") or "") if approved else "",
            reason=None if approved else "not_approved",
            message="Approved by Visa sandbox." if approved else "Sandbox did not confirm approval.",
        )


def get_provider() -> PaymentProvider:
    api_key = os.environ.get("VISA_API_KEY")
    shared_secret = os.environ.get("VISA_SHARED_SECRET")
    if api_key and shared_secret:
        return VisaSandboxProvider(api_key, shared_secret)
    return MockProvider()
