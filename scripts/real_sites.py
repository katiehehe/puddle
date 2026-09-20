#!/usr/bin/env python3
"""Turn the extension's real-website mode on or off.

    python3 scripts/real_sites.py on          # every https site
    python3 scripts/real_sites.py on shopify  # a safer curated list
    python3 scripts/real_sites.py off         # back to localhost only
    python3 scripts/real_sites.py status

Reload the extension at chrome://extensions afterwards -- a manifest change
does not take effect until you do.
"""

import json
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "extension" / "manifest.json"

LOCAL = [
    "http://localhost:5500/*", "http://127.0.0.1:5500/*",
    "http://localhost:8000/*", "http://127.0.0.1:8000/*",
]

# Shopify-hosted stores publish schema.org Product JSON-LD almost universally,
# which is the extraction path we are most confident in. Good place to prove
# the capability without meeting Amazon's markup on demo day.
CURATED = [
    "https://*.myshopify.com/*",
    "https://www.allbirds.com/*",
    "https://www.gymshark.com/*",
    "https://us.kotn.com/*",
    "https://www.everlane.com/*",
]

ALL = ["https://*/*"]


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    scripts = manifest["content_scripts"][0]
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    which = sys.argv[2] if len(sys.argv) > 2 else "all"

    if mode == "status":
        extra = [m for m in scripts["matches"] if m not in LOCAL]
        print("real-site mode: " + ("ON" if extra else "off"))
        for m in scripts["matches"]:
            print(f"  {m}")
        return 0

    if mode == "on":
        extra = CURATED if which == "shopify" else ALL
        scripts["matches"] = LOCAL + extra
        note = "curated storefronts" if which == "shopify" else "EVERY https site"
    elif mode == "off":
        scripts["matches"] = list(LOCAL)
        note = "localhost only"
    else:
        print(__doc__)
        return 2

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"matches -> {note}")
    for m in scripts["matches"]:
        print(f"  {m}")
    print("\nNow: chrome://extensions -> Puddle -> Reload")
    if mode == "on" and which != "shopify":
        print(
            "\nNote: this injects the duck into every https page you visit.\n"
            "It stays silent unless it finds a buy button AND can read a product,\n"
            "but turn it off after the demo."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
