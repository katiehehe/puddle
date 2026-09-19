#!/usr/bin/env bash
# Start the Puddle stack: brain (8000), mock shop (5500), web (5173).
# Load the extension manually: chrome://extensions -> Load unpacked -> ./extension
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "→ brain on :8000"
(cd "$ROOT/brain" && [ -d .venv ] || python3 -m venv .venv; .venv/bin/pip install -q -r requirements.txt; .venv/bin/uvicorn app:app --port 8000) &
BRAIN=$!

echo "→ mock shop on :5500"
(cd "$ROOT/mock-shop" && python3 -m http.server 5500 >/dev/null 2>&1) &
SHOP=$!

echo "→ web on :5173"
(cd "$ROOT/web" && [ -d node_modules ] || npm install; npm run dev) &
WEB=$!

echo ""
echo "Puddle up:"
echo "  shop      http://localhost:5500   (click Checkout to summon the duck)"
echo "  dashboard http://localhost:5173"
echo "  brain     http://localhost:8000/health"
echo "  extension load ./extension via chrome://extensions (Developer mode)"
echo ""
echo "Ctrl-C to stop all."
trap "kill $BRAIN $SHOP $WEB 2>/dev/null" EXIT
wait
