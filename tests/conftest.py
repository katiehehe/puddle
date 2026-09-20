import pytest


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setenv("PUDDLE_DB_PATH", str(tmp_path / "state.sqlite3"))
    monkeypatch.delenv("VISA_API_KEY", raising=False)
    monkeypatch.delenv("VISA_SHARED_SECRET", raising=False)
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
