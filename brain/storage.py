"""Single-user demo state. SQLite serializes action writes across workers."""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


@contextmanager
def connect():
    path = Path(os.environ.get("PUDDLE_DB_PATH", "data/puddle.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS predictions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS actions (
            event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
            item_id TEXT NOT NULL, variant TEXT NOT NULL, action TEXT NOT NULL,
            amount_cents INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS purchases (variant TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS closet_log (
            id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
    """)
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def now():
    return datetime.now(timezone.utc).isoformat()


def variant(item):
    return json.dumps([item.id, item.size], separators=(",", ":"))


def pond(db=None):
    if db is None:
        with connect() as connection:
            return pond(connection)
    # A later purchase reverses avoided spending for this item/size. Multiple
    # skip events remain auditable but only the latest action counts.
    rows = db.execute("""SELECT a.action, a.amount_cents FROM actions a
        WHERE a.rowid = (SELECT MAX(b.rowid) FROM actions b WHERE b.variant=a.variant)""").fetchall()
    skipped = [r for r in rows if r["action"] == "skip"]
    return {"saved": sum(r["amount_cents"] for r in skipped) / 100, "skips": len(skipped)}


def predictions():
    with connect() as db:
        return [json.loads(r[0]) for r in db.execute("SELECT data FROM predictions ORDER BY rowid DESC")]


def record(item, line, decision, state, confidence):
    pid = "p_" + uuid.uuid4().hex
    entry = dict(
        id=pid,
        item=item.title,
        item_id=item.id,
        variant=variant(item),
        call=decision,
        line=line,
        duck_state=state,
        confidence=confidence,
        created_at=now(),
        graded=False,
        correct=None,
        user_action=None,
        seeded=False,
    )
    with connect() as db:
        db.execute("INSERT INTO predictions VALUES (?, ?)", (pid, json.dumps(entry)))
    return pid


def grade(pid, correct):
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT data FROM predictions WHERE id=?", (pid,)).fetchone()
        if row is None:
            return None
        entry = json.loads(row[0])
        entry.update(graded=True, correct=correct)
        db.execute("UPDATE predictions SET data=? WHERE id=?", (json.dumps(entry), pid))
        return entry


def owned():
    with connect() as db:
        return [json.loads(r[0]) for r in db.execute("SELECT data FROM purchases")]


def closet_log():
    """Items the wearer added by hand, newest first."""
    with connect() as db:
        rows = db.execute("SELECT data FROM closet_log ORDER BY created_at DESC, rowid DESC")
        return [json.loads(r[0]) for r in rows]


def add_to_closet(entry):
    """Save one logged item and hand back what was stored."""
    record_id = entry.get("id") or "log_" + uuid.uuid4().hex[:10]
    saved = {**entry, "id": record_id, "created_at": entry.get("created_at") or now()}
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO closet_log (id, created_at, data) VALUES (?,?,?)",
            (record_id, saved["created_at"], json.dumps(saved)),
        )
    return saved


def remove_from_closet(record_id):
    with connect() as db:
        cur = db.execute("DELETE FROM closet_log WHERE id=?", (record_id,))
        return cur.rowcount > 0


def actions():
    with connect() as db:
        return [json.loads(r[0]) for r in db.execute("SELECT data FROM actions ORDER BY rowid DESC")]


class Conflict(ValueError):
    pass


def act(event_id, item, action, prediction_id=None, pay=None):
    """Atomic local action + purchase + prediction update; retries return the saved result.

    Payment providers must implement upstream idempotency before real payment
    deployment: a process crash after payment but before commit is ambiguous.
    """
    fingerprint = json.dumps([item.dict(), action, prediction_id], sort_keys=True)
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute("SELECT * FROM actions WHERE event_id=?", (event_id,)).fetchone()
        if previous:
            if previous["fingerprint"] != fingerprint:
                raise Conflict("event_id already belongs to a different request")
            return {"event": json.loads(previous["data"]), "duplicate": True, "pond": pond(db)}
        if db.execute("SELECT 1 FROM purchases WHERE variant=?", (variant(item),)).fetchone():
            raise Conflict("item is already purchased")
        prediction = None
        if prediction_id:
            row = db.execute("SELECT data FROM predictions WHERE id=?", (prediction_id,)).fetchone()
            if not row:
                raise KeyError("prediction not found")
            prediction = json.loads(row[0])
            if prediction["variant"] != variant(item):
                raise Conflict("prediction belongs to a different item or size")
        payment = pay() if pay else None
        effective = action if payment is None or payment["approved"] else "payment_failed"
        event = dict(
            event_id=event_id,
            item_id=item.id,
            item=item.dict(),
            action=effective,
            requested_action=action,
            prediction_id=prediction_id,
            created_at=now(),
            payment=payment,
        )
        # Failed payments must not replace a prior skip or change the wardrobe.
        key = variant(item) if effective != "payment_failed" else "failed:" + event_id
        db.execute(
            "INSERT INTO actions VALUES (?, ?, ?, ?, ?, ?, ?)",
            (event_id, fingerprint, item.id, key, effective, round(item.price * 100), json.dumps(event)),
        )
        if effective == "buy":
            db.execute("INSERT OR REPLACE INTO purchases VALUES (?, ?)", (variant(item), json.dumps(item.dict())))
        if prediction and effective != "payment_failed":
            prediction["user_action"] = "bought" if effective == "buy" else "skipped"
            db.execute("UPDATE predictions SET data=? WHERE id=?", (json.dumps(prediction), prediction_id))
        return {"event": event, "duplicate": False, "pond": pond(db)}
