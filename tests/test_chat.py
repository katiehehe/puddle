import json

import httpx
from fastapi.testclient import TestClient

from brain import chat
from brain.app import app

client = TestClient(app)


def ask(question, **kwargs):
    return client.post("/ask", json={"question": question, **kwargs}).json()


def fake_openai(monkeypatch, content=None, status=200):
    seen = {}

    def post(url, headers, json, timeout):
        seen["body"] = json
        payload = {"choices": [{"message": {"content": content}}]} if status == 200 else {"error": {}}
        return httpx.Response(status, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(chat.httpx, "post", post)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    return seen


def test_facts_endpoint_carries_the_numbers_the_rules_use():
    facts = client.get("/facts").json()
    assert facts["totals"]["things_owned"] == len(facts["items"])
    assert facts["totals"]["spent_on_them"] > 0
    assert all("cost_per_wear" in item for item in facts["items"])
    assert "never_worn" in facts and "gaps" in facts


def test_without_a_key_the_rules_answer_alone(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
    assert reply["intent"] == "unworn"
    assert reply["followups"] == []


def test_model_phrases_the_computed_line_and_history_rides_along(monkeypatch):
    seen = fake_openai(
        monkeypatch,
        json.dumps({"answer": "Just the strappy heels, $78 sitting unworn.", "followups": ["Should I sell them?"]}),
    )
    reply = ask("Anything I never wear?", history=[{"question": "Hi", "answer": "Hello"}])
    assert reply["source"] == "chat"
    assert reply["intent"] == "unworn"
    assert reply["answer"].startswith("Just the strappy heels")
    assert "Strappy heels" in reply["computed"]
    assert reply["followups"] == ["Should I sell them?"]
    roles = [m["role"] for m in seen["body"]["messages"]]
    assert roles[-3:] == ["user", "assistant", "user"]


def test_model_failure_falls_back_to_the_rules(monkeypatch):
    fake_openai(monkeypatch, status=429)
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
    assert reply["intent"] == "unworn"


def test_garbled_model_output_falls_back(monkeypatch):
    fake_openai(monkeypatch, "not json")
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
