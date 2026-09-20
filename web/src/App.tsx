import { useEffect, useMemo, useState } from "react";
import {
  askDuck,
  getMe,
  getQuote,
  getStatus,
  getStorefront,
  scoreItem,
  CatalogItem,
  ClosetPiece,
  Me,
  Quote,
  Score,
  Status,
} from "./api";
import { AskPuddle } from "./AskPuddle";
import { Garment } from "./Garment";

const money = (n: number) => `$${n.toFixed(2)}`;
const round = (n: number) => `$${Math.round(n).toLocaleString()}`;

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function Duck({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="34" r="20" fill="#ffd166" />
      <circle cx="44" cy="20" r="12" fill="#ffd166" />
      <circle cx="48" cy="17" r="2.2" fill="#23262d" />
      <path d="M56 21 h9 l-3 5 h-6 z" fill="#f1893b" />
    </svg>
  );
}

/* ------------------------------------------------------------------ home */

function CheckoutMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mockbar">
        <span /> <span /> <span />
        <div className="mockurl">westridge.com/boots/suede-chelsea</div>
      </div>
      <div className="mockbody">
        <div className="mockshot">
          <Garment category="shoes" colour="brown" size={150} />
        </div>
        <div className="mockinfo">
          <div className="mockbrand">WESTRIDGE</div>
          <h4>Suede Chelsea boots</h4>
          <div className="mockprice">$128.00</div>
          <div className="mockbtn">Add to cart</div>
        </div>
        <div className="duckcard">
          <div className="duckhead">
            <Duck size={30} />
            <b>Quant Quack</b>
          </div>
          <p>
            You already own <b>3 pairs of black boots</b>. You've worn the closest pair 7 times
            this year.
          </p>
          <p>
            $128 is <b>$18 below</b> what you usually pay for boots. Wear these 20 times and
            they cost <b>$6.40 a wear</b>.
          </p>
          <div className="duckask">Still worth it?</div>
          <div className="duckbtns">
            <span className="db">Skip it</span>
            <span className="db alt">Buy anyway</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const TELLS = [
  ["Do I already own this?", "Counts the near-duplicates hiding in your closet, and how much you actually wear them."],
  ["Is this a good price?", "Compares it to what you've paid for the same kind of thing before."],
  ["What will it cost me per wear?", "$128 you wear twice is expensive. $128 you wear fifty times isn't."],
  ["Will I actually use it?", "Your own history says how often things like this get worn."],
  ["What's it worth later?", "An estimate of what it resells for once you've owned it."],
  ["What have I saved?", "Every skip goes in the pond, so not buying feels like something."],
];

