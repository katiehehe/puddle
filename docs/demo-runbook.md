# Demo runbook

## Right before you walk up

```bash
./run.sh                        # brain :8000, shop :5500, dashboard :5173
python3 scripts/demo_check.py   # wipes state, proves the three beats
```

Exit 0 means every beat lands and the two surfaces agree. Exit 1 names what is
broken. It also tells you which integrations are running unconfigured.

**Why the wipe matters.** Clicking *Buy anyway* while testing is recorded
permanently — that is the point of the persistence work. But it means the item
joins your closet, and a purchased item is filtered out of the storefront, so
the boots disappear from the dashboard's Skip panel. The "one brain, two
surfaces" proof goes with them. Wipe before every run.

## The 90 seconds

Give this on the **extension**, on the mock shop. Not `/demo`. The duck being
uninvited is the thesis; a page you deliberately opened cannot show it.

| # | Do | The duck says |
|---|---|---|
| 1 | Checkout on **boots** → **Skip** | *"Fifth pair of size-8 boots you've bought. You returned every one of the other four."* Pond fills. |
| 2 | Switch to **crewneck** → Checkout | *"You own 3 of these already…"* — say the word *covariance* once. |
| 3 | Switch to **suit** → Checkout → **Buy** | *"Get it. You have nothing for formal / interview."* Visa confirms. |
| 4 | Open the dashboard | Style Sharpe, formal/interview red on the radar, boots under **Skip quoting the same line the duck said**. |

Beat 1 is the demo. If you get one thing out, make it that. Beat 3 is what
stops it reading as a guilt machine.

**Close on:** retailers run return-prediction models on you and never tell you,
because telling you costs them the sale. We point that model — plus a portfolio
of everything you own — at you.

## Fallback ladder

Drop in this order. Each rung costs you less than the one below it.

1. **Real Visa → mock.** Checkout says "(simulated)". It never claims to be real.
2. **Extension → `http://localhost:8000/demo`.** Same duck, same voice panel,
   same brain — `transport.js` just talks HTTP instead of through the service
   worker. You lose only the uninvited-ness.
3. **Voice → skip it.** Everything else is unaffected.
4. **Dashboard → it is already safe.** `web/src/fixtures.ts` is generated from
   a real `/portfolio` response, so it renders correctly with the brain down.

## Keys

Both are read at request time, so set them and the next call picks them up.

```bash
cp .env.example .env     # then add DEEPGRAM_API_KEY
export VISA_API_KEY=... VISA_SHARED_SECRET=...
```

Without them: push-to-talk is disabled entirely, and checkout runs through
`MockProvider`. Neither fails silently — `/health` and `/voice/status` say so,
and `demo_check.py` surfaces both.

## If a port is stuck

`run.sh`'s trap does not always reap uvicorn and vite.

```bash
lsof -nP -iTCP:8000 -iTCP:5500 -iTCP:5173 -sTCP:LISTEN
```

## Rehearse at the hour you present

The time-of-day insight is real: it reads the wall clock. At 11pm the boots
carry a fourth insight the 2pm run does not show. Score at the demo hour:

```bash
python3 scripts/demo_check.py --hour 14
```
