"""Persistent prediction ledger. Accuracy starts empty, without seeded successes."""

from . import storage

entries = storage.predictions
grade = storage.grade


def accuracy():
    graded = [e for e in entries() if e["graded"]]
    right = sum(e["correct"] for e in graded)
    return {"right": right, "total": len(graded), "pct": right / len(graded) if graded else None}


def accuracy_label():
    a = accuracy()
    return f"{a['right']}/{a['total']}"
