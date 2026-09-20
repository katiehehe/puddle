#!/usr/bin/env python3
"""Validate a personal wardrobe file and show what the duck would make of it.

    PUDDLE_WARDROBE=my_wardrobe.json python3 scripts/wardrobe_check.py

Reports what was inferred from each title, what the resulting life mix and
coverage look like, and whether your history gives the duck anything to say.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if not os.environ.get("PUDDLE_WARDROBE"):
    print("Set PUDDLE_WARDROBE first, e.g.\n"
          "  PUDDLE_WARDROBE=my_wardrobe.json python3 scripts/wardrobe_check.py")
    raise SystemExit(2)

from brain.wardrobe import WardrobeError, load  # noqa: E402

try:
    data = load()
except WardrobeError as exc:
    print(f"\n  Cannot use this wardrobe:\n    {exc}\n")
    raise SystemExit(1) from None

closet = data["closet"]
print(f"\nRead {len(closet)} items and {len(data['purchases'])} purchases "
      f"from {data['source']}\n")

print("What was inferred from your titles")
print(f"  {'item':28} {'category':10} {'kind':16} form warm rain")
for item in closet:
    print(f"  {item.title[:27]:28} {item.category:10} {str(item.kind):16} "
          f"{item.formality:^4} {item.warmth:^4} {str(item.rain_ok):5}")

from brain.history import purchases, wears  # noqa: E402
from brain.portfolio import Closet  # noqa: E402
from brain.states import life_mix  # noqa: E402

mix = life_mix([w.dict() for w in wears()])
c = Closet(closet, mix)

print("\nYour life mix, derived from wear counts")
for k, v in sorted(mix.items(), key=lambda kv: -kv[1])[:8]:
    print(f"  {k:16} {v:5.1%}  {'#' * int(v * 60)}")

print(f"\nStyle Sharpe: {c.sharpe:.3f}")
print("\nCoverage")
for row in c.coverage():
    flag = "" if row["covered"] else "   <-- GAP, the duck will greenlight things here"
    print(f"  {row['label'][:24]:26} {row['best']:.2f}{flag}")

buys = purchases()
returned = [p for p in buys if p.returned]
print(f"\nHistory: {len(buys)} purchases, {len(returned)} returned "
      f"({len(returned) / max(len(buys), 1):.0%} baseline)")
late = [p for p in buys if p.hour >= 23 or p.hour <= 2]
late_ret = [p for p in late if p.returned]
if late:
    print(f"  late-night ({len(late)} buys): {len(late_ret) / len(late):.0%} returned")

from collections import Counter  # noqa: E402

worst = Counter((p.kind, p.size) for p in returned).most_common(3)
print("\nWhat the duck has to work with")
if not returned:
    print("  Nothing was returned, so the duck's strongest line is unavailable.")
    print("  Add the things you actually sent back -- that is the whole point.")
for (kind, size), n in worst:
    if n >= 3:
        print(f"  {n}x returned {kind}" + (f" size {size}" if size else "")
              + "  -> return_pattern will fire")
    else:
        print(f"  {n}x returned {kind}" + (f" size {size}" if size else "")
              + "  (needs 3+ to fire)")

dupes = [(i.title, [d["title"] for d in c.evaluate(i)["redundant_with"] if d["id"] != i.id])
         for i in closet]
dupes = [(t, d) for t, d in dupes if len(d) >= 2]
if dupes:
    print(f"  {len(dupes)} item(s) with 2+ duplicates -> redundancy will fire")
else:
    print("  No item has 2+ duplicates, so redundancy will not fire.")
print()
