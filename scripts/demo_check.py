#!/usr/bin/env python3
"""Wipe demo state, then prove the three beats still land. Run this before you
walk up, not an hour before.

    python3 scripts/demo_check.py            # reset, then verify
    python3 scripts/demo_check.py --no-reset # verify only, keep state
    python3 scripts/demo_check.py --hour 23  # score as if it were 11:40pm

Standard library only, so it runs with any python3 and needs no venv.
Exit code is 0 when the demo is safe to give, 1 when it is not.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BRAIN = os.environ.get("PUDDLE_BRAIN", "http://localhost:8000")
SHOP = "http://localhost:5500"
DASH = "http://localhost:5173"
DB = Path(os.environ.get("PUDDLE_DB_PATH", "data/puddle.sqlite3"))
CLOSET_SIZE = 26  # brain/catalog.py CLOSET; a purchase during testing inflates this

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    GREEN = RED = YELLOW = DIM = RESET = ""

failures: list[str] = []
warnings: list[str] = []


def ok(msg: str) -> None:
    print(f"  {GREEN}ok{RESET}    {msg}")


def bad(msg: str) -> None:
    failures.append(msg)
    print(f"  {RED}FAIL{RESET}  {msg}")


def warn(msg: str) -> None:
    warnings.append(msg)
    print(f"  {YELLOW}warn{RESET}  {msg}")


def get(path: str, base: str = BRAIN):
    with urllib.request.urlopen(f"{base}{path}", timeout=8) as r:
        return json.load(r)


def post(path: str, payload: dict):
    req = urllib.request.Request(
        f"{BRAIN}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def reachable(url: str) -> bool:
    try:
        urllib.request.urlopen(url, timeout=5)
        return True
    except urllib.error.HTTPError:
        return True  # answered, just not 200
    except Exception:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-reset", action="store_true", help="keep existing state")
    ap.add_argument("--hour", type=int, default=23, help="hour to score at (default 23)")
    args = ap.parse_args()

    print(f"\n{DIM}Puddle demo check{RESET}\n")

    # --- state ------------------------------------------------------------
    print("State")
    if args.no_reset:
        warn("keeping existing state (--no-reset); a stray test purchase will show")
    elif DB.exists():
        DB.unlink()
        ok(f"wiped {DB} (schema is recreated on the next request)")
    else:
        ok(f"{DB} already clean")

    # --- services ---------------------------------------------------------
    print("\nServices")
    if not reachable(f"{BRAIN}/health"):
        bad(f"brain not answering on {BRAIN} — start it with ./run.sh")
        return report()
    ok(f"brain up on {BRAIN}")
    for label, url in (("mock shop", SHOP), ("dashboard", DASH)):
        (ok if reachable(url) else warn)(
            f"{label} {'up' if reachable(url) else 'NOT up'} on {url}"
        )

    # --- keys -------------------------------------------------------------
    print("\nIntegrations")
    health = get("/health?check_payments=true")
    if health.get("payments") == "mock":
        warn("Visa in MOCK mode — checkout will say '(simulated)'. Set VISA_API_KEY + VISA_SHARED_SECRET")
    else:
        check = health.get("payments_check") or {}
        if check.get("reachable"):
            ok(f"Visa live and answering ({health['payments']}: {check.get('detail')})")
        else:
            # Distinguish "Visa said no" from "we never got there". A 4xx means
            # the credentials are wrong; anything else means the network or the
            # TLS trust store is, and no key will fix that.
            detail = str(check.get("detail", "?"))
            if detail.startswith("HTTP 4"):
                bad(f"Visa rejected the credentials ({detail}) — check VISA_API_KEY / VISA_SHARED_SECRET")
            else:
                bad(f"Visa unreachable ({detail}) — network or certificate problem, not a key problem")
    voice = get("/voice/status")
    if voice.get("configured"):
        ok(f"voice configured ({voice.get('provider')}/{voice.get('model')})")
    else:
        warn("voice NOT configured — push-to-talk is dead. Put DEEPGRAM_API_KEY in .env")

    # --- clean-state sanity ----------------------------------------------
    print("\nClean state")
    board = get("/portfolio")
    n = len(board["holdings"])
    (ok if n == CLOSET_SIZE else bad)(
        f"closet has {n} items (expected {CLOSET_SIZE})"
        + ("" if n == CLOSET_SIZE else " — a test purchase is still in the closet")
    )
    pond = board["pond"]
    (ok if not pond.get("saved") else bad)(f"pond starts at ${pond.get('saved', 0)}")

    # --- the three beats --------------------------------------------------
    print(f"\nDemo beats (scored at hour {args.hour})")
    beats = [
        ("boots", "sku_991", "skip", "concerned", ["size-8 boots", "returned"]),
        ("crewneck", "sku_992", "skip", "concerned", ["already"]),
        ("suit", "sku_999", "buy", "approving", ["nothing for"]),
    ]
    for label, item_id, want_decision, want_duck, must_contain in beats:
        try:
            r = post("/score_item", {"item_id": item_id, "now_hour": args.hour})
        except Exception as exc:  # noqa: BLE001
            bad(f"{label}: scoring failed — {exc}")
            continue
        head = r.get("headline", "")
        problems = []
        if r.get("decision") != want_decision:
            problems.append(f"decision={r.get('decision')} (want {want_decision})")
        if r.get("duck_state") != want_duck:
            problems.append(f"duck={r.get('duck_state')} (want {want_duck})")
        missing = [w for w in must_contain if w.lower() not in head.lower()]
        if missing:
            problems.append(f"headline missing {missing}")
        if problems:
            bad(f"{label}: " + "; ".join(problems))
            print(f"        {DIM}{head[:90]}{RESET}")
        else:
            ok(f"{label}: {want_decision}/{want_duck}")
            print(f"        {DIM}“{head[:86]}”{RESET}")

    # --- the two surfaces must agree -------------------------------------
    print("\nOne brain, two surfaces")
    board = get("/portfolio")
    reb = board["rebalance"]
    skips = {x["title"] for x in reb["skip"]}
    buys = {x["title"] for x in reb["buy"]}
    (ok if any("Chelsea" in t for t in skips) else bad)(
        "dashboard lists the boots under Skip (never Buy)"
    )
    (ok if any("suit" in t.lower() for t in buys) else bad)(
        "dashboard lists the suit under Buy"
    )
    boots = next((x for x in reb["skip"] if "Chelsea" in x["title"]), None)
    if boots and boots.get("reasons"):
        ok(f"skip row quotes the duck: “{boots['reasons'][0][:64]}…”")
    else:
        warn("skip row carries no reason text")

    gaps = [c["label"] if "label" in c else c["state"] for c in board["coverage"] if not c.get("covered", True)]
    (ok if gaps else warn)(f"coverage gaps the radar will show red: {gaps or 'none'}")

    # --- the backup -------------------------------------------------------
    print("\nBackup")
    if any(Path(".").glob("**/*.mp4")) or any(Path(".").glob("**/*.mov")):
        ok("a recording exists in the repo")
    else:
        warn("no recorded backup in the repo — PRD 9 wants one for the wifi-off case")
    ok(f"no-extension fallback: {BRAIN}/demo")

    return report()


def report() -> int:
    print()
    if failures:
        print(f"{RED}NOT READY{RESET} — {len(failures)} blocking problem(s):")
        for f in failures:
            print(f"  - {f}")
    else:
        print(f"{GREEN}READY{RESET} — all three beats land and the surfaces agree.")
    if warnings:
        print(f"\n{YELLOW}{len(warnings)} thing(s) to know:{RESET}")
        for w in warnings:
            print(f"  - {w}")
    print()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
