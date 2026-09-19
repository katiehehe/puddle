#!/usr/bin/env bash
# Start the Puddle stack: brain (8000), mock shop (5500), web (5173).
# Load the extension manually: chrome://extensions -> Load unpacked -> ./extension
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "→ brain on :8000"
[ -d "$ROOT/.venv" ] || python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/pip" install -q -e "$ROOT[dev]"
("$ROOT/.venv/bin/uvicorn" brain.app:app --app-dir "$ROOT" --port 8000) &
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
