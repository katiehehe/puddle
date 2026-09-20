import { useEffect, useState } from "react";
import { getPortfolio } from "./api";
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

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    getPortfolio().then(({ data, live }) => { setP(data); setLive(live); });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

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
        <div className={"badge " + (live ? "on" : "off")}>{live ? "live · brain connected" : "offline · demo data"}</div>
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
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Wears</th><th>Cost / wear</th><th>Expected payoff</th><th>Flag</th></tr></thead>
          <tbody>
            {p.holdings.map((h) => (
              <tr key={h.id}>
                <td>{h.title}</td><td className="muted">{h.category}</td><td>{h.wears}</td>
                <td>${h.cost_per_wear}</td><td>{h.expected_payoff}</td>
                <td>{h.redundant_with.length ? <span className="pill bad">{h.redundant_with.length} dupes</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={"card" + shown(1)}>
        <h2>Coverage across your life</h2>
        <p className="muted">Red points are gaps.</p>
        <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
      </section>

      <section className={"stats" + shown(2)}>
        <div className="stat big">
          <div className="lbl">Style Sharpe</div>
          <div className="val">{p.style_sharpe.toFixed(2)}</div>
          <div className="hint">risk-adjusted usefulness</div>
        </div>
        <div className="stat">
          <div className="lbl">Pond · saved</div>
          <div className="val water">${p.pond.saved}</div>
          <div className="pond"><div className="fill" style={{ width: pondPct + "%" }} /></div>
        </div>
        <div className="stat">
          <div className="lbl">Duck's track record</div>
          <div className="val">{p.ledger.accuracy}</div>
          <div className="hint">calls graded correct</div>
        </div>
      </section>

      <section className={"grid2" + shown(3)}>
        <div className="card">
          <h2>Rebalance</h2>
          <p className="muted">Positive alpha expands the frontier.</p>
          <h3 className="good">Buy · ${p.rebalance.spent} of ${p.rebalance.budget}</h3>
          {p.rebalance.buy.map((b) => (
            <div className="rec" key={b.id}>
              <div><b>{b.title}</b> <span className="muted">${b.price}</span></div>
              <div className="why good">α +{b.alpha}{b.covers_gap ? ` · covers ${b.covers_gap}` : ""}</div>
            </div>
          ))}
          <h3 className="bad">Skip</h3>
          {p.rebalance.skip.map((s) => (
            <div className="rec" key={s.id}>
              <div>
                <b>{s.title}</b> <span className="muted">${s.price}</span>
                {s.reasons?.[0] ? <div className="quote">“{s.reasons[0]}”</div> : null}
              </div>
              <div className="why bad">α {s.alpha}{s.redundant_with.length ? ` · ${s.redundant_with.length} similar owned` : ""}</div>
            </div>
          ))}
          <h3 className="muted">Donate (dead weight)</h3>
          {p.rebalance.donate.map((d) => (
            <div className="rec" key={d.id}><div><b>{d.title}</b></div><div className="why muted">low return</div></div>
          ))}
        </div>

        <div className="card">
          <h2>Prediction ledger</h2>
          <p className="muted">The duck keeps score in public.</p>
          <div className="ledger">
            {p.ledger.predictions.map((pr) => (
              <div className={"lrow " + (pr.correct ? "ok" : pr.graded ? "no" : "pending")} key={pr.id}>
                <span>{pr.item}</span>
                <span className="muted">{pr.call}</span>
                <span>{pr.graded ? (pr.correct ? "✓ right" : "✗ wrong") : "…pending"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="foot">
        <span className="prints">❋ ❋ ❋</span>
        Puddle · HackMIT 2026 · FastAPI + numpy · extension + dashboard
      </footer>
    </div>
  );
}
