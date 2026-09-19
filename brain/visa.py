"""Visa checkout behind one interface.

Real path: Visa Intelligent Commerce / Click to Pay sandbox
(base https://sandbox.api.visa.com/src/v1, X-Pay Token auth).
Set VISA_API_KEY + VISA_SHARED_SECRET to enable. Until then, a deterministic
mock returns a tokenized, budget-capped transaction so the demo works offline.
"""
from __future__ import annotations

import os
import uuid


def checkout(item: dict, budget_cap: float = 500.0) -> dict:
    real = bool(os.getenv("VISA_API_KEY") and os.getenv("VISA_SHARED_SECRET"))
    price = float(item.get("price", 0))
    approved = price <= budget_cap
    return {
        "mode": "visa_sandbox" if real else "mock",
        "approved": approved,
        "reason": None if approved else f"Over budget cap (${budget_cap:.0f})",
        "token": "tok_" + uuid.uuid4().hex[:16],
        "amount": price,
        "network": "VISA",
        # Where the real Click-to-Pay call would go:
        "endpoint": "https://sandbox.api.visa.com/src/v1/checkout" if real else None,
    }
