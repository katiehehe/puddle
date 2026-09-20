import time

from fastapi.testclient import TestClient

from brain import payment_intents, payments
from brain.app import app

client = TestClient(app)


def create_intent(**changes):
    body = {"item_id": "cand_boots", **changes}
    response = client.post("/payment-intents", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_mock_intent_requires_confirmation_and_records_one_purchase(monkeypatch):
    calls = []
    provider = payments.MockProvider()

    def pay(amount, item_id):
        calls.append((amount, item_id))
        return provider.pay(amount, item_id)

    monkeypatch.setattr(payments, "get_provider", lambda: type("Provider", (), {"pay": staticmethod(pay)})())
    intent = create_intent()
    assert intent["amount"] == 128
    assert intent["provider"]["mode"] == "mock"
    assert intent["provider"]["simulated"] is True
    assert intent["checkout_enabled"] is True
    assert client.get("/actions").json()["actions"] == []

    denied = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": False})
    assert denied.status_code == 422
    assert client.get("/actions").json()["actions"] == []

    first = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert first.status_code == 200
    assert first.json()["approved"] is True
    assert first.json()["receipt"]["simulated"] is True
    retry = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert retry.status_code == 200 and retry.json()["duplicate"] is True
    assert calls == [(128, "sku_991")]


def test_tampered_intent_is_rejected_without_an_action():
    intent = create_intent()
    # The last base64 character carries spare bits, so edit one that does not:
    # a trailing edit can decode back to the very signature it meant to break.
    payload, signature = intent["token"].split(".", 1)
    middle = len(signature) // 2
    replacement = "A" if signature[middle] != "A" else "B"
    tampered = f"{payload}.{signature[:middle]}{replacement}{signature[middle + 1:]}"
    response = client.post("/payment-intents/confirm", json={"token": tampered, "confirmed": True})
    assert response.status_code == 400
    assert "signature" in response.json()["detail"].lower()
    assert client.get("/actions").json()["actions"] == []


def test_expired_intent_is_rejected(monkeypatch):
    intent = create_intent()
    now = time.time()
    monkeypatch.setattr(
        payment_intents.time,
        "time",
        lambda: now + payment_intents.INTENT_TTL_SECONDS + 1,
    )
    response = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_budget_limit_blocks_checkout():
    intent = create_intent(budget_limit=100)
    assert intent["checkout_enabled"] is False
    assert "exceeds" in intent["blocked_reason"]
    response = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert response.status_code == 409
    assert client.get("/actions").json()["actions"] == []


def test_partial_visa_setup_is_visible_and_cannot_charge(monkeypatch):
    monkeypatch.setenv("VISA_API_KEY", "partial-key")
    intent = create_intent()
    assert intent["provider"]["mode"] == "visa_incomplete"
    assert intent["provider"]["ready"] is False
    assert "VISA_CERT_PATH" in intent["provider"]["missing"]
    assert intent["checkout_enabled"] is False
    response = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert response.status_code == 503


def test_provider_change_requires_a_fresh_review(monkeypatch):
    intent = create_intent()
    monkeypatch.setenv("VISA_API_KEY", "partial-key")
    response = client.post("/payment-intents/confirm", json={"token": intent["token"], "confirmed": True})
    assert response.status_code == 409
    assert "changed" in response.json()["detail"].lower()
