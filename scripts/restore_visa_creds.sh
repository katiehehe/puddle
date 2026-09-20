#!/usr/bin/env bash
# Rebuild the Visa sandbox credentials on a fresh machine.
#
# Visa Direct needs four PEM files as well as six env vars, and a Devin secret
# holds a single string -- so PUDDLE_VISA_BUNDLE is a base64 gzipped tar of the
# certificates plus an env.sh that points at wherever they land. Without this
# the demo silently settles against the mock provider instead of Visa.
#
#   export PUDDLE_VISA_BUNDLE=...      # from the saved secret
#   source scripts/restore_visa_creds.sh
#   .venv/bin/uvicorn brain.app:app --port 8000
#
# Sourcing matters: the script exports into the calling shell.

set -u

PUDDLE_VISA_DIR="${PUDDLE_VISA_DIR:-$HOME/.puddle-visa}"

if [ -z "${PUDDLE_VISA_BUNDLE:-}" ]; then
  echo "PUDDLE_VISA_BUNDLE is not set -- checkout will fall back to the mock provider." >&2
  return 1 2>/dev/null || exit 1
fi

mkdir -p "$PUDDLE_VISA_DIR"
chmod 700 "$PUDDLE_VISA_DIR"
printf '%s' "$PUDDLE_VISA_BUNDLE" | base64 -d | tar -xz -C "$PUDDLE_VISA_DIR"
chmod 600 "$PUDDLE_VISA_DIR"/certs/* "$PUDDLE_VISA_DIR/env.sh"

export PUDDLE_VISA_DIR
# shellcheck source=/dev/null
. "$PUDDLE_VISA_DIR/env.sh"

echo "Visa credentials restored to $PUDDLE_VISA_DIR"
