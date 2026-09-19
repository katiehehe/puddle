"""Prediction ledger.

Every time the duck speaks it records what it said and how sure it was. When
the user later grades the call, the record is closed. The running accuracy is
public in the UI -- a system that admits when it was wrong earns the right to
interrupt.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

LEDGER_PATH = Path(__file__).resolve().parent.parent / "data" / "ledger.json"
_lock = threading.Lock()

SEED_ENTRIES = [
    {
        "id": "p_0001",
        "item": "Faux-leather pants",
        "call": "skip",
        "line": "Third pair you've bought at midnight. You returned both others.",
        "duck_state": "concerned",
        "confidence": 0.71,
        "created_at": "2025-11-14T23:41:00+00:00",
        "graded": True,
        "correct": True,
        "user_action": "skipped",
    },
    {
        "id": "p_0002",
        "item": "Wool coat",
        "call": "buy",
        "line": "You have nothing warm and formal. This covers it.",
        "duck_state": "approving",
        "confidence": 0.62,
        "created_at": "2025-12-02T16:10:00+00:00",
        "graded": True,
        "correct": False,
        "user_action": "bought",
    },
    {
        "id": "p_0003",
        "item": "Sequin halter top",
        "call": "skip",
        "line": "Six going-out tops already. This is the seventh.",
        "duck_state": "concerned",
        "confidence": 0.58,
        "created_at": "2026-01-19T23:05:00+00:00",
        "graded": True,
        "correct": True,
        "user_action": "bought",
    },
]


def _read() -> list[dict]:
    if not LEDGER_PATH.exists():
        LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        LEDGER_PATH.write_text(json.dumps(SEED_ENTRIES, indent=2))
    return json.loads(LEDGER_PATH.read_text())


def _write(entries: list[dict]) -> None:
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    LEDGER_PATH.write_text(json.dumps(entries, indent=2))


def record(item_title: str, line: str, duck_state: str, confidence: float, call: str = "skip") -> str:
    with _lock:
        entries = _read()
        pid = f"p_{uuid.uuid4().hex[:6]}"
        entries.append(
            {
                "id": pid,
                "item": item_title,
                "call": call,
                "line": line,
                "duck_state": duck_state,
                "confidence": round(confidence, 3),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "graded": False,
                "correct": None,
                "user_action": None,
            }
        )
        _write(entries)
        return pid


def act(prediction_id: str, action: str) -> None:
    """Record what the user did -- skipped or bought anyway."""
    with _lock:
        entries = _read()
        for entry in entries:
            if entry["id"] == prediction_id:
                entry["user_action"] = action
                break
        _write(entries)


def grade(prediction_id: str, correct: bool) -> dict | None:
    with _lock:
        entries = _read()
        graded = None
        for entry in entries:
            if entry["id"] == prediction_id:
                entry["graded"] = True
                entry["correct"] = correct
                graded = entry
                break
        _write(entries)
        return graded


def entries() -> list[dict]:
    return sorted(_read(), key=lambda e: e["created_at"], reverse=True)


def accuracy() -> dict:
    graded = [e for e in _read() if e["graded"]]
    right = sum(1 for e in graded if e["correct"])
    return {
        "right": right,
        "total": len(graded),
        "pct": round(right / len(graded), 3) if graded else None,
    }


def accuracy_label() -> str:
    a = accuracy()
    return f"{a['right']}/{a['total']}"
