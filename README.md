# 🦆 Puddle

**A duck that lives in your cart.** It knows everything you already own (modeled as an
investment portfolio) and everything you've sent back: and it speaks up *before* you pay.

**Live: [puddle-xf8u.vercel.app](https://puddle-xf8u.vercel.app)** — the dashboard and
the brain on one origin. The duck itself is a Chrome extension, so it is
[loaded unpacked](#4-extension-the-duck) rather than visited.

Two surfaces, one brain:
- **Extension**: the duck reacts uninvited — parked on a product page before you
  click anything, and again at checkout.
- **Website**: your closet as a risk-return portfolio (Style Sharpe, coverage, rebalance).

See [`PRD.md`](./PRD.md) for the full product spec.

---

## Quick start

### 1. Brain (FastAPI + real portfolio math)
```bash
python3 -m venv .venv                     # Windows: python -m venv .venv
.venv/bin/pip install -e ".[dev]"         # Windows: .venv/Scripts/pip
.venv/bin/python -m pytest -q             # backend math, API and persistence checks
.venv/bin/uvicorn brain.app:app --port 8000   # http://localhost:8000
```

### 2. Website (React dashboard)
```bash
cd web
npm install
npm run dev                                # http://localhost:5173
```

To serve the dashboard from the brain itself (one origin, so it works over a
tunnel or any host), build it instead of running the dev server:
```bash
npm run build                                # then http://localhost:8000/dashboard/
```

### 3. Mock shop (to demo the extension)
```bash
cd mock-shop
python3 -m http.server 5500                # http://localhost:5500
```

### 4. Extension (the duck)
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Open `http://localhost:5500`, pick an item, click **Checkout** → the duck appears.

It also runs on `amazon.com`. There the duck parks in the top-right of a product
page and scores the item on load, rather than waiting for a click that navigates
away — open any clothing product and it appears without being asked. If it does
not, check **Details → Site access** on the extension is not set to *On click*.

Or just run everything: `./run.sh`

---

## Demo script (90 seconds)
1. Open the mock shop on **boots**. Click Checkout.
   → Duck (concerned): *"Fifth pair of size-8 boots you've bought. You returned four of the previous 4."* and *"88% of everything you've returned was bought after 11pm."* Click **Skip** → pond fills.
2. Switch to **crewneck**. Checkout.
   → Duck: *"You own 3 of these already: they cover the same days, and you've worn them 32 times between them."* (redundancy = covariance)
3. Switch to **suit**. Checkout.
   → Duck (approving): *"Get it. You have nothing for 'formal / interview': this is the first thing that covers it."* Tap **Why this is safe** (cap, one-tap-one-charge, declines record nothing, tokenized card) → **Buy anyway** → **Secure checkout** review (item, amount, provider, signed intent) → **Confirm** → Visa receipt: `Visa •••• 6154 · $320 · Visa Direct · Auth 00 · tok_…` (simulated unless `VISA_*` is set). With an LLM key set, the header shows *said by gpt-4o-mini*; hover it for the deterministic line underneath.
4. Open the **dashboard** (`localhost:5173`): Style Sharpe, the coverage radar (Formal + Rain glowing red as gaps), the rebalance trades (suit + blazer under the $500 budget), and the duck's public accuracy ledger.

Close on the line: **retailers run return-prediction models on you and never tell you. We point that model: plus a portfolio of everything you own: at you.**

---

## What's real vs mocked
| Piece | Status |
|---|---|
| Portfolio math (states → μ, Σ, Style Sharpe, alpha buy-rule) | **Real** (numpy, tested) |
| History mining (return / time / redundancy / gap / overexposure) | **Real** |
| Extension → brain → duck overlay + voice | **Real** (Deepgram transcription, ElevenLabs speech output) |
| Prediction ledger + pond | **Real.** SQLite-persisted; extension records skips/buys with idempotent `event_id`s, dashboard reads the same state. |
| Visa checkout | **Signed intent and explicit confirmation are real. Settlement is simulated by default and Visa sandbox remains unverified**: see below. Every buy shows a receipt: card on file (network token, last4), amount, rail, auth code, and the guards that make the tap safe. |
| Duck phrasing | **Optional LLM.** With `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` set, a small model (`gpt-4o-mini` / `claude-haiku-4-5`; `PHRASE_PROVIDER` picks when both keys are set) phrases the verdict from the reasons the math produced; output is rejected if it cites a number it was not given, and cached per set of facts. Without a key the deterministic headline is used unchanged. `/health` reports which. |
| Voice STT/TTS | Deepgram speech-to-text + ElevenLabs `eleven_flash_v2_5` speech out, browser synthesis as fallback; typed questions also supported |

## Visa settlement
A buy is settled as a **Visa Direct push funds transfer**
(`POST /visadirect/fundstransfer/v1/pushfundstransactions` on `sandbox.api.visa.com`),
approved only on ISO action code `00`. Without credentials the same call runs through
`MockProvider`, so the demo works either way.

Checkout first creates a signed, short-lived payment intent. The user reviews
the item, amount, provider mode, and $500 limit before confirming. The default is
clearly labeled **Visa sandbox simulation**. If any Visa setting is present but
the full mutual TLS and encryption setup is incomplete, checkout is disabled
instead of reporting a mock success.

From your Visa Developer project (Visa Direct enabled), export:
```bash
export VISA_API_KEY=...        # project API key
export VISA_SHARED_SECRET=...  # project shared secret
```
X-Pay-Token authenticates Hello World, but Visa Direct itself is two-way SSL only
(it answers `401` otherwise), so also export the certificate Visa issued against your CSR:
```bash
export VISA_CERT_PATH=/path/cert.pem VISA_KEY_PATH=/path/key.pem
export VISA_USER_ID=... VISA_PASSWORD=...   # Credentials -> Two-Way SSL
```
Projects with message level encryption enforced answer `400/9125` to a plaintext body.
Generate a Key-ID under Message Level Encryption, submit a CSR whose `UID` is that Key-ID,
then export:
```bash
export VISA_MLE_KEY_ID=...
export VISA_MLE_SERVER_CERT_PATH=/path/server_cert.pem  # Visa's, encrypts the request
export VISA_MLE_CLIENT_KEY_PATH=/path/mle_key.pem       # yours, decrypts the response
export PAYMENT_INTENT_SECRET=...                        # long random server-only value
```
Check the credentials without spending anything. This calls Visa's Hello World:
```bash
curl 'localhost:8000/health?check_payments=true'
# {"payments":"visa_sandbox","payments_check":{"reachable":true,...}}
```

## Sponsor tracks
Visa (primary) · Ramp (pond of saved money) · Deepgram + ElevenLabs (voice) · Cognition/Devin (build) · Long Lake + Token Company (narrative).

### Visa: Reimagine Shopping
The brief asks for a Generative-AI commerce experience that is intuitive,
personalized and frictionless, with secure and trusted payments. Puddle is the
decision layer between "add to cart" and "pay": it never asks the shopper to do
anything new, it just speaks up once, with numbers, before the charge.

| Journey stage | What Puddle does |
|---|---|
| **Decision-making** | Buy / skip verdict from the shopper's own closet and return history: redundancy (covariance with what they own), priced return risk, the most the item is worth paying. |
| **Personalization** | Every number comes from that person's wardrobe, wears and returns. No segment, no cohort: the duck for two shoppers never says the same thing. |
| **Checkout** | One tap. Signed, short-lived payment intent → review (item, amount, provider, $500 cap) → confirm. Blocked amounts are visible before the tap, not after. |
| **Payments** | Visa Direct push-funds behind one provider interface; simulated by default, sandbox with credentials, never a silent mock success. Receipt shows card on file (network token, last4), rail, auth code. |
| **Post-purchase** | Pond of money not spent, and a public ledger of whether the duck was right (bought-and-kept, bought-and-returned). |
| **Discovery** | Dashboard coverage radar names the gaps (formal, rain) and the rebalance trades that close them under budget. |
| **Loyalty and rewards** | Not built. The pond is the hook: skipped-and-not-regretted decisions could earn cashback-style rewards. |

**Generative AI, kept honest.** The verdict and every number are deterministic
(numpy, tested). A small model (`gpt-4o-mini` or Claude Haiku) only phrases the
reasons the math already produced, is rejected if it cites a number it was not
given, and is cached per set of facts. Without a key, the deterministic line is
used unchanged. The shopper can always see the math the model is paraphrasing.

**Secure and trusted, made visible.** "Why this is safe" at checkout lists the
four guards: a $500 cap per purchase, one tap = one charge (retries are
deduplicated on `event_id`), a decline records nothing (no closet change, no
pond change), and the card number never leaves the network token. Payment
intents are signed server-side and expire; a partial Visa configuration
disables checkout instead of pretending.

## Architecture
```
brain/       FastAPI + numpy : portfolio engine, history miner, ledger, pond, payments
tests/       pytest + node   : the planted patterns and the portfolio invariants
extension/   MV3 Chrome ext  : content script, shadow-DOM duck, background worker
mock-shop/   static page     : a controlled checkout to demo the extension on
web/         Vite + React    : closet-as-portfolio dashboard
api/         Vercel entry    : serves the brain and the built dashboard in one origin
docs/        the why         : extraction, backend contract, voice, theme, runbook
```

## Backend integration

See [the API handoff](docs/backend-api.md) for shared decisions, idempotent action
requests, SQLite persistence, payment status, and frontend integration steps.
Savings and prediction accuracy start empty; purchases and skips persist across
restarts.

## Voice demo

Open [Puddle's integrated demo](http://localhost:8000/demo) with the backend running.
Click Checkout, then Talk to Puddle. Deepgram transcribes the question, the
duck answers from the current item and wardrobe history, and ElevenLabs speaks
the answer (browser speech if no key is set). The same controls work
in the Chrome extension. See [voice setup](docs/voice.md).

**Ask Puddle** on the dashboard opens the same microphone and text box scoped to
the whole closet rather than one item: what you own for rain, what you never
wear, where the coverage holes are, what late-night buying costs you, how often
the duck has been right. Same deterministic brain — every answer carries the
statistic behind it, and a question it cannot cite is refused rather than
answered.
