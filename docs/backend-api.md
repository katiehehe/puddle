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

```json
{"item_id":"cand_boots","now_hour":23}
```

The existing response fields remain. Additions:

- `decision`: `buy`, `skip`, or `neutral`.
- `reasons`: evidence-based explanation strings.
- `prediction_id`: persistent ID, including for silent/neutral scores.

`GET /portfolio?now_hour=23` uses the same decision function. Its
`rebalance.buy`, `rebalance.skip`, and new `rebalance.neutral` entries include
`decision` and `reasons`. The buy list is still constrained by the $400 demo
budget; an eligible buy may therefore not appear in that list. Negative return,
redundancy, or concentration evidence takes precedence over positive alpha.
Time alone does not turn a useful suit into a skip. Purchased variants are
removed from the candidate lists and added to holdings.

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
`action: "buy"` invokes checkout; it is not a way to bypass payment.

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
return **422**. Buying or skipping an already purchased variant returns **409**
(except an identical replay of the original event).

Compatibility routes remain: `POST /skip` and `POST /checkout` accept `item_id`
or `item`, optional `prediction_id`, and optional `event_id`. When event_id is
omitted, a stable legacy key prevents repeated clicks from recording twice.
New clients should always generate an event ID. `GET /actions` returns the event
history and current pond. `GET /pond` returns `{saved, skips}` directly.

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

`POST /checkout` retains top-level `approved`, `mode`, `amount`, `token`,
`network`, `reason`, and `message`, and adds `status`, `event`, `duplicate`, `pond`.
`status` is `approved`, `declined`, or `error`. Clients must check status before
showing success. Approved mock payments are explicitly labeled `mode: mock` and
update the demo wardrobe. Failed attempts are recorded as `payment_failed`.
An identical failed retry returns the same result; a deliberate new attempt
needs a new event ID.

Mock is the default. The inherited Visa sandbox adapter remains unverified with
real credentials. It now fails closed: network errors cannot become successful
mock payments, and an HTTP success alone cannot count as approval. Its response
mapping and request contract must be verified before using it for sponsor demos.
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
