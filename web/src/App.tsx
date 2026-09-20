import { useEffect, useState } from "react";
import {
  CatalogItem, Score, Status,
  getPortfolio, getStatus, getStorefront, gradePrediction, scoreItem,
} from "./api";
import { FIXTURE, Portfolio } from "./fixtures";

const DUCK_FACE: Record<string, string> = {
  idle: "quiet", curious: "curious", concerned: "concerned", approving: "approving",
};

const INSIGHT_LABEL: Record<string, string> = {
  return_pattern: "Return pattern",
  time_pattern: "Time of day",
  redundancy: "Redundancy",
  coverage_gap: "Coverage gap",
  overexposure: "Overexposure",
};

/** Occasions on a wheel. A gap is a spoke the closet cannot reach. */
function CoverageRadar({ coverage }: { coverage: Portfolio["coverage"] }) {
  const size = 320, cx = size / 2, cy = size / 2, R = 120;
  const n = coverage.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = coverage.map((c, i) => pt(i, R * c.coverage).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1].map((f) => coverage.map((_, i) => pt(i, R * f).join(",")).join(" "));
  // The 0.55 ring is the line between covered and not; drawing it makes the
  // gaps a fact you can see rather than a colour you have to trust.
  const bar = coverage.map((_, i) => pt(i, R * 0.55).join(",")).join(" ");
  return (
    <svg width={size + 130} height={size} viewBox={`-65 0 ${size + 130} ${size}`} role="img"
         aria-label="Coverage by occasion">
      {rings.map((r, i) => <polygon key={i} points={r} fill="none" stroke="#e4e8ec" />)}
      <polygon points={bar} fill="none" stroke="#b3261e" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      {coverage.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#eef1f4" />;
      })}
      <polygon points={poly} fill="rgba(42,127,184,.18)" stroke="#2a7fb8" strokeWidth={2} />
      {coverage.map((c, i) => {
        const [lx, ly] = pt(i, R + 20);
        const gap = !c.covered;
        const [dx, dy] = pt(i, R * c.coverage);
        const anchor = lx - cx > 8 ? "start" : lx - cx < -8 ? "end" : "middle";
        const lines = c.state.split(" / ");
        return (
          <g key={i}>
            <circle cx={dx} cy={dy} r={3.5} fill={gap ? "#b3261e" : "#2a7fb8"} />
            <text x={lx} y={ly - (lines.length - 1) * 6} fontSize={11} textAnchor={anchor}
                  fill={gap ? "#b3261e" : "#5d6771"} fontWeight={gap ? 700 : 400}>
              {lines.map((l, k) => <tspan key={k} x={lx} dy={k === 0 ? 0 : 12}>{l}</tspan>)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** How often each occasion actually happens, from recorded wears. The mix is
 *  derived, not typed in, which is why it is worth showing next to coverage. */
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

/** The same call the duck makes at checkout, run on demand. */
function LiveScorer({ items }: { items: CatalogItem[] }) {
  const [id, setId] = useState("");
  const [hour, setHour] = useState(23);
  const [res, setRes] = useState<Score | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!id && items.length) setId(items[0].id); }, [items, id]);

  async function run(nextId = id, nextHour = hour) {
    if (!nextId) return;
    setBusy(true); setErr("");
    try { setRes(await scoreItem(nextId, nextHour)); }
    catch (e) { setErr(e instanceof Error ? e.message : "could not reach the brain"); setRes(null); }
    finally { setBusy(false); }
  }

  const pf = res?.portfolio;
  const delta = pf ? pf.style_sharpe_after - pf.style_sharpe_before : 0;

  return (
    <div className="card">
      <h2>Ask the duck</h2>
      <p className="muted">
        The exact call the extension makes at checkout. Change the hour: the
        late-night pattern is real, and it only speaks when something else already is.
      </p>

      <div className="controls">
        <select value={id} onChange={(e) => { setId(e.target.value); run(e.target.value, hour); }}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title} · ${i.price}</option>)}
          {!items.length && <option value="">brain offline</option>}
        </select>
        <label className="hourlab">
          <span className="muted">hour</span>
          <input type="range" min={0} max={23} value={hour}
                 onChange={(e) => setHour(+e.target.value)}
                 onMouseUp={() => run()} onTouchEnd={() => run()} />
          <b className="hourval">{String(hour).padStart(2, "0")}:40</b>
        </label>
        <button onClick={() => run()} disabled={busy || !id}>{busy ? "scoring…" : "Score it"}</button>
      </div>

      {err && <p className="err">{err}</p>}

      {res && (
        <div className={"verdict " + res.duck_state}>
          <div className="vhead">
            <span className={"face " + res.duck_state}>{DUCK_FACE[res.duck_state] ?? res.duck_state}</span>
            <span className={"call " + res.decision}>{res.decision}</span>
            <span className="muted">
              {res.speak ? "speaks out loud" : "stays silent"} · confidence {(res.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="headline">“{res.headline}”</p>

          {res.insights.length > 0 && (
            <div className="insights">
              {res.insights.map((i, k) => (
                <div className="insight" key={k}>
                  <div className="itop">
                    <span className={"ilabel " + i.type}>{INSIGHT_LABEL[i.type] ?? i.type}</span>
                    <span className="muted">weight {i.weight > 0 ? "+" : ""}{i.weight.toFixed(2)}</span>
                  </div>
                  <div className="iline">{i.line}</div>
                  <div className="istat">
                    {Object.entries(i.stat).map(([k2, v]) => (
                      <span className="kv" key={k2}>
                        <em>{k2}</em>{String(typeof v === "number" ? Math.round(v * 1000) / 1000 : v)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pf && (
            <div className="mathrow">
              <div><span className="lbl">alpha</span><b className={pf.alpha > 0 ? "good" : "bad"}>{pf.alpha > 0 ? "+" : ""}{pf.alpha}</b></div>
              <div><span className="lbl">beta</span><b>{pf.beta}</b></div>
              <div><span className="lbl">Sharpe before</span><b>{pf.style_sharpe_before}</b></div>
              <div><span className="lbl">Sharpe after</span><b className={delta >= 0 ? "good" : "bad"}>{pf.style_sharpe_after}</b></div>
              <div><span className="lbl">covers</span><b>{pf.covers_gap?.label ?? "—"}</b></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [grading, setGrading] = useState<string>("");

  async function refresh() {
    const { data, live } = await getPortfolio();
    setP(data); setLive(live);
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

  const pondPct = Math.min(100, (p.pond.saved / 500) * 100);
  const over = p.overexposure;
  const gaps = p.coverage.filter((c) => !c.covered);
  const ungraded = p.ledger.predictions.filter((x) => !x.graded).length;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="tag">PUDDLE · YOUR CLOSET PORTFOLIO</div>
          <h1>Your wardrobe, as an <span>investment portfolio</span> 🦆</h1>
          <p className="sub">
            Every item is an asset, every occasion a state of the world. Returns, covariance and
            Sharpe are the real Markowitz objects, computed over what you actually wear.
          </p>
        </div>
        <div className="badges">
          <div className={"badge " + (live ? "on" : "off")}>{live ? "live · brain connected" : "offline · demo data"}</div>
          {status && (
            <>
              <div className={"badge " + (status.payments === "mock" ? "off" : "on")}>
                Visa · {status.payments === "mock" ? "simulated" : status.payments}
              </div>
              <div className={"badge " + (status.voice.configured ? "on" : "off")}>
                Voice · {status.voice.configured ? status.voice.provider : "no key"}
              </div>
            </>
          )}
        </div>
      </header>

      <section className="stats">
        <div className="stat big">
          <div className="lbl">Style Sharpe</div>
          <div className="val">{p.style_sharpe.toFixed(2)}</div>
          <div className="hint">
            risk-adjusted usefulness, over a loungewear baseline of {p.risk_free}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Pond · saved from regret buys</div>
          <div className="val water">${p.pond.saved}</div>
          <div className="pond"><div className="fill" style={{ width: pondPct + "%" }} /></div>
          <div className="hint">{p.pond.skips} skip{p.pond.skips === 1 ? "" : "s"} recorded</div>
        </div>
        <div className="stat">
          <div className="lbl">Duck's track record</div>
          <div className="val">{p.ledger.accuracy}</div>
          <div className="hint">{ungraded} call{ungraded === 1 ? "" : "s"} still open</div>
        </div>
      </section>

      {over && (
        <section className="card conc">
          <div>
            <h2>Concentration</h2>
            <p className="muted">
              Herfindahl over which occasion each item is <em>for</em>. High means your closet is
              piled into a few days of the week.
            </p>
          </div>
          <div className="concnums">
            <div><span className="lbl">HHI</span><b>{over.hhi}</b></div>
            <div><span className="lbl">busiest occasion</span><b>{over.top_label}</b></div>
            <div><span className="lbl">its share</span><b>{(over.top_share * 100).toFixed(0)}%</b></div>
            <div><span className="lbl">items for it</span><b>{over.top_count}</b></div>
          </div>
          {gaps.length > 0 && (
            <p className="concline">
              <b>{over.top_count}</b> things for <b>{over.top_label?.toLowerCase()}</b>,
              and nothing for <b>{gaps.map((g) => g.state.toLowerCase()).join(", ")}</b>.
            </p>
          )}
        </section>
      )}

      <LiveScorer items={items} />

      <section className="grid2">
        <div className="card">
          <h2>Coverage across your life</h2>
          <p className="muted">
            Red spokes fall inside the dashed line: occasions nothing you own serves well.
          </p>
          <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
          <h3>Life mix</h3>
          <p className="muted">Derived from recorded wears, not a table someone typed.</p>
          <LifeMix coverage={p.coverage} />
        </div>

        <div className="card">
          <h2>Rebalance</h2>
          <p className="muted">
            Ranked by marginal Sharpe per dollar, then picked greedily under budget.
          </p>

          <h3 className="good">Buy · ${p.rebalance.spent} of ${p.rebalance.budget}</h3>
          {p.rebalance.buy.map((b) => (
            <div className="rec" key={b.id}>
              <div>
                <b>{b.title}</b> <span className="muted">${b.price}</span>
                {b.covers_gap && <div className="quote">covers {b.covers_gap}</div>}
              </div>
              <div className="why good">
                α +{b.alpha}
                <span className="sub2">{b.sharpe_per_dollar}/$</span>
              </div>
            </div>
          ))}

          <h3 className="bad">Skip</h3>
          {p.rebalance.skip.map((s) => (
            <div className="rec" key={s.id}>
              <div>
                <b>{s.title}</b> <span className="muted">${s.price}</span>
                {s.reasons?.[0] ? <div className="quote">“{s.reasons[0]}”</div> : null}
              </div>
              <div className="why bad">
                α {s.alpha}
                {s.redundant_with.length ? <span className="sub2">{s.redundant_with.length} similar owned</span> : null}
              </div>
            </div>
          ))}

          {p.rebalance.neutral.length > 0 && (
            <>
              <h3 className="muted">No strong opinion</h3>
              {p.rebalance.neutral.map((nv) => (
                <div className="rec" key={nv.id}>
                  <div><b>{nv.title}</b> <span className="muted">${nv.price}</span></div>
                  <div className="why muted">α {nv.alpha}</div>
                </div>
              ))}
            </>
          )}

          <h3 className="muted">Donate</h3>
          <p className="muted">Only items whose removal leaves every covered occasion covered.</p>
          {p.rebalance.donate.map((d) => (
            <div className="rec" key={d.id}>
              <div><b>{d.title}</b> <span className="muted">${d.cost_per_wear}/wear</span></div>
              <div className="why muted">payoff {d.expected_payoff}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Holdings</h2>
        <p className="muted">
          <em>Weight</em> is the optimal share of wears mean-variance gives each item. <em>Payoff</em>
          {" "}is its expected usefulness across your occasions.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Item</th><th>Category</th><th className="num">Wears</th>
                <th className="num">Cost / wear</th><th className="num">Payoff</th>
                <th className="num">Weight</th><th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {[...p.holdings].sort((a, b) => b.weight - a.weight).map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td>
                  <td className="muted">{h.category}</td>
                  <td className="num">{h.wears}</td>
                  <td className="num">${h.cost_per_wear}</td>
                  <td className="num">{h.expected_payoff}</td>
                  <td className="num">
                    <span className="wbar" title={String(h.weight)}>
                      <i style={{ width: `${Math.min(100, h.weight * 400)}%` }} />
                    </span>
                  </td>
                  <td>{h.redundant_with.length ? <span className="pill bad">{h.redundant_with.length} dupes</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Prediction ledger</h2>
        <p className="muted">
          Every call the duck has made, with what it actually said. Admitting when it is wrong is
          what earns the right to interrupt: grade one and the score above moves.
        </p>
        <div className="ledger">
          {p.ledger.predictions.map((pr) => {
            const r = pr as any;
            return (
              <div className={"lrow " + (r.correct ? "ok" : r.graded ? "no" : "pending")} key={r.id}>
                <div className="lmain">
                  <b>{r.item}</b>
                  {r.line && <div className="quote">“{r.line}”</div>}
                </div>
                <div className="lmeta">
                  <span className={"call " + r.call}>{r.call}</span>
                  {r.user_action && <span className="muted">you {r.user_action}</span>}
                  {typeof r.confidence === "number" && <span className="muted">{(r.confidence * 100).toFixed(0)}%</span>}
                </div>
                <div className="lgrade">
                  {r.graded ? (
                    <span>{r.correct ? "✓ right" : "✗ wrong"}</span>
                  ) : live ? (
                    <>
                      <button className="tiny" disabled={grading === r.id} onClick={() => grade(r.id, true)}>right</button>
                      <button className="tiny" disabled={grading === r.id} onClick={() => grade(r.id, false)}>wrong</button>
                    </>
                  ) : <span className="muted">…pending</span>}
                </div>
              </div>
            );
          })}
          {!p.ledger.predictions.length && <p className="muted">No calls yet. Check out on the shop and one appears here.</p>}
        </div>
      </section>

      <footer className="foot">
        Puddle · HackMIT 2026 · brain: FastAPI + numpy · surfaces: extension + dashboard
      </footer>
    </div>
  );
}
