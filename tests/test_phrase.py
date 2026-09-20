import httpx

from brain import phrase

ADVICE = {
    "verdict": "Probably skip",
    "reasons": [
        {"tone": "against", "kind": "returns", "text": "You returned 4 of the last 4 pairs of boots."},
        {"tone": "against", "kind": "late", "text": "88% of what you return was bought after 11pm."},
    ],
}


def _fake_openai(monkeypatch, text, calls):
    def post(url, **kwargs):
        calls.append(kwargs["json"])
        req = httpx.Request("POST", url)
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]}, request=req)

    monkeypatch.setattr(phrase.httpx, "post", post)


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert phrase.configured()["provider"] is None
    assert phrase.phrase("Chelsea boots", 128, ADVICE) is None


def test_phrases_from_facts_and_caches(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    phrase._cache.clear()
    calls = []
    _fake_openai(monkeypatch, '"Fifth pair of boots, and you sent 4 of 4 back — skip these."', calls)
    first = phrase.phrase("Chelsea boots", 128, ADVICE)
    assert first["line"].startswith("Fifth pair")
    assert first["provider"] == "openai" and first["cached"] is False
    second = phrase.phrase("Chelsea boots", 128, ADVICE)
    assert second["cached"] is True
    assert len(calls) == 1
    prompt = calls[0]["messages"][1]["content"]
    assert "88%" in prompt and "Probably skip" in prompt


def test_invented_numbers_are_rejected(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    phrase._cache.clear()
    _fake_openai(monkeypatch, "You have returned 7 pairs of boots this year, skip.", [])
    assert phrase.phrase("Chelsea boots", 128, ADVICE) is None


def test_network_failure_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    phrase._cache.clear()

    def boom(url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(phrase.httpx, "post", boom)
    assert phrase.phrase("Chelsea boots", 128, ADVICE) is None
