import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPurchase,
  askDuck,
  editPurchase,
  getMe,
  getQuote,
  getStorefront,
  buyStaged,
  getCart,
  guessItem,
  logWears,
  scoreItem,
  stageItem,
  unstageItem,
  CatalogItem,
  StagedItem,
  ClosetPiece,
  Coverage,
  Me,
  PurchaseRow,
  Quote,
  Score,
  Usage,
} from "./api";
import { AskPuddle } from "./AskPuddle";
import { Garment, kindGuess } from "./Garment";

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
  const [url, setUrl] = useState("northwick.com/shoes/chelsea-boots");
  useEffect(() => {
    // The embedded shop reports which item it's showing so the URL bar follows.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "puddle-demo-item") setUrl(event.data.path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <div className="mock">
      <div className="mockbar">
        <span /> <span /> <span />
        <div className="mockurl">{url}</div>
      </div>
      <iframe className="demoframe" src="/demo?embed=1" title="Puddle live demo" />
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
  const hash = useHash();
  useEffect(() => {
    if (hash.includes("install")) {
      const t = setTimeout(() => document.getElementById("install")?.scrollIntoView(), 60);
      return () => clearTimeout(t);
    }
    // Landing on plain #/home always starts at the top of the page.
    window.scrollTo(0, 0);
  }, [hash]);
  return (
    <div className="home">
      <nav className="nav">
        <a className="brand" href="#/home" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <Duck size={54} />
          <span>Puddle</span>
        </a>
        <div className="navlinks">
          <a href="#/closet">My closet</a>
          <a className="cta small" href="#/home?install">
            Add to Chrome
          </a>
        </div>
      </nav>

      <header className="hero">
        <div>
          <div className="pill">Chrome extension</div>
          <h1>Know if it's worth it before you buy it.</h1>
          <p>
            Puddle remembers what you own, notices what you actually wear, and talks the
            purchase through with you at checkout.
          </p>
          <div className="herobtns">
            <a className="cta" href="#install">
              Add to Chrome, free
            </a>
          </div>
        </div>
        <CheckoutMock />
      </header>

      <section className="steps" id="how">
        <h2>It gets better the more you wear</h2>
        <div className="stepgrid">
          <div className="step">
            <span>1</span>
            <h3>Add what you buy</h3>
            <p>Name, price, date. Puddle works out the rest and puts it in your closet.</p>
          </div>
          <div className="step">
            <span>2</span>
            <h3>Tap what you wear</h3>
            <p>One tap per thing. That's what turns a closet into an opinion worth having.</p>
          </div>
          <div className="step">
            <span>3</span>
            <h3>Get a straight answer</h3>
            <p>At checkout it tells you whether something is worth it, and why. You still decide.</p>
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
        <span>Puddle, built at HackMIT.</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------- dashboard */

const TABS = ["Closet", "Purchases", "How you dress", "Value", "Cart"] as const;
type Tab = (typeof TABS)[number];

const today = () => new Date().toISOString().slice(0, 10);
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const REVEAL_MS = 200;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  const chars = [...value];
  const [shown, setShown] = useState(chars.length);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => setShown(value.length), [value]);

  const play = () => {
    stop();
    setShown(1);
    timer.current = window.setInterval(() => {
      setShown((n) => {
        if (n + 1 >= chars.length) stop();
        return Math.min(n + 1, chars.length);
      });
    }, REVEAL_MS);
  };

  const reset = () => {
    stop();
    setShown(chars.length);
  };

  return (
    <div className="stat" onMouseEnter={play} onMouseLeave={reset}>
      <span>{label}</span>
      <b>
        {chars.map((c, i) => (
          <span key={i} className={i < shown ? "on" : undefined}>
            {c}
          </span>
        ))}
      </b>
      {note && <em>{note}</em>}
    </div>
  );
}

function PieceCard({ piece, onWear }: { piece: ClosetPiece; onWear: (id: string) => void }) {
  // Optimistic: a wear tap has to feel free, or nobody logs the fifth one.
  const [extra, setExtra] = useState(0);
  const wears = piece.wears + extra;
  const perWear = wears > 0 ? piece.paid / wears : null;
  return (
    <article className="piece">
      <div className="piecepic">
        <Garment category={piece.category} colour={piece.color} kind={piece.kind} />
        {piece.duplicates.length > 0 && <span className="dupe">+{piece.duplicates.length} similar</span>}
      </div>
      <h4>{piece.title}</h4>
      <div className="piecemeta">
        {wears} wear{wears === 1 ? "" : "s"}
        {piece.size ? ` · size ${piece.size}` : ""}
      </div>
      {piece.tags.length > 0 && (
        <div className="tags">
          {piece.tags.slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      <div className="piecenums">
        <div>
          <span>per wear</span>
          <b>{perWear === null ? "never worn" : money(perWear)}</b>
        </div>
        <div>
          <span>worth now</span>
          <b>{round(piece.worth_now)}</b>
        </div>
      </div>
      <button
        className="worebtn"
        onClick={() => {
          setExtra((n) => n + 1);
          onWear(piece.id);
        }}
      >
        + Wore today
      </button>
    </article>
  );
}

/* ------------------------------------------------------ closet coverage */

function CoveragePanel({ coverage }: { coverage: Coverage }) {
  return (
    <section className="cover">
      <h3 className="sub2">What your closet covers</h3>
      <p className="coverhead">{coverage.headline}</p>
      <div className="coverrows">
        {coverage.occasions.map((o) => (
          <div className="coverrow" key={o.state}>
            <span>{o.label}</span>
            <div>
              <i className={o.strength} style={{ width: `${Math.round(Math.min(o.score, 1) * 100)}%` }} />
            </div>
            <b>
              {o.options === 0
                ? "nothing"
                : `${o.options} option${o.options === 1 ? "" : "s"}`}
            </b>
          </div>
        ))}
      </div>
      <div className="coversplit">
        <div>
          <h4>You're well covered</h4>
          <p>{coverage.well_covered.join(" · ") || "Nothing stands out yet."}</p>
        </div>
        <div>
          <h4>Could use more options</h4>
          <p>{coverage.gaps.join(" · ") || "No real gaps right now."}</p>
        </div>
      </div>
      {coverage.advice && (
        <div className="note">
          <Duck size={26} />
          <p>{coverage.advice}</p>
        </div>
      )}
    </section>
  );
}

function ClosetTab({ me, onWear }: { me: Me; onWear: (id: string) => void }) {
  const [filter, setFilter] = useState("all");
  const cats = me.shopping.categories;
  const shown = me.closet.filter((p) => filter === "all" || p.category === filter);
  const unworn = me.closet.filter((p) => p.wears === 0).length;
  return (
    <>
      <CoveragePanel coverage={me.coverage} />
      <h3 className="sub2">Everything you own</h3>
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
          <PieceCard key={p.id} piece={p} onWear={onWear} />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ purchases */

const BLANK = {
  title: "",
  price: "",
  bought_at: today(),
  brand: "",
  category: "",
  size: "",
  color: "",
  source_url: "",
  photo: "",
  notes: "",
  resale_estimate: "",
  wears: "",
};

/** Adding a purchase: three fields that matter, the rest folded away.
 *  Everything Puddle can work out from the name and the shop, it works out. */
function AddPurchase({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({ ...BLANK });
  const [more, setMore] = useState(false);
  const [toCloset, setToCloset] = useState(true);
  const [guess, setGuess] = useState<string>("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof BLANK, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const look = () => {
    guessItem(form.title, form.source_url).then((g) => {
      if (!g) return setGuess("");
      if (!g.recognised) return setGuess("Not sure what that is yet. Pick a category below.");
      const brand = g.brand && !form.brand ? ` · ${g.brand}` : "";
      if (g.brand && !form.brand) set("brand", g.brand);
      setGuess(`Looks like a ${(g.kind ?? g.category ?? "").replace(/_/g, " ")}${brand}.`);
    });
  };

  const save = () => {
    setSaving(true);
    setError("");
    addPurchase({
      title: form.title.trim(),
      price: Number(form.price) || 0,
      bought_at: form.bought_at || undefined,
      brand: form.brand || undefined,
      category: form.category || undefined,
      size: form.size || undefined,
      color: form.color || undefined,
      source_url: form.source_url || undefined,
      photo: form.photo || undefined,
      notes: form.notes || undefined,
      resale_estimate: form.resale_estimate ? Number(form.resale_estimate) : undefined,
      wears: form.wears ? Number(form.wears) : undefined,
      add_to_closet: toCloset,
    })
      .then(() => {
        setForm({ ...BLANK });
        setGuess("");
        setMore(false);
        onAdded();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  return (
    <section className="addcard">
      <h3>Add a purchase</h3>
      <div className="addmain">
        <label className="wide">
          What did you buy?
          <input
            placeholder="Charcoal crewneck"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            onBlur={look}
          />
        </label>
        <label>
          Price paid
          <input
            inputMode="decimal"
            placeholder="58"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
          />
        </label>
        <label>
          Bought on
          <input type="date" value={form.bought_at} onChange={(e) => set("bought_at", e.target.value)} />
        </label>
      </div>
      {guess && <p className="guess">{guess}</p>}

      <button className="morebtn" onClick={() => setMore(!more)}>
        {more ? "Fewer details" : "Add more details"}
      </button>

      {more && (
        <div className="addmore">
          <label>
            Brand
            <input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Uniqlo" />
          </label>
          <label>
            Category
            <input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="sweater"
            />
          </label>
          <label>
            Size
            <input value={form.size} onChange={(e) => set("size", e.target.value)} placeholder="M" />
          </label>
          <label>
            Colour
            <input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="charcoal" />
          </label>
          <label className="wide">
            Where you bought it
            <input
              value={form.source_url}
              onChange={(e) => set("source_url", e.target.value)}
              onBlur={look}
              placeholder="https://uniqlo.com/…"
            />
          </label>
          <label>
            Worth now (if you know)
            <input
              inputMode="decimal"
              value={form.resale_estimate}
              onChange={(e) => set("resale_estimate", e.target.value)}
            />
          </label>
          <label>
            Times worn already
            <input inputMode="numeric" value={form.wears} onChange={(e) => set("wears", e.target.value)} />
          </label>
          <label className="wide">
            Photo link
            <input value={form.photo} onChange={(e) => set("photo", e.target.value)} placeholder="https://…" />
          </label>
          <label className="wide">
            Notes
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </div>
      )}

      <div className="addfoot">
        <label className="check">
          <input type="checkbox" checked={toCloset} onChange={(e) => setToCloset(e.target.checked)} />
          Put it in my closet
        </label>
        <button className="cta small" disabled={!form.title.trim() || saving} onClick={save}>
          {saving ? "Saving…" : "Add purchase"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function PurchaseCard({ p, onChange }: { p: PurchaseRow; onChange: () => void }) {
  const [wears, setWears] = useState(p.wears ?? 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(p.wears ?? 0));
  const kept = p.in_closet && !p.archived;
  const perWear = wears > 0 ? p.price / wears : null;

  const bump = () => {
    setWears(wears + 1);
    logWears([p.id]).then(onChange);
  };
  const commit = () => {
    const n = Math.max(0, Math.round(Number(draft) || 0));
    setEditing(false);
    setWears(n);
    editPurchase(p.id, { wears: n }).then(onChange);
  };
  const archive = (reason: string) => editPurchase(p.id, { archived: true, archive_reason: reason }).then(onChange);

  return (
    <article className={`buycard${kept ? "" : " gone"}`}>
      <div className="buypic">
        <Garment category={p.category} colour={p.color || "grey"} kind={kindGuess(p.title)} size={64} />
      </div>
      <div className="buybody">
        <h4>{p.title}</h4>
        <div className="buyline">
          {round(p.price)}
          {p.brand ? ` · ${p.brand}` : ""}
          {p.category ? ` · ${p.category.replace(/_/g, " ")}` : ""}
        </div>
        {(p.size || p.color) && (
          <div className="buysub">{[p.size && `Size ${p.size}`, p.color].filter(Boolean).join(" · ")}</div>
        )}
        <div className="buysub">Purchased {when(p.bought_at)}</div>
        <div className="buystats">
          {editing ? (
            <input
              className="wearedit"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
            />
          ) : (
            <button
              className="linkish"
              disabled={!p.yours}
              onClick={() => {
                setDraft(String(wears));
                setEditing(true);
              }}
            >
              Worn {wears} time{wears === 1 ? "" : "s"}
            </button>
          )}
          <span>{perWear === null ? "not worn yet" : `${money(perWear)} per wear`}</span>
          {p.worth_now !== null && kept && <span>worth about {round(p.worth_now)}</span>}
          {!kept && <span className="gonetag">{p.archive_reason?.replace(/_/g, " ") ?? "not in your closet"}</span>}
        </div>
        {p.notes && <p className="buynotes">{p.notes}</p>}
      </div>
      {p.yours && (
        <div className="buyacts">
          {kept && (
            <>
              <button className="cta small" onClick={bump}>
                + Wore today
              </button>
              <select defaultValue="" onChange={(e) => e.target.value && archive(e.target.value)}>
                <option value="">No longer own it…</option>
                <option value="returned">Returned it</option>
                <option value="sold">Sold it</option>
                <option value="donated">Donated it</option>
                <option value="discarded">Threw it out</option>
              </select>
            </>
          )}
          {!kept && (
            <button
              className="ghost small"
              onClick={() =>
                editPurchase(p.id, { archived: false, in_closet: true, archive_reason: "" }).then(onChange)
              }
            >
              Back in my closet
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function PurchasesTab({ me, onChange }: { me: Me; onChange: () => void }) {
  const [showGone, setShowGone] = useState(false);
  const kept = me.purchases.filter((p) => p.in_closet && !p.archived);
  const gone = me.purchases.filter((p) => !p.in_closet || p.archived);
  return (
    <>
      <AddPurchase onAdded={onChange} />
      <h3 className="sub2">What you've bought</h3>
      <div className="buys">
        {kept.map((p) => (
          <PurchaseCard key={p.id} p={p} onChange={onChange} />
        ))}
      </div>
      {gone.length > 0 && (
        <>
          <button className="morebtn" onClick={() => setShowGone(!showGone)}>
            {showGone ? "Hide" : "Show"} {gone.length} thing{gone.length === 1 ? "" : "s"} you no longer own
          </button>
          {showGone && (
            <div className="buys">
              {gone.map((p) => (
                <PurchaseCard key={p.id} p={p} onChange={onChange} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------- how you dress */

function DressTab({ me, usage }: { me: Me; usage: Usage }) {
  const s = me.shopping;
  const top = usage.rows[0]?.wears || 1;
  return (
    <>
      <h3 className="sub2">How you actually dress</h3>
      {usage.lines.map((line) => (
        <div className="note" key={line}>
          <Duck size={26} />
          <p>{line}</p>
        </div>
      ))}
      <div className="bars dressbars">
        {usage.rows.map((r) => (
          <div className="bar" key={r.state}>
            <span>{r.label}</span>
            <div>
              <i style={{ width: `${Math.round((100 * r.wears) / top)}%` }} />
            </div>
            <b>{usage.enough_data ? `${Math.round(r.share * 100)}%` : `${r.wears}`}</b>
          </div>
        ))}
      </div>
      <p className="hint">
        {usage.enough_data
          ? `Based on ${usage.total_wears} recorded wears.`
          : "These are counts rather than percentages, because there isn't enough recorded wear to put a number on it yet."}
      </p>
      <h3 className="sub2">What Puddle has noticed about your shopping</h3>
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

  if (!quote || !score) return <p className="hint">Asking Puddle…</p>;

  const ask = quote.ask;
  const advice = score.advice;
  const perWear = ask / Math.max(wears, 1);
  const good = perWear <= quote.your_cost_per_wear;
  const ladder = Object.keys(advice.per_wear)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="worth">
      <div className="pickrow">
        <label>
          Thinking about
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}, {round(i.price)}
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
          <b>Worth it?</b>
        </div>
        <p className={`say ${advice.stance}`}>{advice.verdict}</p>
        <p className="subhead">{advice.subhead}</p>

        <ul className="reasons">
          {advice.reasons.map((r) => (
            <li className={r.tone} key={r.kind + r.text}>
              {r.text}
            </li>
          ))}
        </ul>

        <div className="ladder">
          {ladder.map((n) => (
            <button key={n} className={wears === n ? "on" : ""} onClick={() => setWears(n)}>
              <span>{n} wears</span>
              <b>{money(advice.per_wear[String(n)])}</b>
            </button>
          ))}
        </div>

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
          Going on how you wear things, about <b>{Math.round(advice.expected_wears)}</b> wears is realistic.
          {advice.resale ? ` Similar things resell for around ${round(advice.resale)}.` : ""} It's advice from
          your own history, not a guarantee.
        </p>

        <div className="quickasks">
          {advice.questions.map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuestion(q);
                setAsking(true);
                askDuck(itemId, q, hour)
                  .then(setAnswer)
                  .finally(() => setAsking(false));
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="askrow">
          <input
            placeholder="Ask about it, for example “will I actually wear these?”"
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
          {details ? "Hide the numbers" : "View numbers"}
        </button>
        {details && (
          <>
            <p className="quackhead">Quant Quack, the working behind the advice</p>
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
                <b>{advice.numbers.resale === null ? "not known" : round(advice.numbers.resale)}</b>
                <em>roughly what it'd fetch secondhand, unworn</em>
              </div>
              <div>
                <span>Similar things you own</span>
                <b>{advice.numbers.similar_owned}</b>
                <em>averaging {advice.numbers.similar_wears} wears each</em>
              </div>
              <div>
                <span>You send back</span>
                <b>{Math.round(advice.numbers.return_prob * 100)}%</b>
                <em>of things like this ({quote.return_evidence})</em>
              </div>
              <div>
                <span>What it adds to your closet</span>
                <b>{advice.numbers.alpha >= 0 ? `+${advice.numbers.alpha.toFixed(2)}` : advice.numbers.alpha.toFixed(2)}</b>
                <em>above zero means it covers days nothing else does</em>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- the staging rail: considered, not owned */

function StageForm({ onStaged }: { onStaged: () => void }) {
  const [form, setForm] = useState({ title: "", price: "", source_url: "" });
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const look = () => {
    guessItem(form.title, form.source_url).then((g) => {
      if (!g) return setGuess("");
      if (!g.recognised) return setGuess("Not sure what that is yet. Plainer words help, like \"grey wool sweater\".");
      setGuess(`Looks like a ${(g.kind ?? g.category ?? "").replace(/_/g, " ")}${g.brand ? ` from ${g.brand}` : ""}.`);
    });
  };

  const save = () => {
    setSaving(true);
    setError("");
    stageItem({
      title: form.title.trim(),
      price: Number(form.price) || 0,
      source_url: form.source_url.trim() || undefined,
    })
      .then(() => {
        setForm({ title: "", price: "", source_url: "" });
        setGuess("");
        onStaged();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  return (
    <section className="addcard">
      <h3>Park something you're thinking about</h3>
      <div className="addmain">
        <label className="wide">
          What is it?
          <input
            placeholder="Suede chelsea boots"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onBlur={look}
          />
        </label>
        <label>
          Price
          <input
            inputMode="decimal"
            placeholder="128"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
        </label>
        <label className="wide">
          Link
          <input
            placeholder="https://…"
            value={form.source_url}
            onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
            onBlur={look}
          />
        </label>
      </div>
      {guess && <p className="guess">{guess}</p>}
      <div className="addfoot">
        <span />
        <button className="cta small" disabled={!form.title.trim() || saving} onClick={save}>
          {saving ? "Parking…" : "Park it on the rail"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function StagedCard({ item, onChange }: { item: StagedItem; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const review = item.review;
  const act = (fn: () => Promise<unknown>) => () => {
    setBusy(true);
    fn().then(onChange).finally(() => setBusy(false));
  };
  return (
    <article className="piece">
      <div className="piecepic">
        <Garment category={item.category} colour={item.color || "grey"} kind={item.kind} />
        <span className={`railverdict ${review.stance}`}>{review.verdict}</span>
      </div>
      <h4>{item.title}</h4>
      <div className="piecemeta">
        {round(item.price)}
        {item.brand ? ` · ${item.brand}` : ""}
      </div>
      {review.reasons.map((r) => (
        <p className="railreason" key={r}>{r}</p>
      ))}
      <div className="railbtns">
        <button className="cta small" disabled={busy} onClick={act(() => buyStaged(item.id))}>
          Bought it
        </button>
        <button className="ghostbtn" disabled={busy} onClick={act(() => unstageItem(item.id))}>
          Take it off
        </button>
      </div>
    </article>
  );
}

function CartTab({ items, onChange }: { items: CatalogItem[]; onChange: () => void }) {
  const [cart, setCart] = useState<StagedItem[] | null>(null);
  const reload = useCallback(() => {
    getCart().then((c) => setCart(c.items)).catch(() => setCart([]));
  }, []);
  useEffect(reload, [reload]);

  const changed = () => {
    reload();
    onChange();
  };

  return (
    <>
      <h2>Thinking it over</h2>
      <p className="hint">The rail: things you're considering. Puddle reviews every one.</p>
      <StageForm onStaged={reload} />
      {cart && cart.length > 0 && (
        <div className="grid">
          {cart.map((i) => (
            <StagedCard key={i.id} item={i} onChange={changed} />
          ))}
        </div>
      )}
      {cart && cart.length === 0 && (
        <p className="hint">Nothing parked. Something catch your eye? Add it above and see what the duck says.</p>
      )}
      {items.length > 0 && (
        <>
          <h2 className="railgap">Or check something from the shop</h2>
          <WorthIt items={items} />
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------- shell */

function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [tab, setTab] = useState<Tab>("Closet");
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);

  const reload = useCallback(() => {
    getMe().then(setMe).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    reload();
    getStorefront().then(setItems);
  }, [reload]);

  // A wear is fire-and-forget on screen; the refresh only catches the
  // knock-on numbers up.
  const wear = useCallback(
    (id: string) => {
      logWears([id]).then(reload).catch(() => undefined);
    },
    [reload],
  );

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
        <a className="brand" href="#/home" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <Duck size={54} />
          <span>Puddle</span>
        </a>
        <div className="navlinks">
          <a href="#/closet">My closet</a>
          <a className="cta small" href="#/home?install">
            Add to Chrome
          </a>
        </div>
      </nav>

      <header className="dashhead">
        <h1>Your closet</h1>
        <p>What you own and whether the next thing is worth it.</p>
        <div className="statrow">
          {summary.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </header>

      {me.notices.length > 0 && (
        <section className="noticed">
          <h3 className="sub2">Puddle noticed…</h3>
          <div className="notes">
            {me.notices.map((n) => (
              <div className="note" key={n.title}>
                <Duck size={26} />
                <p>
                  <b>{n.title}</b>
                  <br />
                  {n.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <main className="tabbody">
        {tab === "Closet" && <ClosetTab me={me} onWear={wear} />}
        {tab === "Purchases" && <PurchasesTab me={me} onChange={reload} />}
        {tab === "How you dress" && <DressTab me={me} usage={me.usage} />}
        {tab === "Value" && <ValueTab me={me} />}
        {tab === "Cart" && <CartTab items={items} onChange={reload} />}
      </main>

      <footer className="foot">
        <Duck size={22} />
        <span>Puddle, built at HackMIT.</span>
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
