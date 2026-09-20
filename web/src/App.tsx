import { useEffect, useState } from "react";
import {
  CatalogItem, Score, Status,
  getPortfolio, getStatus, getStorefront, gradePrediction, scoreItem,
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

// The argument in order: what you own, the days you dress for, what it returns,
// the trade. Shown one step at a time so the quant half lands after the closet.
const STEPS = [
  { n: "1", tab: "Your closet", say: "Everything you own, and how often you wear it." },
  { n: "2", tab: "Your days", say: "The occasions they have to cover. Red is uncovered." },
  { n: "3", tab: "The return", say: "Price each item by the use it returns, and the closet gets a Sharpe ratio." },
  { n: "4", tab: "The trade", say: "Buy what covers a gap. Skip what you already own." },
];

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

/** The exact call the extension makes at checkout, run on demand. The hour
 *  slider is what makes the time-of-day rule inspectable: past 23:00 it
 *  appears, and it still never outranks the item-specific verdict. */
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

  return (
    <section className="card">
      <h2>Ask the duck</h2>
      <p className="muted">The call the extension makes at checkout. Past 23:00 the late-night pattern appears.</p>

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
              <div><span className="lbl">Sharpe after</span><b className={pf.style_sharpe_after >= pf.style_sharpe_before ? "good" : "bad"}>{pf.style_sharpe_after}</b></div>
              <div><span className="lbl">covers</span><b>{pf.covers_gap?.label ?? "—"}</b></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [step, setStep] = useState(0);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
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
  const shown = (i: number) => (i <= step ? "" : " hidden-step");

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <DuckLogo />
          <div>
            <div className="tag">PUDDLE · YOUR CLOSET PORTFOLIO</div>
            <h1>Your wardrobe, as an <span>investment portfolio</span></h1>
            <p className="sub">{STEPS[step].say}</p>
          </div>
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

      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s.n} className={"stepbtn" + (i === step ? " on" : i < step ? " done" : "")}
            onClick={() => setStep(i)}>
            <span className="stepn">{s.n}</span>{s.tab}
          </button>
        ))}
        <button className="stepnext" onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
          disabled={step === STEPS.length - 1}>Next →</button>
      </nav>

      <section className={"card" + shown(0)}>
        <h2>Holdings</h2>
        <p className="muted"><em>Weight</em> is the share of wears mean-variance gives each item.</p>
        <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Item</th><th>Category</th><th className="num">Wears</th>
            <th className="num">Cost / wear</th><th className="num">Payoff</th>
            <th className="num">Weight</th><th>Flag</th>
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
                <td>{h.redundant_with.length ? <span className="pill bad">{h.redundant_with.length} dupes</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className={"grid2" + shown(1)}>
        <div className="card">
          <h2>Coverage across your life</h2>
          <p className="muted">Red points are gaps.</p>
          <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
        </div>
        <div className="card">
          <h2>Life mix</h2>
          <p className="muted">From recorded wears, not a table someone typed.</p>
          <LifeMix coverage={p.coverage} />
        </div>
      </section>

      {over && (
        <section className={"card conc" + shown(1)}>
          <div>
            <h2>Concentration</h2>
            <p className="muted">Herfindahl over which occasion each item is <em>for</em>.</p>
          </div>
          <div className="concnums">
            <div><span className="lbl">HHI</span><b>{over.hhi}</b></div>
            <div><span className="lbl">busiest occasion</span><b>{over.top_label}</b></div>
            <div><span className="lbl">its share</span><b>{(over.top_share * 100).toFixed(0)}%</b></div>
            <div><span className="lbl">items for it</span><b>{over.top_count}</b></div>
          </div>
          {gaps.length > 0 && (
            <p className="concline">
              <b>{over.top_count}</b> things for <b>{over.top_label.toLowerCase()}</b>, and nothing
              for <b>{gaps.map((g) => g.state.toLowerCase()).join(", ")}</b>.
            </p>
          )}
        </section>
      )}

      <section className={"stats" + shown(2)}>
        <div className="stat big">
          <div className="lbl">Style Sharpe</div>
          <div className="val">{p.style_sharpe.toFixed(2)}</div>
          <div className="hint">risk-adjusted usefulness, over a loungewear baseline of {p.risk_free}</div>
        </div>
        <div className="stat">
          <div className="lbl">Pond · saved</div>
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

      <div className={shown(3)}>
        <LiveScorer items={items} />
      </div>

      <section className={"card" + shown(3)}>
        <h2>Rebalance</h2>
        <p className="muted">Ranked by marginal Sharpe per dollar, picked greedily under budget.</p>
        <h3 className="good">Buy · ${p.rebalance.spent} of ${p.rebalance.budget}</h3>
        {p.rebalance.buy.map((b) => (
          <div className="rec" key={b.id}>
            <div>
              <b>{b.title}</b> <span className="muted">${b.price}</span>
              {b.covers_gap && <div className="quote">covers {b.covers_gap}</div>}
            </div>
            <div className="why good">α +{b.alpha}<span className="sub2">{b.sharpe_per_dollar}/$</span></div>
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
        <p className="muted">Removing these leaves every covered occasion covered.</p>
        {p.rebalance.donate.map((d) => (
          <div className="rec" key={d.id}>
            <div><b>{d.title}</b> <span className="muted">${d.cost_per_wear}/wear</span></div>
            <div className="why muted">payoff {d.expected_payoff}</div>
          </div>
        ))}
      </section>

      <section className={"card" + shown(3)}>
        <h2>Prediction ledger</h2>
        <p className="muted">Every call, in public. Grade one and the score above moves.</p>
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
                {pr.graded ? <span>{pr.correct ? "✓ right" : "✗ wrong"}</span>
                  : live ? (
                    <>
                      <button className="tiny" disabled={grading === pr.id} onClick={() => grade(pr.id, true)}>right</button>
                      <button className="tiny" disabled={grading === pr.id} onClick={() => grade(pr.id, false)}>wrong</button>
                    </>
                  ) : <span className="muted">…pending</span>}
              </div>
            </div>
          ))}
          {!p.ledger.predictions.length && <p className="muted">No calls yet. Check out on the shop and one appears here.</p>}
        </div>
      </section>

      <footer className="foot">
        <span className="prints">❋ ❋ ❋</span>
        Puddle · HackMIT 2026 · FastAPI + numpy · extension + dashboard
      </footer>
    </div>
  );
}
