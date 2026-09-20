import { ClosetEntry, ClosetItem } from "../api";
import { Portfolio } from "../fixtures";

/** Plain words for how well something is covered. The dashboard does not put a
 *  number in front of someone who only wanted to know if they own a coat. */
function readiness(best: number, covered: boolean): string {
  if (!covered) return "Nothing really works";
  if (best >= 0.85) return "Sorted";
  if (best >= 0.7) return "You have options";
  return "You could do better";
}

function initials(title: string): string {
  return title.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function Closet({
  items, logged, coverage,
}: { items: ClosetItem[]; logged: ClosetEntry[]; coverage: Portfolio["coverage"] }) {
  const worn = [...items].sort((a, b) => b.wears - a.wears);
  const neglected = worn.filter((i) => i.wears <= 3);
  const totalWears = items.reduce((n, i) => n + i.wears, 0);
  const spend = items.reduce((n, i) => n + i.price, 0);

  return (
    <>
      <section className="card">
        <h2>What you are ready for</h2>
        <p className="lede">
          Every occasion you actually dress for, and whether you own something that works.
          The ones at the bottom are where getting dressed is hard.
        </p>
        <div className="ready">
          {[...coverage].sort((a, b) => b.coverage - a.coverage).map((c) => (
            <div className={"readyrow " + (c.covered ? "yes" : "no")} key={c.state}>
              <span className="readyname">{c.state}</span>
              <span className="readyword">{readiness(c.coverage, c.covered)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Everything you own</h2>
        <p className="lede">
          {items.length} things, {totalWears} wears between them, {formatMoney(spend)} spent in total.
          The ones you reach for most are first.
        </p>
        <div className="closetgrid">
          {worn.map((i) => (
            <article className="citem" key={i.id}>
              <div className="cthumb">{initials(i.title)}</div>
              <div className="cbody">
                <b>{i.title}</b>
                <div className="cmeta">{i.category}</div>
                <div className="cwear">
                  {i.wears === 0
                    ? "You have never worn this"
                    : `Worn ${i.wears} ${i.wears === 1 ? "time" : "times"}`}
                </div>
              </div>
            </article>
          ))}
          {!items.length && <p className="muted">Nothing here yet. The brain may be offline.</p>}
        </div>
      </section>

      {neglected.length > 0 && (
        <section className="card">
          <h2>Sitting there unworn</h2>
          <p className="lede">
            You bought these and have barely touched them. That is worth knowing before you
            buy anything else in the same direction.
          </p>
          <div className="ready">
            {neglected.map((i) => (
              <div className="readyrow no" key={i.id}>
                <span className="readyname">{i.title}</span>
                <span className="readyword">
                  {i.wears === 0 ? "Never worn" : `Worn ${i.wears} times`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {logged.length > 0 && (
        <section className="card">
          <h2>Recently added by you</h2>
          <p className="lede">The last few things you wrote down in the journal.</p>
          <div className="closetgrid">
            {logged.slice(0, 6).map((e) => (
              <article className="citem" key={e.id}>
                {e.image
                  ? <img className="cthumb img" src={e.image} alt="" />
                  : <div className="cthumb">{initials(e.title)}</div>}
                <div className="cbody">
                  <b>{e.title}</b>
                  {e.note && <div className="cnote">{e.note}</div>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function formatMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}
