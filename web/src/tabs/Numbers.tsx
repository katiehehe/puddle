import { useEffect, useState } from "react";
import { CatalogItem, Score, scoreItem } from "../api";
import { Portfolio } from "../fixtures";

/** Everything quantitative lives here and nowhere else. The rest of the site
 *  is for someone deciding what to wear; this tab is for someone who wants to
 *  see whether the advice is grounded in anything. */

const INSIGHT_LABEL: Record<string, string> = {
  return_pattern: "Return pattern",
  time_pattern: "Time of day",
  redundancy: "Redundancy",
  coverage_gap: "Coverage gap",
  overexposure: "Overexposure",
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
  const threshold = coverage.map((_, i) => pt(i, R * 0.55).join(",")).join(" ");
  return (
    <svg width={size + 130} height={size} viewBox={`-65 0 ${size + 130} ${size}`}
         role="img" aria-label="Best available payoff by occasion">
      {rings.map((r, i) => <polygon key={i} points={r} fill="none" stroke="var(--line)" />)}
      <polygon points={threshold} fill="none" stroke="var(--warning)" strokeWidth={1}
               strokeDasharray="3 3" opacity={0.55} />
      {coverage.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--block)" />;
      })}
      <polygon points={poly} fill="rgba(59,130,246,.18)" stroke="var(--water)" strokeWidth={2} />
      {coverage.map((c, i) => {
        const [lx, ly] = pt(i, R + 20);
        const [dx, dy] = pt(i, R * c.coverage);
        const anchor = lx - cx > 8 ? "start" : lx - cx < -8 ? "end" : "middle";
        const lines = c.state.split(" / ");
        return (
          <g key={i}>
            <circle cx={dx} cy={dy} r={3.5} fill={c.covered ? "var(--water)" : "var(--warning)"} />
            <text x={lx} y={ly - (lines.length - 1) * 6} fontSize={11} textAnchor={anchor}
                  fill={c.covered ? "var(--muted)" : "var(--warning-dark)"} fontWeight={c.covered ? 400 : 700}>
              {lines.map((l, k) => <tspan key={k} x={lx} dy={k === 0 ? 0 : 12}>{l}</tspan>)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

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
    catch (e) { setErr(e instanceof Error ? e.message : "The brain did not answer."); setRes(null); }
    finally { setBusy(false); }
  }

  const pf = res?.portfolio;

  return (
    <section className="card">
      <h2>Score an item</h2>
      <p className="lede">
        This runs the same request the browser extension makes at checkout. Move the hour past
        eleven at night and the time of day pattern appears, but notice that it never overturns
        what the item itself is worth.
      </p>

      <div className="controls">
        <select value={id} onChange={(e) => { setId(e.target.value); run(e.target.value, hour); }}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title} at ${i.price}</option>)}
          {!items.length && <option value="">the brain is not running</option>}
        </select>
        <label className="hourlab">
          <span className="muted">hour</span>
          <input type="range" min={0} max={23} value={hour}
                 onChange={(e) => setHour(+e.target.value)}
                 onMouseUp={() => run()} onTouchEnd={() => run()} />
          <b className="hourval">{String(hour).padStart(2, "0")}:40</b>
        </label>
        <button onClick={() => run()} disabled={busy || !id}>{busy ? "Scoring" : "Score it"}</button>
      </div>

      {err && <p className="err">{err}</p>}

      {res && (
        <div className={"verdict " + res.duck_state}>
          <div className="vhead">
            <span className={"face " + res.duck_state}>{res.duck_state}</span>
            <span className={"call " + res.decision}>{res.decision}</span>
            <span className="muted">
              {res.speak ? "would speak" : "would stay quiet"} at {(res.confidence * 100).toFixed(0)} percent confidence
            </span>
          </div>
          <p className="headline">{res.headline}</p>

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
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Numbers({
  p, items, live, onGrade,
}: {
  p: Portfolio; items: CatalogItem[]; live: boolean;
  onGrade: (id: string, correct: boolean) => void;
}) {
  const over = p.overexposure;
  const max = Math.max(...p.coverage.map((c) => c.p), 0.0001);

  return (
    <>
      <section className="card">
        <h2>How the closet is scored</h2>
        <p className="lede">
          Every item is an asset and every occasion is a state of the world. The payoff of an item
          in a state gives a return, the spread of those payoffs across states gives a covariance,
          and the two together give a Sharpe ratio over a loungewear baseline of {p.risk_free}.
          Buying is worth it when an item earns a positive alpha against the closet you already own.
        </p>
        <div className="mathrow big">
          <div><span className="lbl">Style Sharpe</span><b>{p.style_sharpe.toFixed(3)}</b></div>
          <div><span className="lbl">risk free</span><b>{p.risk_free}</b></div>
          <div><span className="lbl">Herfindahl</span><b>{over.hhi}</b></div>
          <div><span className="lbl">largest occasion share</span><b>{(over.top_share * 100).toFixed(0)}%</b></div>
          <div><span className="lbl">items in it</span><b>{over.top_count}</b></div>
        </div>
      </section>

      <LiveScorer items={items} />

      <section className="grid2">
        <div className="card">
          <h2>Coverage by occasion</h2>
          <p className="lede">
            Each spoke is the best payoff any owned item achieves in that state. The dashed ring
            is the threshold below which an occasion counts as uncovered.
          </p>
          <div className="radarwrap"><CoverageRadar coverage={p.coverage} /></div>
        </div>

        <div className="card">
          <h2>Life mix</h2>
          <p className="lede">
            State probabilities, derived from recorded wear events rather than assumed. These are
            the weights every expected payoff on this page is computed against.
          </p>
          <div className="mix">
            {[...p.coverage].sort((a, b) => b.p - a.p).map((c) => (
              <div className="mixrow" key={c.state}>
                <span className="mixname">{c.state}</span>
                <span className="mixbar"><i style={{ width: `${(c.p / max) * 100}%` }} /></span>
                <span className="mixval">{(c.p * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Holdings</h2>
        <p className="lede">
          Weight is the share of wears that mean variance optimisation assigns each item. Payoff is
          its expected usefulness across the life mix above.
        </p>
        <div className="tablewrap">
          <table>
            <thead><tr>
              <th>Item</th><th>Category</th><th className="num">Wears</th>
              <th className="num">Cost per wear</th><th className="num">Payoff</th>
              <th className="num">Weight</th><th>Duplicates</th>
            </tr></thead>
            <tbody>
              {[...p.holdings].sort((a, b) => b.weight - a.weight).map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td><td className="muted">{h.category}</td>
                  <td className="num">{h.wears}</td><td className="num">${h.cost_per_wear}</td>
                  <td className="num">{h.expected_payoff}</td>
                  <td className="num">
                    <span className="wbar" title={String(h.weight)}>
                      <i style={{ width: `${Math.min(100, h.weight * 400)}%` }} />
                    </span>
                  </td>
                  <td>{h.redundant_with.length ? <span className="pill bad">{h.redundant_with.length}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Every call the duck has made</h2>
        <p className="lede">
          Kept in public, including the wrong ones. Grading a call moves the accuracy score, which
          is the only thing that earns the right to interrupt somebody at checkout.
        </p>
        <div className="scoreline">Correct so far: <b>{p.ledger.accuracy}</b></div>
        <div className="ledger">
          {p.ledger.predictions.map((pr) => (
            <div className={"lrow " + (pr.correct ? "ok" : pr.graded ? "no" : "pending")} key={pr.id}>
              <div className="lmain">
                <b>{pr.item}</b>
                {pr.line && <div className="quote">{pr.line}</div>}
              </div>
              <div className="lmeta">
                <span className={"call " + pr.call}>{pr.call}</span>
                {pr.user_action && <span className="muted">you chose {pr.user_action}</span>}
                <span className="muted">{(pr.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="lgrade">
                {pr.graded ? <span>{pr.correct ? "right" : "wrong"}</span>
                  : live ? (
                    <>
                      <button className="tiny" onClick={() => onGrade(pr.id, true)}>right</button>
                      <button className="tiny" onClick={() => onGrade(pr.id, false)}>wrong</button>
                    </>
                  ) : <span className="muted">not graded</span>}
              </div>
            </div>
          ))}
          {!p.ledger.predictions.length && (
            <p className="muted">No calls yet. Check out on the shop and one will appear.</p>
          )}
        </div>
      </section>
    </>
  );
}
