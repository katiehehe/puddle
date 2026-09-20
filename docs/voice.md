# Puddle voice

Click **Talk to Puddle**, allow microphone access, ask a short question, then
click **Stop and ask**. Recording stops automatically at 20 seconds. Deepgram
Nova-3 transcribes the clip; Puddle answers using the same wardrobe and purchase
history as checkout. Browser speech reads the answer aloud. **Mute replies**
silences responses, and **Cancel recording** discards an unfinished clip.

## Fastest demo path

With the backend running, open **http://localhost:8000/demo** in Chrome or the
in-app browser. This serves the actual mock shop with the same duck and voice
controller used by the extension. No extension installation is required for
this route. Click Checkout, then Talk to Puddle. The microphone permission is
for localhost:8000. Keep the page open while recording.

The Chrome extension remains a separate demo mode on localhost:5500. It ignores
the explicitly embedded /demo page so two duck panels cannot appear.

## Setup

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env  # only if you do not already have a .env file
```

Edit `.env` locally:

```dotenv
DEEPGRAM_API_KEY=your_key_here
```

The server loads the root `.env` automatically. Environment variables take
precedence. Restart the server after changing the file. `.env` is ignored by
Git, and the key is never returned to the extension.

Run these in separate terminals:

```sh
.venv/bin/uvicorn brain.app:app --port 8000
python3 -m http.server 5500 --directory mock-shop
```

In Chrome, open `chrome://extensions`, enable Developer mode, and load the
repository's `extension/` directory. If it is already loaded, click its Reload
button. Reload `http://localhost:5500`, click Checkout, and use the voice panel.
The manifest loads `voice.js` before `content.js`; reloading only the shop after
an extension update is not sufficient.

The microphone permission belongs to the controlled localhost shop. Capture
runs in the content script, not the MV3 service worker. HTTPS or localhost is
required for browser microphone access. The manifest still targets localhost
only; arbitrary retailer support is outside this change.

## Without a key

The app still starts. Talk to Puddle is disabled with a clear message, but
**Or type a question** exercises the same response and speech-output path.
There is no fake transcription or substituted recording. `GET /voice/status`
reports `configured: true` when a non-empty key is loaded; this reports presence,
not validity. Actual transcription checks the credentials with Deepgram.

## Supported questions

- “Why should I skip these?” explains the current item.
- “Should I buy this?” checks the same recommendation.
- “What about size nine?” evaluates that size without changing the cart.
- “What should I get instead?” suggests eligible items from the demo catalog.
- “Skip this” shows **Confirm skip**. Only clicking it records the action.
- “Buy it” points to checkout; voice never places an order.

This is a small deterministic intent handler, not a general conversation model.
Unknown questions get a list of supported requests. No LLM API key is required.
The response handler itself does not change savings, predictions or purchases.
Confirmed skips use the persistent action API with a retry-safe event ID. The
existing Skip button now uses the same API so the two entry points agree.

## API

- `GET /voice/status`: provider, configuration presence, model and recording limits.
- `POST /voice/transcribe`: raw audio body with an audio Content-Type. Supported:
  WebM, Ogg, WAV, MP4, MP3. Limit: 2 MiB. Returns `{transcript, provider}`.
- `POST /voice/respond`: `{transcript, item_id}` or `{transcript, item}`;
  optional `now_hour`. Returns answer, intent, decision, item, pending_action,
  alternatives, and evaluated_item for a size question.

Errors: 413 oversized recording; 415 unsupported format; 422 empty audio/speech
or invalid question; 503 missing configuration or provider rate limit;
502 provider/network failure; 504 transcription timeout. Provider error bodies
are not echoed, so credentials and upstream diagnostics are not exposed.

The extension transfers a bounded base64 recording through Chrome messaging.
The service worker converts it back to bytes and forwards it to the backend.
The backend sends bytes to Deepgram's
[pre-recorded transcription API](https://developers.deepgram.com/docs/pre-recorded-audio)
with `model=nova-3`, `smart_format=true`, and English language settings.
Audio is not written to disk by Puddle. Cancel stops microphone tracks, and
navigating away or replacing the checkout panel also releases them.

## Verification

```sh
.venv/bin/python -m pytest -q
node --test tests/voice-ui.test.cjs
node --check extension/voice.js
```

Tests cover missing keys, transcription transport, bad credentials, timeouts,
empty recordings, intent handling, size questions, non-mutating speech,
record/stop/cancel lifecycle, and permission acquisition after panel disposal.
Microphone hardware, OS permissions and a loaded Chrome extension should also
be checked manually on the demo machine. Browser speech voices depend on the OS;
ElevenLabs and live streaming are not part of this version.
