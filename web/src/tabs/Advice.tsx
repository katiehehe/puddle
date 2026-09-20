import { Portfolio } from "../fixtures";

/** The rebalance panel, said the way a person would say it. Nothing here
 *  mentions alpha, Sharpe or covariance: that belongs on the Numbers tab, and
 *  someone deciding whether to buy a coat should not have to read it. */
export default function Advice({ p }: { p: Portfolio }) {
  const gaps = p.coverage.filter((c) => !c.covered);
  const { buy, skip, donate } = p.rebalance;

  return (
    <>
      <section className="card">
        <h2>Money you did not spend</h2>
        <p className="lede">
          Every time you took the duck's advice and walked away, the price went in the pond.
        </p>
        <div className="pondbig">
          <div className="pondval">${p.pond.saved}</div>
          <div className="pond"><div className="fill" style={{ width: `${Math.min(100, (p.pond.saved / 800) * 100)}%` }} /></div>
          <p className="muted">
            {p.pond.skips === 0
              ? "Nothing yet. Skip something at checkout and it lands here."
              : `Across ${p.pond.skips} ${p.pond.skips === 1 ? "purchase" : "purchases"} you decided against.`}
          </p>
        </div>
      </section>

      {gaps.length > 0 && (
        <section className="card">
          <h2>Where getting dressed is hard</h2>
          <p className="lede">
            You own nothing that really works for {listOf(gaps.map((g) => g.state.toLowerCase()))}.
            This is the only kind of gap worth spending money on.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Worth buying</h2>
        {buy.length === 0 ? (
          <p className="lede">
            Nothing right now. Your closet already handles the occasions you actually dress for,
            so anything else would be a want rather than a need.
          </p>
        ) : (
          <>
            <p className="lede">
              These would each cover something you currently cannot handle.
            </p>
            {buy.map((b) => (
              <div className="advice good" key={b.id}>
                <div className="atitle"><b>{b.title}</b><span className="aprice">${b.price}</span></div>
                <p className="areason">
                  {b.covers_gap
                    ? `You have nothing for ${b.covers_gap.toLowerCase()}, and this would cover it.`
                    : "This does something nothing else in your closet does."}
                </p>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card">
        <h2>Leave it</h2>
        <p className="lede">
          The duck would speak up if you tried to buy any of these, and this is what it would say.
        </p>
        {skip.map((s) => (
          <div className="advice bad" key={s.id}>
            <div className="atitle"><b>{s.title}</b><span className="aprice">${s.price}</span></div>
            <p className="areason">{s.reasons?.[0] ?? "You already own something that does this job."}</p>
          </div>
        ))}
        {!skip.length && <p className="muted">Nothing on the list right now.</p>}
      </section>

      <section className="card">
        <h2>Safe to let go</h2>
        <p className="lede">
          You barely wear these, and giving them away would not leave you stuck for any
          occasion. Anything holding up an occasion on its own is deliberately left off.
        </p>
        {donate.map((d) => (
          <div className="advice" key={d.id}>
            <div className="atitle">
              <b>{d.title}</b>
              <span className="aprice">${d.cost_per_wear} every time you wear it</span>
            </div>
            <p className="areason">
              {d.wears === 0
                ? "You have never worn it."
                : `Worn ${d.wears} ${d.wears === 1 ? "time" : "times"} since you bought it.`}
            </p>
          </div>
        ))}
        {!donate.length && <p className="muted">Nothing you could drop without opening a gap.</p>}
      </section>
    </>
  );
}

function listOf(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return words.slice(0, -1).join(", ") + " or " + words[words.length - 1];
}
