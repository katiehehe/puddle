import { useEffect, useState } from "react";
import { getPortfolio } from "./api";
import { FIXTURE, Portfolio } from "./fixtures";

// docs/theme.md — keep the palette in sync with extension/content.js.
const THEME = {
  duck: "#f2b431", duckDeep: "#a97c12", bill: "#ef7a2c",
  water: "#2a7fb8", waterDeep: "#1d5f8a", ripple: "#dceaf4",
  reed: "#0d7a4a", warning: "#b3261e", muted: "#5d6771", line: "#e4e8ec",
};

// The mascot in its idle mood, on ripple rings. Mood faces live in content.js.
function DuckLogo({ size = 88 }: { size?: number }) {
  return (
    <svg className="ducklogo" width={size} height={size} viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="96" rx="38" ry="8" fill="none" stroke={THEME.ripple} strokeWidth="2.5" />
      <ellipse cx="55" cy="94" rx="26" ry="5.5" fill={THEME.ripple} />
      <ellipse cx="55" cy="93" rx="22" ry="4" fill="#bcdcef" />
      <ellipse cx="38" cy="66" rx="17" ry="14" fill="#e3a521" />
      <circle cx="56" cy="60" r="30" fill={THEME.duck} />
      <circle cx="62" cy="44" r="21" fill={THEME.duck} />
      <circle cx="52" cy="53" r="5" fill="#f7c95e" opacity=".55" />
      <circle cx="73" cy="52" r="4.2" fill="#f08a8a" opacity=".5" />
      <circle cx="64" cy="46" r="3.1" fill="#16191c" />
      <path d="M80 47 q14 2 13 7 q-1 5 -13 5 z" fill={THEME.bill} />
    </svg>
  );
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
      <polygon points={poly} fill="rgba(42,127,184,.18)" stroke={THEME.water} strokeWidth={2} />
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
