# Puddle — Product Requirements Document

> **One line:** A duck that lives at your checkout. It knows everything you already own (as an investment portfolio) and everything you've sent back — and it says something *before* you pay.

> **Status:** Draft for HackMIT 2026. Working name `Puddle` (alts: QuackCheck, Duckwise, Second Thought, Pondering). Primary track: **Visa**. Build window: ~8 hrs of the 24.

---

## 1. The thesis

Two true things collide:

1. **Retailers already run return-prediction models on you.** They never surface them, because telling you "you'll probably return this" costs them the sale.
2. **Nobody has a portfolio view of what they own.** Every other spending category has Mint/YNAB/Vanguard. Your closet — often your 3rd-biggest spend category — has nothing but vibes.

**Puddle points both at the customer.** It reacts *uninvited* at checkout (you didn't ask, it quacks anyway) and it reasons over your wardrobe as a **risk-return portfolio** (Markowitz, not a metaphor). The duck is the soft delivery; the portfolio math is the teeth.

### Why this wins (design filters)
- **The ChatGPT test:** ChatGPT can never be *uninvited* — it only works when you open it and type. Puddle acts at the moment of purchase without being asked. It cannot be reproduced by a judge with their phone in 10 seconds.
- **Not a wrapper:** the value is in *mining your history* and *running real portfolio math*, not in an LLM answer. Transparent math is the product; the LLM only phrases it.
- **Emotionally demoable:** "Fifth pair of size-8 boots — you returned the other four, and it's 11:40pm, when 70% of your returns happen" is something *nobody has ever been told about themselves.*

---

## 2. The combined product — two surfaces, one brain

This is the fusion of the reactive "duck at checkout" (Puddle) and the "closet-as-portfolio" idea. They are not two apps; they are two surfaces of one engine.

| Surface | Role | Which original idea |
|---|---|---|
| **Extension** (field agent) | Rides checkout. Duck reacts uninvited using the portfolio brain + purchase/return history. | Puddle (reactive) |
| **Website** (home base) | Your closet as a portfolio dashboard — Style Sharpe, coverage map, the pond, prediction ledger, "rebalance" (what to buy/skip/donate). | Closet-as-portfolio (planning) |

**Shared brain:** the **Portfolio Engine** (items = assets, occasions = states, covariance Σ, Sharpe, alpha buy-rule) + the **History Miner** (return-rate, time-of-day, redundancy). Both surfaces render from the **same JSON contract** (§7).

```
                 ┌─────────────────────────────┐
                 │       PUDDLE BRAIN           │
                 │  Portfolio Engine + Miner    │
                 │  (μ, Σ, Sharpe, α, patterns) │
                 └───────────┬─────────────────┘
                             │  insight JSON
             ┌───────────────┴────────────────┐
             ▼                                 ▼
   ┌───────────────────┐             ┌────────────────────┐
   │  EXTENSION         │             │  WEBSITE           │
   │  duck @ checkout   │             │  portfolio dash    │
   │  voice in/out      │             │  pond, coverage    │
   └───────────────────┘             └────────────────────┘
```

---

## 3. The algorithm (the differentiator)

### 3.1 Model your closet as a portfolio

**States of the world** \( s \) = occasions/day-types, each with probability \( p_s \) (the user's "life mix"). Default 8 states:

| State | \( p_s \) | Req formality (1–5) | Req warmth (1–5) | Weather |
|---|---|---|---|---|
| Class / casual (warm) | 0.24 | 2 | 2 | dry |
| Class / casual (cold) | 0.20 | 2 | 4 | cold |
| Gym / athletic | 0.12 | 1 | 2 | dry |
| Lounge / comfort | 0.10 | 1 | 3 | indoor |
| Night out / party | 0.09 | 4 | 2 | dry |
| Date / nice dinner | 0.06 | 4 | 3 | dry |
| Formal / interview | 0.06 | 5 | 3 | indoor |
| Rain / snow | 0.13 | 2 | 4 | wet |

**Payoff** \( a_{is} \) = how good item \( i \) is in state \( s \). Two interchangeable implementations:

- **Rule-based (fast):** \( a_{is} = q_i \cdot \text{formalityMatch} \cdot \text{warmthMatch} \cdot \text{rainFactor} \), each term in \([0,1]\), multiplicative so any hard mismatch zeroes it.
- **Embedding-based (richer, recommended):** \( a_{is} = q_i \cdot \max(0, \cos(\mathbf{e}_i, \mathbf{t}_s)) \), where \( \mathbf{e}_i \) is the item's FashionCLIP image embedding and \( \mathbf{t}_s \) is the text embedding of a state prompt ("an outfit for a formal interview, cold weather"). Grounded, no hand-tuned tables.

\( q_i \in [0,1] \) = the user's quality/rating of the item (default 0.7). **This is where "review your past purchases" lives** — rating an item sets its \( q_i \).

**Returns & covariance** (scenario-based — identical to finance):
\[
\mu_i = \sum_s p_s\, a_{is}, \qquad \Sigma_{ij} = \sum_s p_s\,(a_{is}-\mu_i)(a_{js}-\mu_j)
\]

Two items strong on the same states → high \( \Sigma_{ij} \) → redundant. Strong on disjoint states → low/negative → diversifying.

### 3.2 Scoring the closet and the buy decision

- **Closet quality = Style Sharpe:** solve mean-variance for the best wear-allocation \( w \):
\[
\max_{w\ge 0,\ \mathbf 1^\top w =1}\ w^\top\mu - \tfrac{\lambda}{2} w^\top \Sigma w,\qquad \text{Sharpe}=\frac{w^\top\mu - r_f}{\sqrt{w^\top\Sigma w}}
\]
\( r_f \) = your loungewear baseline. Solve with `cvxpy` (n is tiny, closed-form also fine).

- **Should you buy item \(j\)?** Add it iff it expands the frontier — the finance "alpha" condition:
\[
\text{buy } j \iff \alpha_j = \mu_j - \beta_j\,(\text{closet payoff}) > 0
\]
Redundant item → \( \beta \) high, \( \alpha\approx 0 \) → **skip**. Gap-filler → \( \alpha>0 \) → **buy**. This is the rigorous version of "does this cover something your closet can't already handle."

- **What to buy under a budget** \( B \): pick items \( x_i\in\{0,1\}\) maximizing resulting Sharpe s.t. \( \sum x_i \text{price}_i \le B \). Greedy by **marginal-Sharpe-per-dollar** (near-optimal; `apricot` for submodular selection, or a simple greedy loop). Optional MMR pass for diversity in the shown list.

### 3.3 History Miner → the duck's reactive insights

Runs on purchase + return history (synthetic with planted patterns for the demo). Emits typed insights:

| Insight type | Signal | Example duck line |
|---|---|---|
| `redundancy` | high covariance to owned items | "Fourth charcoal crewneck — covers the same days as three you own." |
| `return_pattern` | personal return rate by category/size | "Fifth pair of size-8 boots. You returned the other four." |
| `time_pattern` | return rate by hour vs baseline | "It's 11:40pm — that's when 70% of your returns happen." |
| `coverage_gap` (green-light) | state with low max payoff | "Buy it — you've got nothing for cold + formal, and this covers it." |
| `overexposure` | concentration (Herfindahl over states) | "Six going-out tops, zero interview outfit. You're all-in on one occasion." |

`confidence ∈ [0,1]` drives the duck's face; **never shown as a number.**

### 3.4 Recommended libraries (researched)

| Job | Library | Note |
|---|---|---|
| Item attributes + embeddings from a photo | [Marqo-FashionCLIP](https://huggingface.co/Marqo/marqo-fashionCLIP) / [fashion-clip](https://github.com/patrickjohncyh/fashion-clip) | zero-shot color/material/category + 512-d embedding |
| Portfolio optimization | [cvxpy](https://www.cvxpy.org/) | mean-variance, tiny n, fast |
| Submodular buy-selection | [apricot](https://github.com/jmschrei/apricot) | `pip install apricot-select`, 1−1/e guarantee |
| Diversity in shown list | MMR (~15 lines) | balance relevance vs redundancy |
| Insight phrasing | GPT-4o / Claude (thin) | phrase math as duck copy; cost-optimized (Token Co) |

---

## 4. Sponsor track strategy

Ordered by fit. The brief's warning holds: **track count is a tax; one great demo beats six write-ups.** Voice covers two tracks with one pipeline, so the realistic target is **5 tracks, ~2 pipelines.**

| Track | Prize | How we hit it | Priority |
|---|---|---|---|
| **Visa** | $5k | AI commerce experience: decision-making + personalization + a trusted checkout (buy the gap item / "buy anyway"). Visa Intelligent Commerce / Click to Pay at the pay step. | **Primary** |
| **Ramp** | Switch + $ | Literally "save time & money" — the pond fills with money saved by skipped-regret buys. | **Primary** |
| **Deepgram** | Switch | Duck *listens* — Deepgram Nova-3 STT ("what about this one?"). | High |
| **ElevenLabs** | — | Duck *talks* — expressive TTS, real quack inflection. | High |
| **Cognition (Devin)** | $5k | Devin owns the scoring/prediction service, tests, integration. | High |
| **Long Lake** | Top 3 | "A skeptic would try this and love it" — the uninvited insight is exactly that moment. | Bonus (free) |
| **The Token Company** | $500 | Cost-optimize the insight-phrasing LLM (cache, small model, dense prompts). | Bonus (free) |

**Explicitly excluded:**
- **SpaceXAI** — requires space data + Grok Imagine/Voice; *cannot* stack with a shopping hack. (Cursor-as-editor is still fine anywhere.)
- **Arrowstreet** (greenwashing), **Voloridge** (public-dataset focus), hardware tracks (Arduino/Espressif/Hackster/Dimensional/ASUS), Dropbox, Meta, Regeneron — different problems.
- **OpenAI/Codex** — mutually exclusive with the Devin narrative; pick one. (Default: Devin, per team plan.)

---

## 5. Architecture

### 5.1 Surfaces
- **Extension (MV3) — real, committed:** content script on the shop, `document_idle`, `MutationObserver` + `PerformanceObserver` on `/cart/*` to detect cart/checkout changes, extracts items (stable selectors; `query-selector-shadow-dom` for shadow DOM sites), injects the duck overlay into a **Shadow DOM** host (`z-index: 999999`) so host CSS can't break it. Background worker → brain → insight JSON → render + voice.
  - **Demo on a controlled store, not a hostile one.** Build the real extension, but demo it on a **Shopify dev store** (or a self-hosted shop clone) — real extension, real content-script path, but a DOM we control and can run offline. A live major retailer (Amazon) is the single biggest demo risk; do not depend on it. Ship a **cached recording** as the wifi-off backup.
- **Website (home base):** the portfolio dashboard. React + Vite. Reads the same brain over a small API.

### 5.2 Backend / brain
- Python service (FastAPI). Endpoints: `POST /score_item` (candidate → insights), `GET /portfolio` (μ, Σ, Sharpe, coverage), `POST /predict/:id/grade` (self-scoring).
- **Devin owns** this service + the prediction ledger + tests + deploy.
- Everything runs offline against fixtures; **cache a full demo run so it works with wifi off.**

### 5.3 Voice pipeline
- **Deepgram Nova-3** STT → thin LLM (duck persona, phrases the insight) → **ElevenLabs** TTS (expressive, low-latency `eleven_flash_v2_5`). One polished flow, in and out. Barge-in via VAD optional.

### 5.4 Payments — real Visa sandbox (committed)
- **Visa Intelligent Commerce / Click to Pay** sandbox at the "buy the gap item" / "buy anyway" step (base `https://sandbox.api.visa.com/src/v1`, X-Pay Token auth; Initialize SRC is a browser step in a hidden iframe).
- **Onboarding is the critical-path risk.** Create the Visa Developer project and pull keys **in the first 30 minutes** — go to the Visa booth on-site. Keep a tokenized budget-capped **mock** wired behind the same interface as an emergency fallback only, so a keys delay can't sink the demo.

---

## 6. Tech stack

- **Frontend:** React + Vite + TypeScript (website); vanilla TS + Shadow DOM (extension overlay).
- **Backend:** Python + FastAPI; numpy + cvxpy + apricot; FashionCLIP for ingestion.
- **Voice:** Deepgram (STT) + ElevenLabs (TTS).
- **Payments:** Visa sandbox (mock fallback).
- **LLM:** GPT-4o/Claude for copy (thin, cached).
- **Build partner:** Devin.

---

## 7. Data contract (single source of truth)

Lock this in the first 30 minutes so 4 people build against fixtures in parallel. Extends the team brief's contract with the portfolio insights.

```json
{
  "item":   {"id": "sku_991", "title": "Charcoal crewneck", "price": 68.0, "category": "top",
             "attrs": {"formality": 2, "warmth": 3, "color": "charcoal", "material": "cotton"}},
  "portfolio": {
    "style_sharpe_before": 0.82,
    "style_sharpe_after":  0.79,
    "alpha": -0.03,
    "redundant_with": ["sku_112", "sku_340", "sku_501"],
    "covers_gap": null
  },
  "insights": [
    {"type": "redundancy",
     "stat": {"corr": 0.91, "owned_similar": 3},
     "line": "Fourth charcoal crewneck — covers the same days as three you own."},
    {"type": "time_pattern",
     "stat": {"hour": 23, "return_rate": 0.70, "baseline": 0.18},
     "line": "It's 11:40pm — that's when most of your returns get bought."}
  ],
  "duck_state": "concerned",     // idle | curious | concerned | approving
  "confidence": 0.73,            // drives the face, never shown
  "speak": true,                 // false for ~95% of items
  "prediction_id": "p_0042"      // logged, graded in 30 days
}
```

---

## 8. UI / UX — cute, flat, purposeful

**Character:** Puddle, a round duck. Four states: `idle` (floating), `curious` (head tilt), `concerned` (raised brow), `approving` (happy, pond ripples). Flat vector, 4 poses drawable in 8h. A **pond** that visibly fills with money saved — the retention mechanic.

**Palette** (shared across both surfaces, from the team brief):
- ink `#16191c` · muted `#5d6771` · line `#e4e8ec`
- duck/gold `#e8a317` · water/blue `#2a7fb8` · good/green `#0d7a4a` · bad/red `#b3261e`
- surface `#f5f7f9`

**Anti-slop rules:** flat surfaces, one accent at a time, rounded corners, micro-animations only (pond ripple, duck blink), playful copy. No gradients, no drop-shadow soup, no emoji as UI.

### 8.1 Extension overlay (the money shot)
- Bottom-right card in a Shadow DOM. Duck (left) + speech bubble (right).
- One-line insight + one **stat chip** ("returned 4/4 · size 8").
- Buttons: `Buy anyway` (ghost) · `Skip` (primary). Never blocks — one tap overrules, always.
- On skip: pond ripples, saved amount ticks up. On approve: duck nods green.
- Voice: tap the duck to talk ("what about this one?").

```
┌───────────────────────────────────────┐
│  🦆   "Fifth pair of size-8 boots.     │
│  ~~~   You returned the other four."   │
│        [ returned 4/4 · 11:40pm ]      │
│                    [ Skip ]  [ Buy ]   │
└───────────────────────────────────────┘
        pond ░░░░▓▓▓▓  $312 saved
```

### 8.2 Website dashboard (home base)
- **Hero:** big **Style Sharpe** number + the pond (money saved). One thing stands out.
- **Coverage map:** occasions as a radar/heatmap — covered states solid, gaps hollow ("cold + formal: uncovered").
- **Holdings:** table of items — return (wears), risk, a redundancy flag on dupes.
- **Rebalance panel:** "Buy 2 · Skip 1 · Donate 3" with the alpha/why for each.
- **Prediction ledger:** the duck's past calls + a public accuracy score ("right 11/14"). Admitting when it's wrong earns the right to interrupt.

---

## 9. Scope & the 8 hours

### In (demo-critical)
- **Real MV3 Chrome extension** running on a controlled Shopify dev store + one polished duck flow
- **Website dashboard:** Style Sharpe, pond, coverage map, rebalance, prediction ledger
- Portfolio Engine: states → payoff → μ, Σ, Sharpe, alpha (on a seeded catalog)
- 5 insight types (§3.3) via the JSON contract
- **Two-way voice:** Deepgram STT in → ElevenLabs TTS out, one flow
- **Real Visa sandbox** checkout on the buy step (mock behind same interface as fallback)
- Cached demo recording that works with wifi off

### Out (kills the demo / scope creep)
- Real bank/retailer connections, real payments, actually blocking a purchase
- A chat box (instantly a wrapper), heavy/trained ML, live wardrobe photo-entry at scale
- Efficient-frontier interactive chart, life-mix sliders shown live (nice, but cut first)
- Every extra sponsor track beyond the 5

### Timeline (~8h build)
| Time | Milestone |
|---|---|
| 0:00–0:30 | Lock name, JSON contract, demo flow, roles; **start Visa key onboarding at the booth**; extension skeleton on a Shopify dev store |
| 0:30–2:30 | Brain (portfolio + miner) + extension content-script extraction; frontend builds on fixtures |
| 2:00–4:00 | Duck states, pond, website dash, voice — in parallel |
| 4:00–5:00 | **Integration. Go/no-go: does the insight make a stranger say "oh damn"?** |
| 5:00–6:30 | Polish copy > animation; the sentence matters most |
| 6:30–7:30 | Rehearse twice, record backup |
| 7:30–8:00 | Buffer. Start nothing new. |

### Roles
| Owner | Scope |
|---|---|
| Brain/Data | Portfolio engine, miner, synthetic history with planted patterns |
| Frontend | Mock checkout, duck + pond, website dashboard |
| Voice | Deepgram + ElevenLabs, the one flow, duck persona copy |
| Demo | Script, fallbacks, rehearsal, backup recording |
| Devin | Scoring/prediction service, integration, tests, deploy |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Portfolio math heavier than plain rules | It's one module; if it's not landing by hour 4, the duck falls back to simple rules — it doesn't care where the insight came from |
| Visa sandbox onboarding slow | Mock the tokenized budget-capped checkout; get booth keys early |
| Voice fragile in a loud hall | One scripted flow + a recorded backup; text still works if audio dies |
| "Annoying" perception | Retailer is the villain not the user; silent on ~95% of items; says yes sometimes; keeps public score; one tap to overrule |
| Extension on live sites breaks | Demo on the controlled mock shop, not a real retailer |
| Over-integrating sponsors | Hard cap at 5 tracks / 2 pipelines |

---

## 11. Decisions locked

| Decision | Choice |
|---|---|
| Surfaces | **Real Chrome extension + website dashboard** (demo on a controlled Shopify dev store) |
| Team | **Team build** — merges with the Puddle brief, 4 people + Devin |
| Tracks | **Visa + Ramp + Deepgram + ElevenLabs + Cognition/Devin** (Long Lake + Token Co as free narrative adds) |
| Payments | **Real Visa sandbox**, mock behind the same interface as fallback |
| Voice | **Two-way** — Deepgram STT in, ElevenLabs TTS out |

### Honest scope note
This is the ambitious end of what's doable in 8h with 4 people + Devin: real extension **and** real Visa **and** two-way voice **and** a portfolio dashboard **and** 5 tracks. Protect it with a **fallback ladder** — if you're behind at the hour-4 go/no-go, drop in this order: (1) real Visa → mock checkout, (2) live extension demo → cached recording, (3) two-way voice → TTS-only, (4) website dashboard polish → static. The core that must survive: **the duck says the surprising insight at checkout, grounded in real portfolio math.**
