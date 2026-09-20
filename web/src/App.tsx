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

// One sentence a step. The walkthrough starts at the sentence the duck says at
// checkout and works backwards to the number underneath it, because the whole
// claim of the product is that those are the same thing.
const STEPS = [
  { tab: "The line", say: "What the duck says at checkout." },
  { tab: "Your closet", say: "The items that line is about." },
  { tab: "Your days", say: "The occasions they have to cover." },
  { tab: "The number", say: "What this item adds to the closet." },
  { tab: "The call", say: "Buy, skip, or no opinion." },
];

const INSIGHT_LABEL: Record<string, string> = {
  return_pattern: "Returns",
  time_pattern: "Time of day",
  redundancy: "Redundancy",
  coverage_gap: "Coverage gap",
  overexposure: "Overexposure",
};

/** How often each occasion actually happens, from recorded wears. */
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

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [grading, setGrading] = useState("");
  const [id, setId] = useState("");
  const [hour, setHour] = useState(23);
  const [score, setScore] = useState<Score | null>(null);
  const [err, setErr] = useState("");

  async function refresh() {
    const r = await getPortfolio();
    setP(r.data); setLive(r.live);
  }

  async function run(nextId: string, nextHour = hour) {
    if (!nextId) return;
    setErr("");
    try { setScore(await scoreItem(nextId, nextHour)); }
    catch (e) { setScore(null); setErr(e instanceof Error ? e.message : "brain offline"); }
  }

  useEffect(() => {
    refresh();
    getStatus().then(setStatus);
    getStorefront().then((list) => {
      setItems(list);
      // The URL can name the item, by id or by the title the duck saw on the
      // shop page, so the duck's card links straight to its own reasoning.
      const wanted = (new URLSearchParams(location.search).get("item") ?? "").toLowerCase();
      const match = wanted && list.find((i) =>
        i.id.toLowerCase() === wanted ||
        i.title.toLowerCase().includes(wanted) ||
        wanted.includes(i.title.toLowerCase()));
      const first = match?.id ?? list[0]?.id ?? "";
      setId(first);
      run(first);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  async function grade(pid: string, correct: boolean) {
    setGrading(pid);
    try { await gradePrediction(pid, correct); await refresh(); }
    finally { setGrading(""); }
  }

  const over = p.overexposure;
  const gaps = p.coverage.filter((c) => !c.covered);
  const ungraded = p.ledger.predictions.filter((x) => !x.graded).length;
  const pondPct = Math.min(100, (p.pond.saved / 800) * 100);
  const on = (i: number) => (i === step ? "panel" : "panel hidden-step");

  const pf = score?.portfolio;
  const dupes = pf?.redundant_with ?? [];
  const owned = p.holdings.filter((h) => dupes.some((d) => d.id === h.id || d.title === h.title));
  const delta = pf ? +(pf.style_sharpe_after - pf.style_sharpe_before).toFixed(3) : 0;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="tag">Puddle</div>
          <h1>Why the duck said that</h1>
        </div>
        <div className="badges">
          <span className={"badge " + (live ? "on" : "off")}>{live ? "brain live" : "demo data"}</span>
          {status && <span className={"badge " + (status.payments === "mock" ? "off" : "on")}>Visa {status.payments === "mock" ? "simulated" : "sandbox"}</span>}
          {status && <span className={"badge " + (status.voice.configured ? "on" : "off")}>Voice {status.voice.configured ? status.voice.provider : "off"}</span>}
        </div>
      </header>

      <div className="pickrow">
        <select value={id} onChange={(e) => { setId(e.target.value); run(e.target.value); }}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title} · ${i.price}</option>)}
          {!items.length && <option value="">brain offline</option>}
        </select>
        <label className="hourlab">
          <span className="muted">hour</span>
          <input type="range" min={0} max={23} value={hour}
            onChange={(e) => setHour(+e.target.value)}
            onMouseUp={() => run(id)} onTouchEnd={() => run(id)} />
          <b className="hourval">{String(hour).padStart(2, "0")}:40</b>
        </label>
        {err && <span className="err">{err}</span>}
      </div>

      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s.tab} className={"stepbtn" + (i === step ? " on" : i < step ? " done" : "")}
            onClick={() => setStep(i)}>
            <span className="stepn">{i + 1}</span>{s.tab}
          </button>
        ))}
        <button className="stepnext" onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
          disabled={step === STEPS.length - 1}>Next</button>
      </nav>

      <p className="say">{STEPS[step].say}</p>

      {/* 1 — the sentence the shopper actually hears */}
      <section className={on(0)}>
        {score ? (
          <>
            <p className={"quoteline " + score.duck_state}>{score.headline}</p>
            <p className="muted">
              {score.decision === "skip" ? "Skip" : score.decision === "buy" ? "Buy" : "No strong opinion"}
              {" · "}confidence {(score.confidence * 100).toFixed(0)}%
              {" · "}nothing is blocked, the button still works
            </p>
          </>
        ) : <p className="muted">No score yet.</p>}
      </section>

      {/* 2 — the closet the line is about */}
      <section className={on(1)}>
        {owned.length ? (
          <>
            <table>
              <thead><tr><th>Already owned</th><th className="num">Wears</th><th className="num">Cost / wear</th><th className="num">Payoff</th></tr></thead>
              <tbody>
                {owned.map((h) => (
                  <tr key={h.id}>
                    <td>{h.title}</td><td className="num">{h.wears}</td>
                    <td className="num">${h.cost_per_wear}</td><td className="num">{h.expected_payoff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Correlated with the item in the cart, so it earns the same wears twice.</p>
          </>
        ) : (
          <p className="muted">Nothing in the closet overlaps this item.</p>
        )}
      </section>

      {/* 3 — the occasions, which is what makes an item useful at all */}
      <section className={on(2)}>
        <div className="grid2">
          <div>
            <CoverageRadar coverage={p.coverage} />
            <p className="muted">Red is uncovered.</p>
          </div>
          <div>
            <LifeMix coverage={p.coverage} />
            <p className="muted">Share of recorded wears.</p>
          </div>
        </div>
      </section>

      {/* 4 — the bridge: the same line, as one number */}
      <section className={on(3)}>
        {pf ? (
          <>
            <div className="numrow">
              <div><span className="lbl">Sharpe now</span><b>{pf.style_sharpe_before}</b></div>
              <div><span className="lbl">with this item</span><b className={delta >= 0 ? "good" : "bad"}>{pf.style_sharpe_after}</b></div>
              <div><span className="lbl">alpha</span><b className={pf.alpha > 0 ? "good" : "bad"}>{pf.alpha > 0 ? "+" : ""}{pf.alpha}</b></div>
              <div><span className="lbl">beta</span><b>{pf.beta}</b></div>
              <div><span className="lbl">covers</span><b>{pf.covers_gap?.label ?? "nothing new"}</b></div>
            </div>
            <p className="bridge">
              Alpha is the Sharpe this item adds after paying for it. {pf.alpha > 0
                ? "Positive, so it buys coverage you don't have."
                : "Negative, so the money buys wears you already own."} That is the sentence on step 1.
            </p>
            {score && score.insights.length > 0 && (
              <div className="insights">
                {score.insights.map((i, k) => (
                  <div className="insight" key={k}>
                    <span className={"ilabel " + i.type}>{INSIGHT_LABEL[i.type] ?? i.type}</span>
                    <div className="iline">{i.line}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <p className="muted">No score yet.</p>}
      </section>

      {/* 5 — what the number does to the rest of the closet */}
      <section className={on(4)}>
        <div className="numrow">
          <div><span className="lbl">Style Sharpe</span><b>{p.style_sharpe.toFixed(2)}</b></div>
          <div><span className="lbl">Pond</span><b>${p.pond.saved}</b></div>
          <div><span className="lbl">Track record</span><b>{p.ledger.accuracy}</b></div>
          <div><span className="lbl">Open calls</span><b>{ungraded}</b></div>
        </div>
        <div className="pond"><div className="fill" style={{ width: pondPct + "%" }} /></div>
        <div className="grid2 recs">
          <div>
            <h3 className="good">Buy</h3>
            {p.rebalance.buy.map((b) => (
              <div className="rec" key={b.id}>
                <div><b>{b.title}</b> <span className="muted">${b.price}</span>
                  {b.covers_gap && <div className="quote">covers {b.covers_gap}</div>}</div>
                <div className="why good">+{b.alpha}</div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="bad">Skip</h3>
            {p.rebalance.skip.map((s) => (
              <div className="rec" key={s.id}>
                <div><b>{s.title}</b> <span className="muted">${s.price}</span>
                  {s.redundant_with.length ? <div className="quote">{s.redundant_with.length} similar owned</div> : null}</div>
                <div className="why bad">{s.alpha}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <details className="more">
        <summary>The whole closet</summary>

        <h3>Holdings</h3>
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

        {over && (
          <>
            <h3>Concentration</h3>
            <div className="numrow">
              <div><span className="lbl">HHI</span><b>{over.hhi}</b></div>
              <div><span className="lbl">busiest</span><b>{over.top_label}</b></div>
              <div><span className="lbl">its share</span><b>{(over.top_share * 100).toFixed(0)}%</b></div>
              <div><span className="lbl">items for it</span><b>{over.top_count}</b></div>
            </div>
            {gaps.length > 0 && (
              <p className="muted">
                {over.top_count} for {over.top_label.toLowerCase()}, nothing for {gaps.map((g) => g.state.toLowerCase()).join(", ")}.
              </p>
            )}
          </>
        )}

        <h3>Prediction ledger</h3>
        <div className="ledger">
          {p.ledger.predictions.map((pr) => (
            <div className={"lrow " + (pr.correct ? "ok" : pr.graded ? "no" : "pending")} key={pr.id}>
              <div className="lmain">
                <b>{pr.item}</b>
                {pr.line && <div className="quote">{pr.line}</div>}
              </div>
              <div className="lmeta">
                <span className={"call " + pr.call}>{pr.call}</span>
                {pr.user_action && <span className="muted">you {pr.user_action}</span>}
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
          {!p.ledger.predictions.length && <p className="muted">No calls yet.</p>}
        </div>

        <h3>Donate</h3>
        {p.rebalance.donate.map((d) => (
          <div className="rec" key={d.id}>
            <div><b>{d.title}</b> <span className="muted">${d.cost_per_wear}/wear</span></div>
            <div className="why muted">{d.expected_payoff}</div>
          </div>
        ))}
      </details>

      <footer className="foot">Puddle · HackMIT 2026</footer>
    </div>
  );
}
