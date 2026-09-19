# 🦆 Puddle

**A duck that lives in your cart.** It knows everything you already own (modeled as an
investment portfolio) and everything you've sent back — and it speaks up *before* you pay.

Two surfaces, one brain:
- **Extension** — the duck reacts uninvited at checkout.
- **Website** — your closet as a risk-return portfolio (Style Sharpe, coverage, rebalance).

See [`PRD.md`](./PRD.md) for the full product spec.

---

## Quick start

### 1. Brain (FastAPI + real portfolio math)
```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest -q             # backend math, API and persistence checks
.venv/bin/uvicorn brain.app:app --port 8000   # http://localhost:8000
```

### 2. Website (React dashboard)
```bash
cd web
npm install
npm run dev                                # http://localhost:5173
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

Or just run everything: `./run.sh`

---

## Demo script (90 seconds)
1. Open the mock shop on **boots**. Click Checkout.
   → Duck (concerned): *"Fifth pair of size-8 boots. You returned the other 4. It's late — that's when most of your returns happen."* Click **Skip** → pond fills.
2. Switch to **crewneck**. Checkout.
   → Duck: *"You already own 3 charcoal crewnecks. This adds nothing new."* (redundancy = covariance)
3. Switch to **suit**. Checkout.
   → Duck (approving): *"Buy it — you've got nothing for Formal, and this covers it."* → **Buy anyway** → simulated checkout confirms (`mode: mock` by default).
4. Open the **dashboard** (`localhost:5173`): Style Sharpe, the coverage radar (Formal + Rain glowing red as gaps), the rebalance trades, and the duck's public accuracy ledger.

Close on the line: **retailers run return-prediction models on you and never tell you. We point that model — plus a portfolio of everything you own — at you.**

---

## What's real vs mocked
| Piece | Status |
|---|---|
| Portfolio math (states → μ, Σ, Style Sharpe, alpha buy-rule) | **Real** (numpy, tested) |
| History mining (return / time / redundancy / gap / overexposure) | **Real** |
| Extension → brain → duck overlay + voice | **Real** (voice via Web Speech; swap in ElevenLabs/Deepgram) |
| Prediction ledger + pond (persisted, shared by duck and dashboard) | **Real** |
| Visa checkout | **Interface real, call unverified** — with `VISA_API_KEY` + `VISA_SHARED_SECRET` it attempts an X-Pay-Token sandbox call. Failures are reported without successful mock fallback. Untested against live credentials. |
| Voice STT/TTS | Web Speech fallback; wire Deepgram (STT) + ElevenLabs (TTS) at marked points |

## Sponsor tracks
Visa (primary) · Ramp (pond of saved money) · Deepgram + ElevenLabs (voice) · Cognition/Devin (build) · Long Lake + Token Company (narrative).

## Architecture
```
brain/       FastAPI + numpy  — portfolio engine, history miner, ledger, pond, payments
tests/       pytest           — the planted patterns and the portfolio invariants
extension/   MV3 Chrome ext   — content script, shadow-DOM duck, background worker
mock-shop/   static page      — a controlled checkout to demo the extension on
web/         Vite + React     — closet-as-portfolio dashboard
```

## Backend integration

See [the API handoff](docs/backend-api.md) for shared decisions, idempotent action
requests, SQLite persistence, payment status, and frontend integration steps.
Savings and prediction accuracy start empty; purchases and skips persist across
restarts.
