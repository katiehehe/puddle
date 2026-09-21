# Backend handoff

Run from the repository root:

```sh
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m pytest -q
.venv/bin/uvicorn brain.app:app --port 8000
```

Interactive request schemas are at http://localhost:8000/docs.

## Shared decisions

`POST /score_item` accepts either `item_id` or an `item` object, plus optional
`now_hour` (0–23). Existing `cand_boots`, `cand_crew4`, `cand_suit`, `cand_rain`,
and `cand_blazer` aliases work. Responses use canonical `sku_*` IDs.
Known catalog prices/attributes are authoritative; an explicit size overrides
catalog size. Unknown items require formality and warmth, each 1–5.

Send `color` when the page states one. It decides what an item can substitute
for: two neutrals stand in for each other, a neutral and a bright do not, so a
fifth charcoal crewneck comes back redundant and the first red one does not. An
omitted colour still substitutes — most storefronts never say, and refusing on
missing data would hide real duplicates rather than find new ones — so dropping
it changes the verdict rather than merely coarsening it.

```json
{"item_id":"cand_boots","now_hour":23}
```

The existing response fields remain. Additions:

- `decision`: `buy`, `skip`, or `neutral`.
- `reasons`: evidence-based explanation strings.
- `prediction_id`: persistent ID, including for silent/neutral scores.

`GET /portfolio` uses the same decision function. Candidates are scored at a
fixed daytime hour (the dashboard is a planning surface, not a 2am checkout);
pass `?now_hour=23` to override. Its `rebalance.buy`, `rebalance.skip`, and
new `rebalance.neutral` entries include `decision` and `reasons`. Buys are
ranked by marginal Sharpe per dollar (`sharpe_per_dollar` on each entry) and
greedily picked under `?budget=` (default 500); an eligible buy may therefore
not appear in that list, and buys that would lower Sharpe are never picked.
Negative return, redundancy, or concentration evidence takes precedence over
positive alpha. Time alone does not turn a useful suit into a skip. Purchased
variants are removed from the candidate lists and added to holdings.

`rebalance.donate` lists dead weight by ascending expected payoff, but only
items whose removal leaves every covered occasion still covered -- the one
thing you own for a rare occasion is rarely worn *because* the occasion is
rare, and donating it is how a covered state becomes a gap. Expect this list
to be shorter than two entries on a tightly-covered closet.

`overexposure` carries `top_count` alongside `top_share`: how many items sit
in the crowded occasion. The `overexposure` *insight* fires when a candidate's
own best occasion is that same crowded one while another occasion is still
unserved, and stays silent for anything that closes a gap.

## Record an action

Preferred endpoint: `POST /actions`.

```json
{
  "event_id":"a-client-generated-uuid",
  "item_id":"cand_boots",
  "prediction_id":"COPY_FROM_SCORE_RESPONSE",
  "action":"skip"
}
```

`prediction_id` is optional. Use `item` instead of `item_id` to preserve a size
override or custom product. Reuse the same event ID and payload when retrying.
Only `action: "skip"` is accepted. Purchases require a signed payment intent
and explicit confirmation.

Response shape:

```json
{
  "event": {
    "event_id":"a-client-generated-uuid",
    "item_id":"sku_991",
    "action":"skip",
    "requested_action":"skip",
    "prediction_id":"p_...",
    "item": {},
    "created_at":"ISO-8601 timestamp",
    "payment":null
  },
  "duplicate":false,
  "pond":{"saved":128.0,"skips":1}
}
```

The response includes the full resolved item. Identical retries return the stored
event with `duplicate: true` and the current pond. Reusing an event ID for a
different payload returns **409**. A missing prediction returns **404**, and a
prediction for another item/size returns **409**. Invalid action/hour/item values
return **422**. Owning the variant already does not block either action:
re-buying is a real second purchase, and skipping counts as not buying
another one.

The compatibility route `POST /skip` accepts `item_id` or `item`, optional
`prediction_id`, and optional `event_id`. `POST /checkout` returns **410** so an
old client cannot bypass review. `GET /actions` returns the event history and
current pond. `GET /pond` returns `{saved, skips}` directly.

## Savings semantics and persistence

SQLite stores predictions, actions, and new holdings together. The pond starts
at **$0** and accuracy at **0/0**. Recommendations alone never count as savings.
Skipping the same item/size more than once counts its price only once. Buying
it later removes that avoided spending. A decline or provider error changes
neither the wardrobe nor saved amount. This measures **avoided spending**, not
verified bank-account savings; an explicit Skip counts even on an approved item.

State defaults to `data/puddle.sqlite3` relative to the server's working directory.
Set `PUDDLE_DB_PATH` to an absolute path for deployment or a separate demo dataset.
It persists across restarts and is excluded from Git. Old `ledger.json` and
`pond.json` demo files are not imported. To start a fresh demo without deleting
old state, point `PUDDLE_DB_PATH` at a new file.

Grades remain `POST /predict/{prediction_id}/grade?correct=true`. Scores and
user actions do not automatically grade predictions. The initial wardrobe,
wear history and return history remain synthetic; new purchases are stored as
actions/holdings, not assumed to be confirmed non-returns in the history miner.

## Payment behavior

New clients use a two-step checkout:

1. `POST /payment-intents` with `item_id` or `item`, optional
   `prediction_id`, and a `budget_limit` up to $500. It returns a signed,
   ten-minute intent, provider readiness, and whether confirmation is enabled.
2. `POST /payment-intents/confirm` with `{token, confirmed: true}`. The server
   verifies the signature, expiry, item, amount, budget, and provider mode
   before dispatching payment. Replaying the same signed intent returns the
   original result without paying twice.

The intent is a consent and integrity boundary, not a payment credential. Card
details and provider secrets never enter the extension. Set
`PAYMENT_INTENT_SECRET` to a long random value in deployed environments. Local
development uses a process-scoped secret when it is omitted.

`POST /payment-intents/confirm` returns top-level `approved`, `mode`, `amount`,
`token`, `network`, `reason`, and `message`, plus `status`, `event`, `duplicate`, `pond`, and `receipt`.
`status` is `approved`, `declined`, or `error`. Clients must check status before
showing success. Approved mock payments are explicitly labeled `mode: mock` and
update the demo wardrobe. Failed attempts are recorded as `payment_failed`.
An identical failed retry returns the same result; a deliberate new attempt
needs a new event ID.

Mock is the default when no Visa variables are present. A partial Visa setup is
reported as `visa_incomplete` and cannot silently fall back to a successful mock
payment. The Visa sandbox adapter remains unverified with real credentials. It
fails closed: network errors cannot become successful mock payments, and an HTTP
success alone cannot count as approval. Its response mapping and request contract
must be verified before using it for sponsor demos.
Local retries are deduplicated, but upstream payment idempotency/reconciliation
is still required to cover a crash after provider approval and before DB commit.

## Frontend owners

- Extension: retain `prediction_id`; generate one `event_id` per intentional
  action; retry it unchanged; display the response's pond. Do not add savings in
  Chrome storage or treat failed network calls as successful payments.
- Dashboard: refresh `/portfolio` after actions or on window focus; show
  `decision`/`reasons` rather than deriving advice from alpha. Backend persistence
  does not itself refresh an already mounted page.
- The service is a single-user local prototype. Authentication, multi-user
  isolation, returns/refunds, wear logging and reminders are not implemented.
