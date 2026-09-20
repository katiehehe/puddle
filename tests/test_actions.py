import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient

from brain import payments
from brain.app import app

client = TestClient(app)


def score(item_id="cand_boots", **kwargs):
    response = client.post("/score_item", json={"item_id": item_id, "now_hour": 23, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


def skip(event="skip-boots", **kwargs):
    return client.post("/actions", json={"event_id": event, "item_id": "cand_boots", "action": "skip", **kwargs})


def test_boots_end_to_end_and_restart():
    scored = score()
    assert scored["decision"] == "skip"
    first = skip(prediction_id=scored["prediction_id"])
    assert first.status_code == 200
    assert first.json()["pond"] == {"saved": 128, "skips": 1}
    retry = skip(prediction_id=scored["prediction_id"]).json()
    assert retry["duplicate"] is True
    assert retry["pond"]["saved"] == 128
    # Even a distinct event for the same item cannot inflate avoided spending.
    assert skip("skip-again").json()["pond"]["saved"] == 128
    view = client.get("/portfolio?now_hour=23").json()
    assert view["pond"]["saved"] == 128
    assert "sku_991" not in [r["id"] for r in view["rebalance"]["buy"]]
    assert "sku_991" in [r["id"] for r in view["rebalance"]["skip"]]
    assert view["ledger"]["predictions"][0]["user_action"] == "skipped"
    # A fresh interpreter, not a module cache, reads the same committed data.
    out = subprocess.check_output(
        [
            sys.executable,
            "-c",
            "from brain.storage import pond, actions; assert pond()['saved']==128; "
            "assert len(actions())==2; print('ok')",
        ],
        env=os.environ.copy(),
        text=True,
    )
    assert out.strip() == "ok"


def test_concurrent_retries_are_atomic():
    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(lambda _: skip(), range(12)))
    assert all(r.status_code == 200 for r in responses)
    assert sum(not r.json()["duplicate"] for r in responses) == 1
    assert client.get("/pond").json() == {"saved": 128, "skips": 1}


def test_idempotency_conflict_and_prediction_ownership():
    assert skip().status_code == 200
    assert skip(item_id="cand_suit").status_code == 409
    prediction = score("cand_suit")["prediction_id"]
    assert skip("wrong-prediction", prediction_id=prediction).status_code == 409
    assert skip("missing-prediction", prediction_id="missing").status_code == 404
    assert len(client.get("/actions").json()["actions"]) == 1


def test_purchase_updates_wardrobe_and_reverses_saved_amount(monkeypatch):
    skip()
    provider = payments.MockProvider()
    calls = []

    def pay(amount, item_id):
        calls.append(item_id)
        return provider.pay(amount, item_id)

    monkeypatch.setattr(payments, "get_provider", lambda: type("Provider", (), {"pay": staticmethod(pay)})())
    body = {"event_id": "buy-boots", "item_id": "cand_boots"}
    first = client.post("/checkout", json=body).json()
    assert first["approved"] is True and first["mode"] == "mock"
    assert first["status"] == "approved" and first["pond"]["saved"] == 0
    assert client.post("/checkout", json=body).json()["duplicate"] is True
    assert len(calls) == 1
    assert "sku_991" in [i["id"] for i in client.get("/closet").json()["closet"]]
    assert skip("after-purchase").status_code == 409
    assert client.post("/checkout", json={**body, "event_id": "buy-again"}).status_code == 409


def test_decline_does_not_add_holdings_or_grade_prediction():
    item = {"id": "expensive", "title": "Coat", "category": "outer", "price": 501, "formality": 3, "warmth": 4}
    prediction = score(item=item)["prediction_id"]
    response = client.post("/checkout", json={"event_id": "declined", "item": item, "prediction_id": prediction}).json()
    assert response["approved"] is False
    assert response["status"] == "declined"
    assert response["event"]["action"] == "payment_failed"
    assert "expensive" not in [i["id"] for i in client.get("/closet").json()["closet"]]
    entry = client.get("/portfolio").json()["ledger"]["predictions"][0]
    assert entry["user_action"] is None and entry["graded"] is False


def test_sandbox_failure_is_not_mock_success(monkeypatch):
    provider = payments.VisaSandboxProvider("test", "test")

    def fail(*args, **kwargs):
        raise URLError("offline")

    monkeypatch.setattr(payments.urllib.request, "urlopen", fail)
    result = provider.pay(128, "sku_991").dict()
    assert result["approved"] is False
    assert result["mode"] == "visa_sandbox" and result["status"] == "error"


@pytest.mark.parametrize("hour", [14, 23])
def test_shared_recommendations(hour):
    view = client.get(f"/portfolio?now_hour={hour}").json()
    for group in ("buy", "skip", "neutral"):
        for rec in view["rebalance"][group]:
            actual = client.post("/score_item", json={"item_id": rec["id"], "now_hour": hour}).json()
            assert actual["decision"] == group
            assert actual["reasons"] == rec["reasons"]
    assert score("cand_suit")["decision"] == "buy"


def test_size_override_is_respected():
    result = score(item={"id": "cand_boots", "size": "9"})
    assert result["item"]["size"] == "9"
    assert not any(i["type"] == "return_pattern" for i in result["insights"])


@pytest.mark.parametrize(
    "changes", [{"price": -1}, {"price": "nan"}, {"quality": 2}, {"formality": 7}, {"warmth": "invalid"}]
)
def test_bad_items_are_rejected(changes):
    item = {"id": "custom", "title": "Custom", "price": 20, "formality": 2, "warmth": 3, **changes}
    assert client.post("/score_item", json={"item": item}).status_code == 422


def test_invalid_hour_and_action():
    assert client.post("/score_item", json={"item_id": "cand_boots", "now_hour": 24}).status_code == 422
    assert client.get("/portfolio?now_hour=24").status_code == 422
    assert client.get("/portfolio?budget=0").status_code == 422
    assert client.get("/portfolio?budget=-5").status_code == 422
    assert skip(action="refund").status_code == 422
    assert skip(event="").status_code == 422


def test_accuracy_starts_empty_and_grades_persist():
    assert client.get("/portfolio").json()["ledger"]["accuracy"] == "0/0"
    prediction = score()["prediction_id"]
    assert client.post(f"/predict/{prediction}/grade?correct=true").status_code == 200
    assert client.get("/portfolio").json()["ledger"]["accuracy"] == "1/1"
    assert client.post("/predict/missing/grade?correct=true").status_code == 404


def test_legacy_skip_retries():
    body = {"item_id": "cand_boots"}
    assert client.post("/skip", json=body).json()["pond"]["saved"] == 128
    assert client.post("/skip", json=body).json()["duplicate"] is True


# --- the closet journal ----------------------------------------------------


def test_logging_an_item_infers_what_it_is():
    r = client.post("/closet/log", json={"title": "Cropped denim jacket", "price": 89, "wears": 4})
    assert r.status_code == 200, r.text
    entry = r.json()["entry"]
    assert entry["understood"]["kind"] == "light_jacket"
    assert entry["id"].startswith("log_")


def test_an_unrecognisable_item_is_refused_with_a_usable_message():
    r = client.post("/closet/log", json={"title": "Zorblatt"})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "Zorblatt" in detail and "crewneck" in detail


def test_a_link_has_to_look_like_a_link():
    r = client.post("/closet/log", json={"title": "Rain jacket", "link": "javascript:alert(1)"})
    assert r.status_code == 422


def test_entries_come_back_newest_first_and_can_be_removed():
    first = client.post("/closet/log", json={"title": "Charcoal crewneck"}).json()["entry"]
    second = client.post("/closet/log", json={"title": "Rain jacket"}).json()["entry"]
    listed = client.get("/closet/log").json()["entries"]
    assert [e["id"] for e in listed][:2] == [second["id"], first["id"]]

    assert client.delete(f"/closet/log/{first['id']}").status_code == 200
    assert first["id"] not in [e["id"] for e in client.get("/closet/log").json()["entries"]]
    assert client.delete(f"/closet/log/{first['id']}").status_code == 404


def test_a_logged_item_keeps_its_note_and_photo():
    tiny = "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    r = client.post("/closet/log", json={
        "title": "Rain jacket", "note": "Bought after getting soaked.", "image": tiny})
    entry = r.json()["entry"]
    assert entry["note"] == "Bought after getting soaked."
    assert entry["image"] == tiny
