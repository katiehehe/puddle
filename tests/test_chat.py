import json

import httpx
from fastapi.testclient import TestClient

from brain import chat
from brain.app import app

client = TestClient(app)


def ask(question, **kwargs):
    return client.post("/ask", json={"question": question, **kwargs}).json()


def fake_model(monkeypatch, content=None, status=200, provider="anthropic"):
    seen = {}

    def post(url, headers, json, timeout):
        seen["url"], seen["headers"], seen["body"] = url, headers, json
        if status != 200:
            payload = {"error": {}}
        elif url == chat.ANTHROPIC_URL:
            payload = {"content": [{"type": "text", "text": content}]}
        else:
            payload = {"choices": [{"message": {"content": content}}]}
        return httpx.Response(status, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(chat.httpx, "post", post)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("PUDDLE_ANTHROPIC_KEY", raising=False)
    if provider == "anthropic":
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    else:
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
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("PUDDLE_ANTHROPIC_KEY", raising=False)
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
    assert reply["intent"] == "unworn"
    assert reply["followups"] == []


def test_model_phrases_the_computed_line_and_history_rides_along(monkeypatch):
    seen = fake_model(
        monkeypatch,
        json.dumps({"answer": "Just the strappy heels, $78 sitting unworn.", "followups": ["Should I sell them?"]}),
    )
    reply = ask("Anything I never wear?", history=[{"question": "Hi", "answer": "Hello"}])
    assert reply["source"] == "chat"
    assert reply["intent"] == "unworn"
    assert reply["answer"].startswith("Just the strappy heels")
    assert "Strappy heels" in reply["computed"]
    assert reply["followups"] == ["Should I sell them?"]
    assert seen["url"] == chat.ANTHROPIC_URL
    assert seen["headers"]["x-api-key"] == "sk-ant-test-key"
    assert "Closet facts" in seen["body"]["system"]
    assert [m["role"] for m in seen["body"]["messages"]] == ["user", "assistant", "user"]


def test_openai_is_used_when_only_its_key_is_set(monkeypatch):
    seen = fake_model(monkeypatch, json.dumps({"answer": "Heels.", "followups": []}), provider="openai")
    reply = ask("Anything I never wear?")
    assert reply["source"] == "chat"
    assert seen["url"] == chat.OPENAI_URL
    assert seen["body"]["messages"][0]["role"] == "system"


def test_prose_around_the_json_is_tolerated(monkeypatch):
    fake_model(monkeypatch, 'Sure! {"answer": "Heels.", "followups": []} hope that helps')
    assert ask("Anything I never wear?")["answer"] == "Heels."


def test_model_failure_falls_back_to_the_rules(monkeypatch):
    fake_model(monkeypatch, status=429)
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
    assert reply["intent"] == "unworn"


def test_garbled_model_output_falls_back(monkeypatch):
    fake_model(monkeypatch, "not json")
    reply = ask("What do I never wear?")
    assert reply["source"] == "rules"
