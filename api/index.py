"""Vercel entrypoint: one serverless function serving the whole FastAPI app.

Vercel's filesystem is read-only outside /tmp, so the demo database is seeded
from the committed snapshot into /tmp on cold start. Writes stick for the
life of a warm instance and reset when Vercel recycles it -- fine for a demo,
not a real store.
"""

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

TMP_DB = Path("/tmp/puddle.sqlite3")
SEED = ROOT / "data" / "seed.sqlite3"
if not TMP_DB.exists():
    TMP_DB.parent.mkdir(parents=True, exist_ok=True)
    if SEED.exists():
        shutil.copy(SEED, TMP_DB)
os.environ.setdefault("PUDDLE_DB_PATH", str(TMP_DB))

from brain.app import app  # noqa: E402
