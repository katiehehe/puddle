import { ReactNode, useEffect, useState } from "react";
import {
  CatalogItem, Quote, Score, Status,
  askDuck, getPortfolio, getQuote, getStatus, getStorefront, gradePrediction, scoreItem,
} from "./api";
import { FIXTURE, Portfolio } from "./fixtures";

// docs/theme.md — Flat Pond palette, kept in sync with extension/content.js.
const THEME = {
  duck: "#f2b431", duckDeep: "#92600a",
  water: "#3b82f6", waterDeep: "#2563eb", ripple: "#c7d8ea",
  reed: "#10b981", warning: "#ef4444", muted: "#6b7280", line: "#e5e7eb",
};

// The mascot: the duck emoji floating on a ripple.
function DuckLogo() {
  return <div className="ducklogo" aria-hidden="true">🦆</div>;
}

function CoverageRadar({ coverage }: { coverage: Portfolio["coverage"] }) {
  const size = 320, cx = size / 2, cy = size / 2, R = 120;
  const n = coverage.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = coverage.map((c, i) => pt(i, R * c.coverage).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => coverage.map((_, i) => pt(i, R * f).join(",")).join(" "));
  return (
    <svg width={size + 130} height={size} viewBox={`-65 0 ${size + 130} ${size}`}>
      {rings.map((r, i) => (
        <polygon key={i} points={r} fill="none" stroke={THEME.line} />
      ))}
      {coverage.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={THEME.ripple} />;
      })}
      <polygon points={poly} fill="rgba(59,130,246,.18)" stroke={THEME.water} strokeWidth={2} />
      {coverage.map((c, i) => {
        const [lx, ly] = pt(i, R + 20);
        const gap = c.coverage < 0.45;
        const [dx, dy] = pt(i, R * c.coverage);
        // Labels are long; anchor them away from the wheel and wrap on the slash.
        const anchor = lx - cx > 8 ? "start" : lx - cx < -8 ? "end" : "middle";
        const lines = c.state.split(" / ");
        return (
          <g key={i}>
            <circle cx={dx} cy={dy} r={3.5} fill={gap ? THEME.warning : THEME.water} />
            <text x={lx} y={ly - (lines.length - 1) * 6} fontSize={11} textAnchor={anchor}
              fill={gap ? THEME.warning : THEME.muted} fontWeight={gap ? 700 : 400}>
              {lines.map((l, k) => (
                <tspan key={k} x={lx} dy={k === 0 ? 0 : 12}>{l}</tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const INSIGHT_LABEL: Record<string, string> = {
  return_pattern: "Return pattern",
  time_pattern: "Time of day",
  redundancy: "Redundancy",
  coverage_gap: "Coverage gap",
  overexposure: "Overexposure",
};

/** How often each occasion actually happens, from recorded wears. Derived, not
 *  typed in, which is the point of showing it beside the coverage wheel. */
function LifeMix({ coverage }: { coverage: Portfolio["coverage"] }) {
  const max = Math.max(...coverage.map((c) => c.p), 0.0001);
  return (
    <div className="mix">
      {[...coverage].sort((a, b) => b.p - a.p).map((c) => (
        <div className="mixrow" key={c.state}>
          <span className="mixname">{c.state}</span>
          <span className="mixbar"><i style={{ width: `${(c.p / max) * 100}%` }} /></span>
          <span className="mixval">{(c.p * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

const money = (n: number) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);

/** Quant Quack: the trading word stays on screen, the lesson stays out of the way
 *  until someone taps it. */
function Term({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term">
      <button type="button" className="termbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <span className="termpop">
          <em>Quant Quack</em>
          {children}
        </span>
      )}
    </span>
  );
}

/** The exercise. One item, priced the way anything else with a price is:
 *  what's it offered at, what's it worth to you, will you take the other side.
 *  Every number on it comes from the same brain call the duck makes. */
function Ticket({ items }: { items: CatalogItem[] }) {
  const [id, setId] = useState("");
  const [hour, setHour] = useState(23);
  const [score, setScore] = useState<Score | null>(null);
  const [q, setQ] = useState<Quote | null>(null);
  const [bid, setBid] = useState(0);
  const [stage, setStage] = useState(0);        // how much of the ticket is revealed
  const [call, setCall] = useState("");         // what you decided
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [book, setBook] = useState<{ title: string; call: string; pnl: number }[]>([]);
  const [err, setErr] = useState("");

  async function load(nextId: string, nextHour = hour) {
    if (!nextId) return;
    setErr(""); setStage(0); setCall(""); setAnswer(""); setQuestion("");
    try {
      const [s, quote] = await Promise.all([scoreItem(nextId, nextHour), getQuote(nextId, nextHour)]);
      setScore(s); setQ(quote); setBid(Math.round(quote.ask / 2));
    } catch (e) {
      setScore(null); setQ(null);
      setErr(e instanceof Error ? e.message : "could not reach the brain");
    }
  }

  useEffect(() => {
    if (id || !items.length) return;
    // The duck's card links here with the item it just scored, by id or by the
    // title it read off the shop page.
    const wanted = (new URLSearchParams(location.search).get("item") ?? "").toLowerCase();
    const match = wanted && items.find((i) =>
      i.id.toLowerCase() === wanted ||
      i.title.toLowerCase().includes(wanted) ||
      wanted.includes(i.title.toLowerCase()));
    const first = match?.id ?? items[0].id;
    setId(first);
    load(first);
  }, [items]);

  function decide(action: "buy" | "skip") {
    if (!q) return;
    const pnl = action === "buy" ? q.ev : q.ev_if_skipped;
    setCall(action);
    setStage(Math.max(stage, 3));
    setBook((b) => [{ title: score?.item.title ?? id, call: action, pnl }, ...b].slice(0, 6));
  }

  async function ask() {
    if (!question.trim() || !id) return;
    setAsking(true);
    try { setAnswer(await askDuck(id, question, hour)); }
    catch { setAnswer("The brain didn't answer that one."); }
    finally { setAsking(false); }
  }

  const realised = book.reduce((s, r) => s + r.pnl, 0);

  return (
    <section className="card ticket">
      <div className="tickethead">
        <h2>Price it yourself</h2>
        <span className="qq">Quant Quack — tap any underlined word</span>
      </div>
      <p className="muted">
        A shop shows you one number: what it wants. Everything else — how much you'd
        wear it, what that's worth, how often you send this kind of thing back — is
        yours, and it's what decides whether the price is a good one. Work through it.
      </p>

      <div className="controls">
        <select value={id} onChange={(e) => { setId(e.target.value); load(e.target.value); }}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title} (${i.price})</option>)}
          {!items.length && <option value="">brain offline</option>}
        </select>
        <label className="hourlab">
          <span className="muted">time of day</span>
          <input type="range" min={0} max={23} value={hour}
            onChange={(e) => setHour(+e.target.value)}
            onMouseUp={() => load(id)} onTouchEnd={() => load(id)} />
          <b className="hourval">{String(hour).padStart(2, "0")}:40</b>
        </label>
      </div>

      {err && <p className="err">{err}</p>}

      {q && score && (
        <>
          {/* 1 — inventory. You are not starting from zero. */}
          <div className="tstep">
            <div className="tnum">1</div>
            <div className="tbody">
              <h3>What you already hold</h3>
              {q.units_held ? (
                <>
                  <p className="big">
                    <b>{q.units_held} unit{q.units_held === 1 ? "" : "s"}</b> of this, worn {q.unit_wears} times between them.
                  </p>
                  <div className="units">
                    {q.units.map((u) => (
                      <span className="unit" key={u.id}>{u.title}<em>{u.wears} wears</em></span>
                    ))}
                  </div>
                  <p className="muted">
                    Buying another doesn't add a new day to your week — it adds a second thing
                    competing for days you can already dress.
                  </p>
                </>
              ) : (
                <>
                  <p className="big"><b>Nothing like it</b> in the closet.</p>
                  <p className="muted">
                    {q.covers_gap
                      ? `It would be your first thing for ${q.covers_gap.label.toLowerCase()}.`
                      : "So the wears it takes have to come from somewhere else you own."}
                  </p>
                </>
              )}
              {stage === 0 && <button onClick={() => setStage(1)}>Next: what it costs</button>}
            </div>
          </div>

          {/* 2 — the ask, the true cost, and your bid. */}
          {stage >= 1 && (
            <div className="tstep">
              <div className="tnum">2</div>
              <div className="tbody">
                <h3>The ask, and what it actually costs</h3>
                <div className="quoterow">
                  <div>
                    <span className="lbl">
                      <Term label="they ask">
                        The ask is the price the seller will trade at. It is an offer, not a
                        valuation — nothing about it says the thing is worth that to you.
                      </Term>
                    </span>
                    <b>{money(q.ask)}</b>
                  </div>
                  <div>
                    <span className="lbl">
                      <Term label="wears you'd get">
                        Your wardrobe only has so many days in it. This is the share of your
                        {" "}{q.wears_logged} logged wears this item would realistically take,
                        given everything it competes with.
                      </Term>
                    </span>
                    <b>{q.expected_wears}</b>
                  </div>
                  <div>
                    <span className="lbl">
                      <Term label="so, per wear">
                        Cost per wear is the real unit price: the ask divided by the wears you
                        get out of it. Cheap things you never wear are expensive.
                      </Term>
                    </span>
                    <b className={(q.cost_per_wear_if_bought ?? 0) > q.your_cost_per_wear ? "bad" : "good"}>
                      {q.cost_per_wear_if_bought === null ? "—" : money(q.cost_per_wear_if_bought)}
                    </b>
                  </div>
                  <div><span className="lbl">you normally pay</span><b>{money(q.your_cost_per_wear)}</b></div>
                </div>
                <p className="muted">
                  The sticker price isn't the cost. {money(q.ask)} over {q.expected_wears} wears is
                  the cost, and you have {q.wears_logged} logged wears to compare it against.
                </p>

                <div className="bidbox">
                  <label>
                    <span>Your bid — what would you actually pay for it?</span>
                    <input type="range" min={0} max={Math.round(q.ask * 1.2)} step={1}
                      value={bid} onChange={(e) => setBid(+e.target.value)} />
                  </label>
                  <b className="bidval">{money(bid)}</b>
                </div>

                {stage === 1
                  ? <button onClick={() => setStage(2)}>Show me what it's worth</button>
                  : (
                    <div className="fair">
                      <div className="quoterow">
                        <div>
                    <span className="lbl">
                      <Term label="those wears are worth">
                        Fair value: what the wears are worth at the {money(q.your_cost_per_wear)}
                        {" "}a wear you already pay across your closet. That is your own price,
                        not the shop's.
                      </Term>
                    </span>
                    <b>{money(q.fair_value)}</b>
                  </div>
                        <div><span className="lbl">it comes back</span><b className="bad">{Math.round(q.return_prob * 100)}%</b></div>
                        <div>
                          <span className="lbl">
                            <Term label="so pay at most">
                              Your bid is the highest price at which the trade still makes you
                              money. Above it you are paying someone to take your money.
                            </Term>
                          </span>
                          <b className={q.no_price ? "bad" : ""}>{q.no_price ? "nothing" : money(q.fair_bid)}</b>
                        </div>
                        <div><span className="lbl">your bid</span><b>{money(bid)}</b></div>
                      </div>
                      <p className="muted">
                        {q.expected_wears} wears at the {money(q.your_cost_per_wear)} a wear you already
                        pay is {money(q.fair_value)} of use. {q.return_evidence}, and sending something
                        back still costs you about {money(q.friction)} in shipping and lost time —
                        {q.no_price
                          ? " which on this one outweighs the wears entirely. There is no price worth paying, free included."
                          : ` so the most it's worth here is ${money(q.fair_bid)}, against an ask of ${money(q.ask)}.`}
                      </p>
                      <p className={"verdictline " + (bid > q.fair_bid ? "bad" : "good")}>
                        {bid > q.fair_bid
                          ? `You bid ${money(bid)} — more than it is worth to you. That gap is the whole reason Mallard says anything.`
                          : `You bid ${money(bid)}, at or below what it is worth — but the shop is asking ${money(q.ask)}, so there is no trade.`}
                      </p>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* 3 — the decision, before the answer is shown. */}
          {stage >= 2 && (
            <div className="tstep">
              <div className="tnum">3</div>
              <div className="tbody">
                <h3>So — will you buy it?</h3>
                <p className="muted">Nothing here blocks you. The button on the shop always works.</p>
                <div className="decide">
                  <button className={"big-btn buy" + (call === "buy" ? " on" : "")} onClick={() => decide("buy")}>Buy it</button>
                  <button className={"big-btn skip" + (call === "skip" ? " on" : "")} onClick={() => decide("skip")}>Skip it</button>
                </div>
                <div className="whybox">
                  <input value={question} placeholder="Why? Ask Mallard — “why not?”, “what about size 9?”"
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") ask(); }} />
                  <button onClick={ask} disabled={asking || !question.trim()}>{asking ? "asking…" : "Ask"}</button>
                </div>
                {answer && <p className="duckline">“{answer}”</p>}
              </div>
            </div>
          )}

          {/* 4 — the scoreboard: what the decision was worth. */}
          {stage >= 3 && call && (
            <div className="tstep">
              <div className="tnum">4</div>
              <div className="tbody">
                <h3>What that decision was worth</h3>
                <div className="quoterow">
                  <div>
                    <span className="lbl">
                      <Term label="buying pays">
                        Expected value: every outcome weighted by how likely it is. Here, keeping
                        it ({Math.round((1 - q.return_prob) * 100)}%) versus returning it and
                        eating {money(q.friction)} of friction.
                      </Term>
                    </span>
                    <b className={q.ev >= 0 ? "good" : "bad"}>{money(q.ev)}</b>
                  </div>
                  <div><span className="lbl">skipping pays</span><b className={q.ev_if_skipped >= 0 ? "good" : "bad"}>{money(q.ev_if_skipped)}</b></div>
                  <div><span className="lbl">you</span><b>{call === "buy" ? "bought" : "skipped"}</b></div>
                  <div>
                    <span className="lbl">
                      <Term label="P&L on this one">
                        Profit and loss: what the decision you actually made is worth. Skipping
                        is a position too — not losing money counts.
                      </Term>
                    </span>
                    <b className={(call === "buy" ? q.ev : q.ev_if_skipped) >= 0 ? "good" : "bad"}>
                      {money(call === "buy" ? q.ev : q.ev_if_skipped)}
                    </b>
                  </div>
                </div>
                <p className="muted">
                  Worth, minus what it costs, weighted by how often it comes back:
                  {" "}{Math.round((1 - q.return_prob) * 100)}% of the time you keep it and you're
                  {" "}{money(q.fair_value - q.ask)} up or down on use; the rest of the time you return
                  it and eat {money(q.friction)}. That single number is what Mallard's one line at
                  checkout is standing on.
                </p>
                {book.length > 1 && (
                  <div className="book">
                    <h4>Your session</h4>
                    {book.map((r, i) => (
                      <div className="brow" key={i}>
                        <span>{r.title}</span>
                        <span className="muted">{r.call}</span>
                        <b className={r.pnl >= 0 ? "good" : "bad"}>{money(r.pnl)}</b>
                      </div>
                    ))}
                    <div className="brow total">
                      <span><b>Running P&amp;L</b></span><span />
                      <b className={realised >= 0 ? "good" : "bad"}>{money(realised)}</b>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* what the duck would have said, kept last so it doesn't lead */}
          <details className="ducksays">
            <summary>What Mallard says at checkout</summary>
            <p className="headline">“{score.headline}”</p>
            <div className="insights">
              {score.insights.map((i, k) => (
                <div className="insight" key={k}>
                  <div className="itop">
                    <span className={"ilabel " + i.type}>{INSIGHT_LABEL[i.type] ?? i.type}</span>
                    <span className="muted">weight {i.weight.toFixed(2)}</span>
                  </div>
                  <div className="iline">{i.line}</div>
                </div>
              ))}
              {!score.insights.length && <p className="muted">No pattern strong enough to say anything.</p>}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [grading, setGrading] = useState("");

  async function refresh() {
    const r = await getPortfolio();
    setP(r.data); setLive(r.live);
  }

  useEffect(() => {
    refresh();
    getStorefront().then(setItems);
    getStatus().then(setStatus);
  }, []);

  async function grade(id: string, correct: boolean) {
    setGrading(id);
    try { await gradePrediction(id, correct); await refresh(); }
    finally { setGrading(""); }
  }

  const over = p.overexposure;
  const gaps = p.coverage.filter((c) => !c.covered);
  const ungraded = p.ledger.predictions.filter((x) => !x.graded).length;

  // Same $800 pond scale as the duck card and popup.
  const pondPct = Math.min(100, (p.pond.saved / 800) * 100);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <DuckLogo />
          <div>
            <div className="tag">PUDDLE</div>
            <h1>You already own a <span>portfolio</span>. It's your closet.</h1>
            <p className="sub">
              Every purchase is a position: you pay once and collect wears for years. Mallard
              prices the next one before you pay for it.
            </p>
          </div>
        </div>
        <div className="badges">
          <div className={"badge " + (live ? "on" : "off")}>{live ? "brain connected" : "demo data"}</div>
          {status && (
            <>
              <div className={"badge " + (status.payments === "mock" ? "off" : "on")}>
                Visa: {status.payments === "mock" ? "simulated" : status.payments}
              </div>
              <div className={"badge " + (status.voice.configured ? "on" : "off")}>
                Voice: {status.voice.configured ? status.voice.provider : "no key"}
              </div>
            </>
          )}
        </div>
      </header>

      <Ticket items={items} />

      <section className="stats">
        <div className="stat big">
          <div className="lbl">How well your closet dresses you</div>
          <div className="val">{p.style_sharpe.toFixed(2)}</div>
          <div className="hint">
            how reliably you're dressed for whatever the day turns out to be, against the
            {" "}{p.risk_free} you'd get by wearing sweatpants to everything
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Kept, by not buying</div>
          <div className="val water">${p.pond.saved}</div>
          <div className="pond"><div className="fill" style={{ width: pondPct + "%" }} /></div>
          <div className="hint">{p.pond.skips} skip{p.pond.skips === 1 ? "" : "s"} recorded</div>
        </div>
        <div className="stat">
          <div className="lbl">Was Mallard right?</div>
          <div className="val">{p.ledger.accuracy}</div>
          <div className="hint">{ungraded} call{ungraded === 1 ? "" : "s"} still open</div>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>The days you have to dress for</h2>
          <p className="muted">
            An item is only worth something on the days it's right for. Red points are days
            you own nothing good for — that's where a new thing can actually pay.
          </p>
          <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
          <h3>How your week actually splits</h3>
          <p className="muted">Counted off your own wears, not a survey.</p>
          <LifeMix coverage={p.coverage} />
        </div>

        <div className="card">
          <h2>What to do next</h2>
          <p className="muted">
            Ranked by how much each dollar improves the days you're covered for — so a cheap
            fix beats an expensive upgrade to something you already have.
          </p>
          <h3 className="good">Worth buying (${p.rebalance.spent} of ${p.rebalance.budget})</h3>
          {p.rebalance.buy.map((b) => (
            <div className="rec" key={b.id}>
              <div>
                <b>{b.title}</b> <span className="muted">${b.price}</span>
                {b.covers_gap && <div className="quote">first thing you'd own for {b.covers_gap}</div>}
              </div>
              <div className="why good">+{b.alpha}</div>
            </div>
          ))}
          <h3 className="bad">Already covered</h3>
          {p.rebalance.skip.map((s) => (
            <div className="rec" key={s.id}>
              <div>
                <b>{s.title}</b> <span className="muted">${s.price}</span>
                {s.reasons?.[0] ? <div className="quote">“{s.reasons[0]}”</div> : null}
              </div>
              <div className="why bad">
                {s.alpha}
                {s.redundant_with.length
                  ? <span className="sub2">{s.redundant_with.length} unit{s.redundant_with.length === 1 ? "" : "s"} held</span>
                  : null}
              </div>
            </div>
          ))}
          {p.rebalance.neutral.length > 0 && (
            <>
              <h3 className="muted">No strong opinion</h3>
              {p.rebalance.neutral.map((nv) => (
                <div className="rec" key={nv.id}>
                  <div><b>{nv.title}</b> <span className="muted">${nv.price}</span></div>
                  <div className="why muted">{nv.alpha}</div>
                </div>
              ))}
            </>
          )}
          <h3 className="muted">Safe to let go</h3>
          <p className="muted">Only things whose absence leaves no day uncovered.</p>
          {p.rebalance.donate.map((d) => (
            <div className="rec" key={d.id}>
              <div><b>{d.title}</b> <span className="muted">${d.cost_per_wear}/wear</span></div>
              <div className="why muted">{d.expected_payoff}</div>
            </div>
          ))}
        </div>
      </section>

      {over && (
        <section className="card conc">
          <div>
            <h2>Where your closet is piled up</h2>
            <p className="muted">
              Most closets are one bet made many times. This is how much of yours is aimed at
              a single kind of day.
            </p>
          </div>
          <div className="concnums">
            <div><span className="lbl">concentration</span><b>{over.hhi}</b></div>
            <div><span className="lbl">busiest day</span><b>{over.top_label}</b></div>
            <div><span className="lbl">its share</span><b>{(over.top_share * 100).toFixed(0)}%</b></div>
            <div><span className="lbl">units for it</span><b>{over.top_count}</b></div>
          </div>
          {gaps.length > 0 && (
            <p className="concline">
              <b>{over.top_count}</b> things for <b>{over.top_label.toLowerCase()}</b>, and nothing
              for <b>{gaps.map((g) => g.state.toLowerCase()).join(", ")}</b>.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Everything you own</h2>
        <p className="muted">
          <em>Share of wears</em> is how much of your dressing each thing should be doing.
          {" "}<em>Payoff</em> is how useful it is across the days you actually have.
        </p>
        <div className="tablewrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Category</th><th className="num">Wears</th>
              <th className="num">Cost / wear</th><th className="num">Payoff</th>
              <th className="num">Share of wears</th><th>Flag</th>
            </tr></thead>
            <tbody>
              {[...p.holdings].sort((a, b) => b.weight - a.weight).map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td><td className="muted">{h.category}</td>
                  <td className="num">{h.wears}</td>
                  <td className="num">${h.cost_per_wear}</td><td className="num">{h.expected_payoff}</td>
                  <td className="num">
                    <span className="wbar" title={String(h.weight)}>
                      <i style={{ width: `${Math.min(100, h.weight * 400)}%` }} />
                    </span>
                  </td>
                  <td>
                    {h.redundant_with.length
                      ? <span className="pill bad">{h.redundant_with.length + 1} units held</span>
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Mallard's book</h2>
        <p className="muted">
          In its own words, kept whether it was right or wrong. Grade one and the score above moves.
        </p>
        <div className="ledger">
          {p.ledger.predictions.map((pr) => (
            <div className={"lrow " + (pr.correct ? "ok" : pr.graded ? "no" : "pending")} key={pr.id}>
              <div className="lmain">
                <b>{pr.item}</b>
                {pr.line && <div className="quote">“{pr.line}”</div>}
              </div>
              <div className="lmeta">
                <span className={"call " + pr.call}>{pr.call}</span>
                {pr.user_action && <span className="muted">you {pr.user_action}</span>}
                <span className="muted">{(pr.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="lgrade">
                {pr.graded ? <span>{pr.correct ? "right" : "wrong"}</span>
                  : live ? (
                    <>
                      <button className="tiny" disabled={grading === pr.id} onClick={() => grade(pr.id, true)}>right</button>
                      <button className="tiny" disabled={grading === pr.id} onClick={() => grade(pr.id, false)}>wrong</button>
                    </>
                  ) : <span className="muted">pending</span>}
              </div>
            </div>
          ))}
          {!p.ledger.predictions.length && <p className="muted">No calls yet. Check out on the shop and one appears here.</p>}
        </div>
      </section>

      <footer className="foot">
        Puddle. Built at HackMIT 2026 on FastAPI and numpy.
      </footer>
    </div>
  );
}
