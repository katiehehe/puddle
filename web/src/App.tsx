import { useEffect, useState } from "react";
import { getPortfolio } from "./api";
import { FIXTURE, Portfolio } from "./fixtures";

// docs/theme.md — Night Pond palette, kept in sync with extension/content.js.
const THEME = {
  duck: "#f2b431", duckDeep: "#ffd166",
  water: "#4fb0e6", waterDeep: "#9fd6f2", ripple: "#1d4560",
  reed: "#46c586", warning: "#ff7a6e", muted: "#9db8c9", line: "#2b5878",
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
      <polygon points={poly} fill="rgba(79,176,230,.2)" stroke={THEME.water} strokeWidth={2} />
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

export default function App() {
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);

  useEffect(() => {
    getPortfolio().then(({ data, live }) => { setP(data); setLive(live); });
  }, []);

  // Same $800 pond scale as the duck card and popup.
  const pondPct = Math.min(100, (p.pond.saved / 800) * 100);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <DuckLogo />
          <div>
            <div className="tag">PUDDLE · YOUR CLOSET PORTFOLIO</div>
            <h1>Your wardrobe, as an <span>investment portfolio</span></h1>
            <p className="sub">Everything you own, priced by how much use it actually returns: and the trades to improve it.</p>
          </div>
        </div>
        <div className={"badge " + (live ? "on" : "off")}>{live ? "live · brain connected" : "offline · demo data"}</div>
      </header>

      <section className="stats">
        <div className="stat big">
          <div className="lbl">Style Sharpe</div>
          <div className="val">{p.style_sharpe.toFixed(2)}</div>
          <div className="hint">risk-adjusted usefulness of your closet</div>
        </div>
        <div className="stat">
          <div className="lbl">Pond · saved from regret buys</div>
          <div className="val water">${p.pond.saved}</div>
          <div className="pond"><div className="fill" style={{ width: pondPct + "%" }} /></div>
        </div>
        <div className="stat">
          <div className="lbl">Duck's track record</div>
          <div className="val">{p.ledger.accuracy}</div>
          <div className="hint">calls graded correct</div>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>Coverage across your life</h2>
          <p className="muted">Red points are gaps: occasions your closet underserves.</p>
          <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
        </div>

        <div className="card">
          <h2>Rebalance</h2>
          <p className="muted">Buy what expands the frontier (positive alpha). Skip redundancy.</p>
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
      </section>

      <section className="card">
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

      <section className="card">
        <h2>Prediction ledger</h2>
        <p className="muted">The duck keeps score in public. Admitting when it's wrong earns the right to interrupt.</p>
        <div className="ledger">
          {p.ledger.predictions.map((pr) => (
            <div className={"lrow " + (pr.correct ? "ok" : pr.graded ? "no" : "pending")} key={pr.id}>
              <span>{pr.item}</span>
              <span className="muted">{pr.call}</span>
              <span>{pr.graded ? (pr.correct ? "✓ right" : "✗ wrong") : "…pending"}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="foot">
        <span className="prints">❋ ❋ ❋</span>
        Puddle · HackMIT 2026 · brain: FastAPI + numpy · surfaces: extension + dashboard
      </footer>
    </div>
  );
}