function Home() {
  return (
    <div className="home">
      <nav className="nav">
        <a className="brand" href="#/">
          <Duck size={28} />
          <span>Quant Quack</span>
        </a>
        <div className="navlinks">
          <a href="#how">How it works</a>
          <a href="/demo">Live demo</a>
          <a href="#/closet">My closet</a>
          <a className="cta small" href="#install">
            Add to Chrome
          </a>
        </div>
      </nav>

      <header className="hero">
        <div>
          <div className="pill">Chrome extension</div>
          <h1>Know if it's worth it before you buy it.</h1>
          <p>
            Quant Quack remembers what you own, checks the numbers, and talks the purchase
            through with you at checkout.
          </p>
          <div className="herobtns">
            <a className="cta" href="#install">
              Add to Chrome — free
            </a>
            <a className="ghost" href="/demo">
              Try the live demo
            </a>
          </div>
          <div className="herofoot">Works on any shop. Your closet stays yours.</div>
        </div>
        <CheckoutMock />
      </header>

      <section className="steps" id="how">
        <h2>Three things, then it's out of your way</h2>
        <div className="stepgrid">
          <div className="step">
            <span>1</span>
            <h3>It learns your closet</h3>
            <p>What you own, what you paid, and what you actually reach for.</p>
          </div>
          <div className="step">
            <span>2</span>
            <h3>It watches the page, not you</h3>
            <p>When you're about to buy, it reads the item off the shop and does the maths.</p>
          </div>
          <div className="step">
            <span>3</span>
            <h3>It says something useful</h3>
            <p>A sentence you can argue with — not a block, not a lecture. You still decide.</p>
          </div>
        </div>
      </section>

      <section className="tells">
        <h2>What it tells you</h2>
        <div className="tellgrid">
          {TELLS.map(([q, a]) => (
            <div className="tell" key={q}>
              <h3>{q}</h3>
              <p>{a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="install" id="install">
        <div>
          <h2>Add it to Chrome</h2>
          <p>
            The extension isn't in the Web Store yet. Grab the folder, open{" "}
            <code>chrome://extensions</code>, turn on Developer mode, and choose{" "}
            <b>Load unpacked</b>.
          </p>
          <div className="herobtns">
            <a className="cta" href="https://github.com/katiehehe/puddle">
              Get the extension
            </a>
            <a className="ghost" href="#/closet">
              See my closet
            </a>
          </div>
        </div>
      </section>

      <footer className="foot">
        <Duck size={22} />
        <span>Quant Quack — built at HackMIT.</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------- dashboard */

const TABS = ["Closet", "Purchases", "Your shopping", "Value", "Worth it?"] as const;
type Tab = (typeof TABS)[number];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {note && <em>{note}</em>}
    </div>
  );
}

function PieceCard({ piece }: { piece: ClosetPiece }) {
  return (
    <article className="piece">
      <div className="piecepic">
        <Garment category={piece.category} colour={piece.color} />
        {piece.duplicates.length > 0 && <span className="dupe">+{piece.duplicates.length} similar</span>}
      </div>
      <h4>{piece.title}</h4>
      <div className="piecemeta">
        {piece.wears} wear{piece.wears === 1 ? "" : "s"}
        {piece.size ? ` · size ${piece.size}` : ""}
      </div>
      <div className="piecenums">
        <div>
          <span>per wear</span>
          <b>{piece.cost_per_wear === null ? "never worn" : money(piece.cost_per_wear)}</b>
        </div>
        <div>
          <span>worth now</span>
          <b>{round(piece.worth_now)}</b>
        </div>
      </div>
    </article>
  );
}

function ClosetTab({ me }: { me: Me }) {
  const [filter, setFilter] = useState("all");
  const cats = me.shopping.categories;
  const shown = me.closet.filter((p) => filter === "all" || p.category === filter);
  const unworn = me.closet.filter((p) => p.wears === 0).length;
  return (
    <>
      <div className="chips">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
          Everything {me.closet.length}
        </button>
        {cats.map((c) => (
          <button
            key={c.category}
            className={filter === c.category ? "on" : ""}
            onClick={() => setFilter(c.category)}
          >
            {c.label} {c.count}
          </button>
        ))}
      </div>
      {unworn > 0 && (
        <p className="hint">
          {unworn} thing{unworn === 1 ? "" : "s"} in here you've never worn.
        </p>
      )}
      <div className="grid">
        {shown.map((p) => (
          <PieceCard key={p.id} piece={p} />
        ))}
      </div>
    </>
  );
}

function PurchasesTab({ me }: { me: Me }) {
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="buys">
      {me.purchases.map((p) => {
        // A returned purchase has nothing left to value, and the closet only
        // tracks wears for things still in it.
        const kept = !p.returned && p.in_closet;
        return (
          <div className={`buy${p.returned ? " returned" : ""}`} key={p.id}>
            <div className="buypic">
              <Garment category={p.category} colour="grey" size={54} />
            </div>
            <div className="buymain">
              <h4>{p.title}</h4>
              <span>
                {when(p.bought_at)}
                {p.returned
                  ? ` · sent back${p.return_reason ? `, ${p.return_reason.replace(/_/g, " ")}` : ""}`
                  : p.in_closet
                    ? ""
                    : " · not in your closet"}
              </span>
            </div>
            <div className="buycol">
              <span>paid</span>
              <b>{round(p.price)}</b>
            </div>
            <div className="buycol">
              <span>worn</span>
              <b>{kept ? `${p.wears}×` : "—"}</b>
            </div>
            <div className="buycol">
              <span>per wear</span>
              <b>{kept && p.cost_per_wear !== null ? money(p.cost_per_wear) : "—"}</b>
            </div>
            <div className="buycol">
              <span>worth now</span>
              <b>{kept && p.worth_now !== null ? round(p.worth_now) : p.returned ? "refunded" : "—"}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShoppingTab({ me }: { me: Me }) {
  const s = me.shopping;
  return (
    <>
      <div className="notes">
        {s.lines.map((line) => (
          <div className="note" key={line}>
            <Duck size={26} />
            <p>{line}</p>
          </div>
        ))}
      </div>
      <h3 className="sub2">What your closet is made of</h3>
      <div className="bars">
        {s.categories.map((c) => (
          <div className="bar" key={c.category}>
            <span>{c.label}</span>
            <div>
              <i style={{ width: `${(100 * c.count) / s.items_owned}%` }} />
            </div>
            <b>{c.count}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function ValueTab({ me }: { me: Me }) {
  const worn = me.closet.filter((p) => p.cost_per_wear !== null);
  const best = [...worn].sort((a, b) => (a.cost_per_wear ?? 0) - (b.cost_per_wear ?? 0)).slice(0, 5);
  const worst = [...me.closet]
    .sort((a, b) => (b.cost_per_wear ?? 1e9) - (a.cost_per_wear ?? 1e9))
    .slice(0, 5);
  const v = me.value;
  return (
    <>
      <div className="valuetop">
        <Stat label="You've spent" value={round(v.spent)} note="on everything you still own" />
        <Stat label="It's worth about" value={round(v.worth_now)} note="if you resold it today" />
        <Stat label="Value kept" value={`${Math.round(v.value_retained * 100)}%`} />
        <Stat label="Saved by skipping" value={round(v.saved)} note="sitting in your pond" />
      </div>
      <p className="hint">Resale figures are estimates, based on category and how worn a thing is.</p>
      <div className="two">
        <div>
          <h3 className="sub2">Money best spent</h3>
          {best.map((p) => (
            <div className="line" key={p.id}>
              <span>{p.title}</span>
              <b>{money(p.cost_per_wear ?? 0)} a wear</b>
            </div>
          ))}
        </div>
        <div>
          <h3 className="sub2">Money doing nothing</h3>
          {worst.map((p) => (
            <div className="line" key={p.id}>
              <span>{p.title}</span>
              <b>{p.cost_per_wear === null ? `${round(p.paid)}, never worn` : `${money(p.cost_per_wear)} a wear`}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------- worth it tab */

function WorthIt({ items }: { items: CatalogItem[] }) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [hour, setHour] = useState(23);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [wears, setWears] = useState(20);
  const [details, setDetails] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    Promise.all([getQuote(itemId, hour), scoreItem(itemId, hour)])
      .then(([q, s]) => {
        if (!live) return;
        setQuote(q);
        setScore(s);
        setWears(Math.max(5, Math.round(q.expected_wears)));
        setAnswer("");
      })
      .catch(() => live && setQuote(null));
    return () => {
      live = false;
    };
  }, [itemId, hour]);

  if (!quote || !score) return <p className="hint">Asking the duck…</p>;

  const ask = quote.ask;
  const shopping = score.shopping;
  const perWear = ask / Math.max(wears, 1);
  const good = perWear <= quote.your_cost_per_wear;

  return (
    <div className="worth">
      <div className="pickrow">
        <label>
          Thinking about
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title} — {round(i.price)}
              </option>
            ))}
          </select>
        </label>
        <label>
          at
          <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} />
          <b>{String(hour).padStart(2, "0")}:40</b>
        </label>
      </div>

      <div className="verdictcard">
        <div className="duckhead">
          <Duck size={34} />
          <b>Quant Quack</b>
        </div>
        <p className="say">{score.headline}</p>
        {shopping && shopping.owned_count > 0 && shopping.closest && (
          <p>
            You already own {shopping.owned_count} of these. You've worn the closest one{" "}
            {shopping.closest.wears} times.
          </p>
        )}
        {shopping && shopping.typical_price !== null && shopping.difference !== null && (
          <p>
            {round(ask)} is{" "}
            <b>
              {shopping.difference === 0
                ? "exactly"
                : `${money(Math.abs(shopping.difference))} ${shopping.difference > 0 ? "below" : "above"}`}
            </b>{" "}
            {shopping.verdict === "no read" ? "unusual for you" : `what you usually pay (${shopping.basis})`}.
          </p>
        )}

        <div className="wearslider">
          <label>
            If you wear it <b>{wears}</b> times
            <input type="range" min={1} max={60} value={wears} onChange={(e) => setWears(+e.target.value)} />
          </label>
          <div className={`perwear${good ? " good" : " bad"}`}>
            {money(perWear)} a wear
            <em>
              {good
                ? `cheaper than the ${money(quote.your_cost_per_wear)} a wear you normally get`
                : `your closet averages ${money(quote.your_cost_per_wear)} a wear`}
            </em>
          </div>
        </div>
        <p className="honest">
          Going on your history, you'd realistically wear it about{" "}
          <b>{quote.expected_wears}</b> times — that's {money(ask / Math.max(quote.expected_wears, 0.1))} a
          wear. You've sent back {Math.round(quote.return_prob * 100)}% of things like this ({quote.return_evidence}).
        </p>

        <div className="askrow">
          <input
            placeholder="Ask about it — “will I actually wear these?”"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !question.trim()) return;
              setAsking(true);
              askDuck(itemId, question, hour)
                .then(setAnswer)
                .finally(() => setAsking(false));
            }}
          />
          <button
            disabled={!question.trim() || asking}
            onClick={() => {
              setAsking(true);
              askDuck(itemId, question, hour)
                .then(setAnswer)
                .finally(() => setAsking(false));
            }}
          >
            Ask
          </button>
        </div>
        {answer && <p className="answer">{answer}</p>}

        <button className="detailtoggle" onClick={() => setDetails(!details)}>
          {details ? "Hide the numbers" : "Show the numbers"}
        </button>
        {details && (
          <div className="details">
            <div>
              <span>Expected value of buying</span>
              <b>{quote.ev >= 0 ? `+${money(quote.ev)}` : `-${money(-quote.ev)}`}</b>
              <em>what it's worth on average once returns are priced in</em>
            </div>
            <div>
              <span>Most it's worth paying</span>
              <b>{quote.no_price ? "nothing" : round(quote.fair_bid)}</b>
              <em>above this you're paying for wears you won't get</em>
            </div>
            <div>
              <span>Resale estimate</span>
              <b>{shopping ? round(shopping.resale) : "—"}</b>
              <em>roughly what it'd fetch secondhand, unworn</em>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- shell */

function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<Tab>("Closet");
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    getMe().then(setMe).catch(() => setFailed(true));
    getStorefront().then(setItems);
    getStatus().then(setStatus);
  }, []);

  const summary = useMemo(() => {
    if (!me) return null;
    return [
      { label: "Things you own", value: String(me.shopping.items_owned) },
      { label: "Spent on them", value: round(me.value.spent) },
      { label: "Worth today", value: round(me.value.worth_now) },
      { label: "Saved by skipping", value: round(me.value.saved) },
    ];
  }, [me]);

  if (failed) {
    return (
      <div className="shell">
        <p className="hint">
          Can't reach your account right now. Start the brain with <code>./run.sh</code> and refresh.
        </p>
      </div>
    );
  }
  if (!me || !summary) return <div className="shell"><p className="hint">Loading your closet…</p></div>;

  return (
    <div className="shell">
      <nav className="nav">
        <a className="brand" href="#/home">
          <Duck size={28} />
          <span>Quant Quack</span>
        </a>
        <div className="navlinks">
          <a href="/demo">Live demo</a>
          {status && <span className="live">{status.voice.configured ? "voice on" : "voice off"}</span>}
          <a className="cta small" href="#/home">
            Add to Chrome
          </a>
        </div>
      </nav>

      <header className="dashhead">
        <h1>Your closet</h1>
        <p>What you own, what you've been buying, and whether you're getting your money's worth.</p>
        <div className="statrow">
          {summary.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </header>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <main className="tabbody">
        {tab === "Closet" && <ClosetTab me={me} />}
        {tab === "Purchases" && <PurchasesTab me={me} />}
        {tab === "Your shopping" && <ShoppingTab me={me} />}
        {tab === "Value" && <ValueTab me={me} />}
        {tab === "Worth it?" && (items.length ? <WorthIt items={items} /> : <p className="hint">No shop connected.</p>)}
      </main>

      <footer className="foot">
        <Duck size={22} />
        <span>Quant Quack — built at HackMIT.</span>
      </footer>

      <button className="askfab" onClick={() => setAsking(!asking)} aria-expanded={asking}>
        <Duck size={24} />
        Ask Puddle
      </button>
      <AskPuddle open={asking} onClose={() => setAsking(false)} />
    </div>
  );
}

export default function App() {
  const hash = useHash();
  // The brain serves the same bundle at / and at /dashboard/, so the path
  // decides which side you land on and the hash lets you cross over.
  const onDashboardPath = window.location.pathname.startsWith("/dashboard");
  const closet = hash.startsWith("#/closet") || (onDashboardPath && !hash.startsWith("#/home"));
  return closet ? <Dashboard /> : <Home />;
}
