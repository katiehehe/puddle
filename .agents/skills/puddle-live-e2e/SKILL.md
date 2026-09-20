---
name: puddle-live-e2e
description: Test Puddle's Chrome extension and embedded demo against the local brain, including shared state, voice fallback, and Visa sandbox settlement.
---

# Puddle live E2E

## Setup
- Start the brain from the repo root: `.venv/bin/uvicorn brain.app:app --port 8000`; capture stdout to a log so actual POSTs can be distinguished from fallback.
- Start `python3 -m http.server 5500` in `mock-shop/` and `npm run dev` in `web/` after `source ~/.nvm/nvm.sh`. Alternatively use `./run.sh`.
- Load `extension/` unpacked at `chrome://extensions`, pin Puddle, and open `http://localhost:5500` and `http://localhost:5173`.
- After extension changes, reload the extension AND the storefront tab; attach the background service-worker console before checkout flows.
- For folder pickers that do not accept a path, navigate to the extension directory via the folder tree.
- Also test `http://localhost:8000/demo`: its HTTP transport differs from the extension service worker. Refresh after changes to injected scripts.
- Preserve existing user state. Storage defaults to `data/puddle.sqlite3`; an isolated temporary `PUDDLE_DB_PATH` is useful when earlier purchases have already filled the coverage gap. Set it before starting the brain. Do not delete the user's original database.

## Devin Secrets Needed
- None for typed Q&A, browser-speech fallback, or mock payment testing.
- Real Visa sandbox requires configured `VISA_API_KEY`, `VISA_SHARED_SECRET`, `VISA_USER_ID`, `VISA_PASSWORD`, and valid files referenced by `VISA_CERT_PATH`, `VISA_KEY_PATH`, `VISA_MLE_SERVER_CERT_PATH`, `VISA_MLE_CLIENT_KEY_PATH`, plus `VISA_MLE_KEY_ID`. Verify presence only; never print secret values.
- Hosted speech requires `ELEVENLABS_API_KEY`; transcription requires `DEEPGRAM_API_KEY`. Missing keys are valid fallback test conditions, not evidence of successful hosted speech/transcription.

## Checkout and shared state
- Read current `GET /pond` and `/portfolio` first; do not assume seed totals.
- Boots ($128): concerned duck, fifth size-8 boots/four returned insight, chip, enabled Buy anyway. Skip must increase server-backed pond by $128 and produce POST /skip 200.
- Crewneck ($68): redundancy insight for three crewnecks. A negative recommendation must still allow buying.
- Suit ($320): approving duck and Formal/interview gap if not already owned. Buy anyway must produce POST /checkout 200 and persist a bought action and holding.
- A VISA-labelled confirmation alone does not prove network settlement. Inspect the actual checkout response: `mode=visa_sandbox`, `approved=true`, and the provider message. Current provider approves only Visa action code `00`; distinguish that gated result from directly capturing the upstream payload.
- Open popup and reload dashboard; both must agree with brain pond and show live data and new ledger entries. New predictions remain pending until graded, so accuracy need not change.
- Repeat checkout on the same item. For timing regression, skip and trigger another checkout inside two seconds, then wait more than three seconds and verify the replacement card remains actionable.
- Check page, dashboard, and worker consoles for application errors. Expected speech 503 and favicon 404 resource errors are distinct from uncaught exceptions.

## Voice fallback and cancellation
- Exercise both embedded demo and extension, using visible typed question input and Ask. Submit an explanation question followed by a size-change question; confirm answers render.
- With ElevenLabs unset, `/voice/status` reports `speech=browser`. The first shared-speaker call should hit `/voice/speak` and return 503 with `Hosted speech is not configured.`; `PuddleSpeech.hosted` then latches false. Later replies in that page should not make more hosted speech requests.
- Wrap real native `speechSynthesis.cancel` and `speak` with pass-through observers, not mocks, to record ordering and utterance start/end/error events. Verify cancellation before each new reply and no additional native speak for muted replies.
- For the extension, select the active Puddle isolated execution world in DevTools before instrumenting. Reloaded pages can leave stale contexts; verify `PuddleSpeech` exists before evaluating probes.
- Browser machines may expose zero voices and emit `synthesis-failed`. In that case prove cancellation bookkeeping only, and explicitly leave audible playback and interruption of actively audible speech untested.
- Inspect observed voice response fields for credentials. With keys absent, do not claim configured-provider credential non-disclosure has been tested.

## Hosted speech
- After enabling ElevenLabs in the brain, refresh both surfaces: a page that previously latched `hosted=false` will otherwise keep using browser speech.
- Observe the real `Audio` constructor, `play`/`pause`, `URL.createObjectURL`/`revokeObjectURL`, and media events with pass-through wrappers. Keep audio playback unmodified; expose only diagnostic playback state in a clearly labelled overlay.
- Expect successful `voice_speak` responses to contain exactly `audio`, `mime`, `provider`, with provider `elevenlabs` and MIME `audio/mpeg`. Check real `playing` events and advancing currentTime, not only HTTP success.
- Submit a second typed question while the first answer is actively playing. Prove its pause occurred at `0 < currentTime < duration` with paused=false immediately before cancellation. Match the revoked URL to that exact audio, then verify replacement playback starts afterward and maximum simultaneously playing elements stays one per surface.
- Clearing the retired element's src can emit a handled `MEDIA_ELEMENT_ERROR: Empty src attribute`. Distinguish this cleanup event from uncaught exceptions, failed replacement playback, or browser-speech fallback.
- Scan captured browser responses, headers, DOM/shadow state, storage and worker console against the real configured secret in a local process using secret env binding. Never inject the secret into Chrome and never persist unredacted secret-bearing evidence.

## Evidence
- The duck is in the open shadow root of `#puddle-root`; buttons are `#buy` and `#skip`, and text is `.line`.
- Confirmation cards auto-dismiss in roughly 2–2.6 seconds. Capture immediately; consecutive screenshot calls may be too slow.
- For timing races, batch native pointer actions and use read-only click/MutationObserver instrumentation. Do not substitute scripted DOM clicks for UI flow.
- Record GUI actions and compare server POST logs and persisted actions, not only card copy: the extension has an offline fallback.
- Distinguish native speech errors, diagnostic probe errors, expected hosted unconfigured responses, and actual uncaught application errors.
