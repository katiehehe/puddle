"""The pond: money not spent, made visible."""

from __future__ import annotations

import json
import threading
from pathlib import Path

POND_PATH = Path(__file__).resolve().parent.parent / "data" / "pond.json"
_lock = threading.Lock()
_SEED = {"saved": 312.0, "skips": 4}


def _read() -> dict:
    if not POND_PATH.exists():
        POND_PATH.parent.mkdir(parents=True, exist_ok=True)
        POND_PATH.write_text(json.dumps(_SEED))
    return json.loads(POND_PATH.read_text())


def state() -> dict:
    return _read()


def add(amount: float) -> dict:
    with _lock:
        current = _read()
        current["saved"] = round(current["saved"] + amount, 2)
        current["skips"] += 1
        POND_PATH.write_text(json.dumps(current))
        return current
