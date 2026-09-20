import pytest


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setenv("PUDDLE_DB_PATH", str(tmp_path / "state.sqlite3"))
    monkeypatch.delenv("VISA_API_KEY", raising=False)
    monkeypatch.delenv("VISA_SHARED_SECRET", raising=False)
    monkeypatch.delenv("VISA_CERT_PATH", raising=False)
    monkeypatch.delenv("VISA_KEY_PATH", raising=False)
    monkeypatch.delenv("VISA_USER_ID", raising=False)
    monkeypatch.delenv("VISA_PASSWORD", raising=False)
    monkeypatch.delenv("VISA_MLE_KEY_ID", raising=False)
    monkeypatch.delenv("VISA_MLE_SERVER_CERT_PATH", raising=False)
    monkeypatch.delenv("VISA_MLE_CLIENT_KEY_PATH", raising=False)
    monkeypatch.setenv("PAYMENT_INTENT_SECRET", "test-payment-intent-secret")
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("PUDDLE_ANTHROPIC_KEY", raising=False)
