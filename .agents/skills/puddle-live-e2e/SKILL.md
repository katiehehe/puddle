---
name: puddle-live-e2e
description: Test the Puddle Chrome extension against its local FastAPI brain and React dashboard, including shared pond state and rapid checkout races.
---

# Puddle live E2E

## Setup
- Start the brain from the repo root: `.venv/bin/uvicorn brain.app:app --port 8000`; capture stdout to a log so actual POSTs can be distinguished from extension fallback.
- Start `python3 -m http.server 5500` in `mock-shop/` and `npm run dev` in `web/` after `source ~/.nvm/nvm.sh`.
- Load `extension/` unpacked at `chrome://extensions`, pin Puddle, and open `http://localhost:5500` and `http://localhost:5173`.
- After extension changes, reload the extension AND the storefront tab; attach the background service-worker console before running checkout flows.
- For folder pickers that do not accept a path, navigate to the extension directory via the folder tree.

## Devin Secrets Needed
- None for the local demo and documented mock/sandbox payment path.
- Do not claim real Visa network settlement without the separately configured Visa credentials.

## Assertions
- Read the current `GET /pond` and `/portfolio` first. State is persisted in `data/pond.json` and `data/ledger.json`; do not assume seed totals or reset user state.
- Boots ($128): concerned duck, fifth size-8 boots/four returned insight, chip, enabled Buy anyway. Skip must increase the server-backed pond by $128 and produce POST /skip 200.
- Crewneck ($68): redundancy insight for three crewnecks. A negative recommendation must still allow buying.
- Suit ($320): approving duck and Formal/interview gap; Buy anyway must produce POST /checkout 200 and the documented sandbox confirmation.
- Open popup and reload dashboard; both must agree with the brain pond, and the dashboard must show the live badge plus new ledger entries. Newly actioned predictions remain pending until graded, so existing graded accuracy need not change.
- Repeat checkout on the same item. Also skip an item and trigger another checkout inside two seconds, then wait more than three seconds and verify the replacement card is still actionable.
- Confirm page, dashboard, and worker consoles have no application errors. A favicon 404 is separate from a brain failure.

## Evidence
- The duck is in the open shadow root of `#puddle-root`; buttons are `#buy` and `#skip`, and text is `.line`.
- Confirmation cards auto-dismiss in roughly 2–2.6 seconds. Capture immediately after clicking; ordinary consecutive screenshot calls may be too slow.
- For timing races, batch native pointer actions and use read-only click/MutationObserver instrumentation to document the elapsed time and host lifetime. Do not substitute scripted DOM clicks for the UI flow.
- Record GUI actions and compare server POST logs and persisted actions, not only card copy: the extension has an offline fallback.
- Audio output can be unavailable on the test machine; report audible speech as untested rather than assuming success.
