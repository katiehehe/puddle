import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  BRAIN,
  addPurchase,
  askDuck,
  editPurchase,
  editStaged,
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
import { ItemDetail } from "./ItemDetail";
import { Garment, colourGuess, kindGuess } from "./Garment";

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

// Elements on the landing page that hide until scrolled into view.
const REVEAL =
  ".hero > div > *, .hero > .mock, .steps h2, .step, .tells h2, .tell, .install > div > *";
// Same on the dashboard: .piece and .buycard individually, so each thing pops
// in separately as you scroll the closet or the cart.
const DASH_REVEAL =
  ".dashhead h1, .dashhead > p, .statrow, .tabs, .tabbody > *, .piece, .buycard, .note";

// How long after landing the page still counts as "arriving": content that
// shows up later (tab swaps, async loads) appears in place without popping.
const ARRIVAL_MS = 1500;

// One-shot reveal: each element pops in the first time it scrolls into view
// during the page's arrival, then stays put.
//
// Everything the selector matches starts at opacity 0, so anything this hook
// fails to notice is not merely un-animated -- it is invisible, holding its
// space and painting nothing. Re-scanning after every render is not enough on
// its own: a child component with its own state (opening a cart item, say)
// mounts nodes without re-rendering the component that owns this hook, and
// those nodes would stay blank forever. So watch the subtree as well.
function useReveal(ref: RefObject<HTMLElement | null>, selector: string) {
  const ioRef = useRef<IntersectionObserver | null>(null);
  const arrivedAt = useRef(0);
  useEffect(() => {
    arrivedAt.current = Date.now();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.1 },
    );
    ioRef.current = io;
    return () => io.disconnect();
  }, []);
  const scan = useCallback(() => {
    const io = ioRef.current;
    const root = ref.current;
    if (!io || !root) return;
    const settled = Date.now() - arrivedAt.current > ARRIVAL_MS;
    root.querySelectorAll(selector).forEach((n) => {
      if (n.classList.contains("in")) return;
      if (settled) n.classList.add("in", "still");
      else io.observe(n);
    });
  }, [ref, selector]);
  const moRef = useRef<MutationObserver | null>(null);
  // After every render, because the shell is not there for the first few: the
  // dashboard renders a loading card with no ref while it waits for the closet.
  // An effect that gave up on the first null root would never attach at all.
  useEffect(() => {
    scan();
    const root = ref.current;
    if (!root || moRef.current) return;
    // childList only: adding "in" is an attribute change, and watching those
    // would have every reveal schedule another scan.
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    moRef.current = mo;
  });
  useEffect(() => () => {
    moRef.current?.disconnect();
    moRef.current = null;
  }, []);
  return ioRef;
}

function CheckoutMock() {
  const [url, setUrl] = useState("northwick.com/shoes/chelsea-boots");
  useEffect(() => {
    // The embedded shop reports which item it's showing so the URL bar follows.
    const onMessage = (event: MessageEvent) => {
      // The frame is cross origin in development, where the brain serves it
      // from another port, so a same-origin test drops every message.
      const allowed = new Set([window.location.origin, BRAIN && new URL(BRAIN).origin]);
      if (!allowed.has(event.origin)) return;
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
      <iframe className="demoframe" src={`${BRAIN}/demo?embed=1`} title="Puddle live demo" />
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
  const homeRef = useRef<HTMLDivElement>(null);
  useReveal(homeRef, REVEAL);
  const goInstall = () => {
    document.getElementById("install")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <div className="home" ref={homeRef}>
      <nav className="nav">
        <a
          className="brand"
          href="#/home"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <Duck size={54} />
          <span>Puddle</span>
        </a>
        <div className="navlinks">
          <a href="#/closet">My closet</a>
          <a className="cta small" href="#/home?install" onClick={goInstall}>
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
            <a className="cta" href="#/home?install" onClick={goInstall}>
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

const ROLL_MS = 1100;

/* Rolls the number up from zero once, the first time it renders, then stays put.
 * Non-numeric parts ("$", ",", "%") are kept; the digits are what count up. */
function rollFrom(value: string, t: number): string {
  const m = value.match(/^([^\d]*)([\d,]*\.?\d*)(.*)$/);
  if (!m || !m[2]) return value;
  const [, pre, num, post] = m;
  const decimals = (num.split(".")[1] ?? "").length;
  const target = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(target)) return value;
  const eased = 1 - Math.pow(1 - t, 3);
  const text = (target * eased).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${pre}${text}${post}`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  const rolled = useRef(false);
  const [text, setText] = useState(() => rollFrom(value, 0));

  useEffect(() => {
    if (rolled.current) {
      setText(value);
      return;
    }
    rolled.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      setText(t >= 1 ? value : rollFrom(value, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="stat">
      <span>{label}</span>
      <b>{text}</b>
      {note && <em>{note}</em>}
    </div>
  );
}

function PieceCard({
  piece, onWear, onOpen, onRemove,
}: {
  piece: ClosetPiece;
  onWear: (id: string) => void;
  onOpen: () => void;
  onRemove: (id: string) => void;
}) {
  // Optimistic: a wear tap has to feel free, or nobody logs the fifth one. The
  // tap is forgotten the moment the server's own count moves, so the two never
  // add up to one wear twice.
  const [tapped, setTapped] = useState({ counted: piece.wears, extra: 0 });
  const extra = tapped.counted === piece.wears ? tapped.extra : 0;
  const wears = piece.wears + extra;
  const perWear = wears > 0 ? piece.paid / wears : null;
  return (
    <article className="piece open" onClick={onOpen} role="button" tabIndex={0}
             onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
      <div className="piecepic">
        <Garment category={piece.category} colour={piece.color} kind={piece.kind} />
        {piece.duplicates.length > 0 && <span className="dupe">+{piece.duplicates.length} similar</span>}
        {piece.yours && (
          <button
            className="xbtn onpic"
            aria-label={`Remove ${piece.title} from your closet`}
            title="Remove from closet"
            onClick={(e) => { e.stopPropagation(); onRemove(piece.id); }}
          >
            ×
          </button>
        )}
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
        onClick={(e) => {
          e.stopPropagation();
          setTapped({ counted: piece.wears, extra: extra + 1 });
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

function ClosetTab({
  me, onWear, onChange,
}: { me: Me; onWear: (id: string) => void; onChange: () => void }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const cats = me.shopping.categories;
  const shown = me.closet.filter((p) => filter === "all" || p.category === filter);
  const unworn = me.closet.filter((p) => p.wears === 0).length;

  // Arrows walk the filtered list, in display order, and wrap. Whichever
  // subset you are looking at is the one you page through.
  const step = (by: number) =>
    setOpen((i) => (i === null ? null : (i + by + shown.length) % shown.length));

  async function remove(id: string) {
    // Archived, not deleted. What you bought stays true even once the thing
    // has been sold, returned or given away, and the spending history the
    // duck reasons from would be wrong without it.
    await editPurchase(id, { archived: true, archive_reason: "removed from closet" });
    setOpen(null);
    onChange();
  }
  return (
    <>
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
        {shown.map((p, i) => (
          <PieceCard
            key={p.id}
            piece={p}
            onWear={onWear}
            onOpen={() => setOpen(i)}
            onRemove={remove}
          />
        ))}
      </div>
      {open !== null && shown[open] && (
        <ItemDetail
          piece={shown[open]}
          index={open}
          total={shown.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setOpen(null)}
          onWear={onWear}
          onRemove={remove}
          onSaved={onChange}
        />
      )}
    </>
  );
}

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
        <Garment category={p.category} colour={p.color || colourGuess(p.title) || "grey"} kind={kindGuess(p.title)} size={64} />
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
  const top = usage.rows[0]?.wears || 1;
  return (
    <>
      {/* Two views of the same occasions: what you own for each, then how
          often each one actually comes up. They answer different questions
          and are worth reading next to each other. */}
      <CoveragePanel coverage={me.coverage} />
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
    </>
  );
}

function ValueTab({ me, onWear, onChange }: { me: Me; onWear: (id: string) => void; onChange: () => void }) {
  const worn = me.closet.filter((p) => p.cost_per_wear !== null);
  const best = [...worn].sort((a, b) => (a.cost_per_wear ?? 0) - (b.cost_per_wear ?? 0)).slice(0, 5);
  const worst = [...me.closet]
    .sort((a, b) => (b.cost_per_wear ?? 1e9) - (a.cost_per_wear ?? 1e9))
    .slice(0, 5);
  const v = me.value;

  // Which of the two lists is open, and where in it. Left/right walks
  // whichever list you opened from rather than hopping between them.
  const [open, setOpen] = useState<{ list: "best" | "worst"; index: number } | null>(null);
  const lists = { best, worst };
  const active = open ? lists[open.list] : null;

  const step = (by: number) =>
    setOpen((o) => {
      if (!o) return o;
      const list = lists[o.list];
      return { ...o, index: (o.index + by + list.length) % list.length };
    });

  async function remove(id: string) {
    await editPurchase(id, { archived: true, archive_reason: "removed from closet" });
    setOpen(null);
    onChange();
  }
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
          {best.map((p, i) => (
            <button className="line linkline" key={p.id} onClick={() => setOpen({ list: "best", index: i })}>
              <span>{p.title}</span>
              <b>{money(p.cost_per_wear ?? 0)} a wear</b>
            </button>
          ))}
        </div>
        <div>
          <h3 className="sub2">Money doing nothing</h3>
          {worst.map((p, i) => (
            <button className="line linkline" key={p.id} onClick={() => setOpen({ list: "worst", index: i })}>
              <span>{p.title}</span>
              <b>{p.cost_per_wear === null ? `${round(p.paid)}, never worn` : `${money(p.cost_per_wear)} a wear`}</b>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

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

const CART_EDIT_FIELDS = ["title", "price", "brand", "size", "color", "notes"] as const;

/** One cart row, styled like a purchase: a photo, the facts, the duck's
 *  headline reason, and the two actions that matter. Clicking the row (not
 *  a button) opens the full picture. */
function CartRow({ item, onOpen, onChange }: {
  item: StagedItem; onOpen: () => void; onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const review = item.review;
  const act = (fn: () => Promise<unknown>) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    fn().then(onChange).finally(() => setBusy(false));
  };
  return (
    <article className="buycard cartcard" onClick={onOpen} role="button" tabIndex={0}
             onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
      <div className="buypic">
        <Garment category={item.category} colour={item.color || colourGuess(item.title) || "grey"} kind={item.kind} size={64} />
      </div>
      <div className="buybody">
        <h4>{item.title}</h4>
        <div className="buyline">
          {round(item.price)}
          {item.brand ? ` · ${item.brand}` : ""}
          {item.category ? ` · ${item.category.replace(/_/g, " ")}` : ""}
        </div>
        {(item.size || item.color) && (
          <div className="buysub">{[item.size && `Size ${item.size}`, item.color].filter(Boolean).join(" · ")}</div>
        )}
        <div className={`buyverdict ${review.stance}`}>
          <b>{review.verdict}</b>
          {review.reasons[0] && <p>{review.reasons[0].text}</p>}
        </div>
      </div>
      <div className="buyacts">
        <button className="cta small" disabled={busy} onClick={act(() => buyStaged(item.id))}>
          I bought it
        </button>
        <button className="ghost small" disabled={busy} onClick={act(() => unstageItem(item.id))}>
          Remove
        </button>
      </div>
    </article>
  );
}

/** The full picture on a staged item: the same reasons and numbers the
 *  "worth it" desk shows, plus the ability to fix a detail that was typed
 *  wrong, walk to the next thing on the rail, buy it, or take it off. */
function CartDetail({
  items, index, onPrev, onNext, onClose, onChanged, onRemoved,
}: {
  items: StagedItem[]; index: number;
  onPrev: () => void; onNext: () => void; onClose: () => void;
  onChanged: () => void; onRemoved: () => void;
}) {
  const item = items[index];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const key = useCallback((e: KeyboardEvent) => {
    if (editing) return;
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft") onPrev();
    if (e.key === "ArrowRight") onNext();
  }, [editing, onClose, onPrev, onNext]);
  useEffect(() => {
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [key]);

  if (!item) return null;
  const review = item.review;

  function startEdit() {
    setDraft({
      title: item.title, price: String(item.price), brand: item.brand,
      size: item.size ?? "", color: item.color, notes: item.notes,
    });
    setError("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await editStaged(item.id, {
        title: draft.title.trim(),
        price: Number(draft.price) || 0,
        brand: draft.brand.trim(),
        size: draft.size.trim() || undefined,
        color: draft.color.trim(),
        notes: draft.notes.trim(),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  // Buying or removing takes the item off the rail, so the modal has nothing
  // left to show at this index; closing it is the only sound thing to do.
  const act = (fn: () => Promise<unknown>) => () => {
    setBusy(true);
    fn().then(onRemoved).finally(() => setBusy(false));
  };

  return (
    <div className="detailwrap" role="dialog" aria-label={item.title} onClick={onClose}>
      <button className="detailnav left" onClick={(e) => { e.stopPropagation(); onPrev(); }}
              aria-label="Previous item">‹</button>

      <div className="detail cartdetail" onClick={(e) => e.stopPropagation()}>
        <button className="xbtn detailclose" onClick={onClose} aria-label="Close">×</button>

        <div className="detailpic">
          {item.photo
            ? <img src={item.photo} alt="" />
            : <Garment category={item.category} colour={item.color || colourGuess(item.title) || "grey"} kind={item.kind} />}
        </div>

        <div className="detailbody">
          {editing ? (
            <div className="editform">
              {CART_EDIT_FIELDS.map((f) => (
                <label key={f}>
                  <span>{f === "notes" ? "Notes" : f[0].toUpperCase() + f.slice(1)}</span>
                  {f === "notes" ? (
                    <textarea rows={3} value={draft[f] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                  ) : (
                    <input value={draft[f] ?? ""}
                           inputMode={f === "price" ? "decimal" : undefined}
                           onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                  )}
                </label>
              ))}
              {error && <p className="formerror">{error}</p>}
              <div className="editbtns">
                <button className="cta small" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="ghost small" disabled={saving} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="detailhead">
                <h3>{item.title}</h3>
                <button className="ghost small" onClick={startEdit}>Edit</button>
              </div>
              <p className="piecemeta">
                {[item.brand, item.size ? `size ${item.size}` : "", item.color]
                  .filter(Boolean).join(" · ")}
              </p>

              <p className={`say ${review.stance}`}>{review.verdict}</p>
              <p className="subhead">{review.subhead}</p>

              <ul className="reasons">
                {review.reasons.map((r) => (
                  <li className={r.tone} key={r.kind + r.text}>{r.text}</li>
                ))}
              </ul>

              {item.notes && <p className="buynotes">{item.notes}</p>}

              <p className="quackhead">Quant Quack, the working behind the advice</p>
              <div className="details">
                <div>
                  <span>Expected value of buying</span>
                  <b>{review.numbers.ev >= 0 ? `+${money(review.numbers.ev)}` : `-${money(-review.numbers.ev)}`}</b>
                  <em>what it's worth on average once returns are priced in</em>
                </div>
                <div>
                  <span>Most it's worth paying</span>
                  <b>{review.numbers.no_price ? "nothing" : round(review.numbers.fair_bid)}</b>
                  <em>above this you're paying for wears you won't get</em>
                </div>
                <div>
                  <span>Resale estimate</span>
                  <b>{review.numbers.resale === null ? "not known" : round(review.numbers.resale)}</b>
                  <em>roughly what it'd fetch secondhand, unworn</em>
                </div>
                <div>
                  <span>Similar things you own</span>
                  <b>{review.numbers.similar_owned}</b>
                  <em>averaging {review.numbers.similar_wears} wears each</em>
                </div>
                <div>
                  <span>You send back</span>
                  <b>{Math.round(review.numbers.return_prob * 100)}%</b>
                  <em>of things like this</em>
                </div>
                <div>
                  <span>What it adds to your closet</span>
                  <b>{review.numbers.alpha >= 0 ? `+${review.numbers.alpha.toFixed(2)}` : review.numbers.alpha.toFixed(2)}</b>
                  <em>above zero means it covers days nothing else does</em>
                </div>
              </div>

              <div className="detailbtns">
                <button className="cta small" disabled={busy} onClick={act(() => buyStaged(item.id))}>
                  I bought it
                </button>
                <button className="ghostbtn" disabled={busy} onClick={act(() => unstageItem(item.id))}>
                  Remove from cart
                </button>
              </div>
            </>
          )}

          <p className="detailcount">{index + 1} of {items.length}. Use the arrow keys to look through.</p>
        </div>
      </div>

      <button className="detailnav right" onClick={(e) => { e.stopPropagation(); onNext(); }}
              aria-label="Next item">›</button>
    </div>
  );
}

function CartTab({ items, onChange }: { items: CatalogItem[]; onChange: () => void }) {
  const [cart, setCart] = useState<StagedItem[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const reload = useCallback(() => {
    getCart().then((c) => setCart(c.items)).catch(() => setCart([]));
  }, []);
  useEffect(reload, [reload]);

  const changed = () => {
    reload();
    onChange();
  };

  const lines = cart ?? [];
  const total = lines.reduce((n, i) => n + i.price, 0);
  const worthIt = lines.filter((i) => i.review.stance === "for").length;
  const skip = lines.filter((i) => i.review.stance === "against").length;

  const step = (by: number) =>
    setOpen((i) => (i === null ? null : (i + by + lines.length) % lines.length));

  return (
    <>
      <h2>Your cart</h2>
      <p className="hint tight">
        Everything you are thinking about buying, with what Puddle makes of each one. Click a
        thing to see the full case for or against it.
      </p>

      {lines.length > 0 ? (
        <div className="buys">
          {lines.map((i, idx) => (
            <CartRow key={i.id} item={i} onOpen={() => setOpen(idx)} onChange={changed} />
          ))}
          <div className="carttotal">
            <div>
              <span>
                {lines.length} item{lines.length === 1 ? "" : "s"}
              </span>
              {skip > 0 && (
                <b className="bad">
                  Puddle would skip {skip} of {lines.length}
                </b>
              )}
              {skip === 0 && worthIt > 0 && <b className="good">Puddle is happy with all of these</b>}
            </div>
            <div className="totalval">{round(total)}</div>
          </div>
        </div>
      ) : (
        cart && (
          <p className="hint">
            Your cart is empty. Add something below, or let the extension put things here from the
            shops you visit.
          </p>
        )
      )}

      {open !== null && lines[open] && (
        <CartDetail
          items={lines}
          index={open}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setOpen(null)}
          onChanged={changed}
          onRemoved={() => { setOpen(null); changed(); }}
        />
      )}

      <h2 className="railgap">Add something you are considering</h2>
      <StageForm onStaged={reload} />

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

  const shellRef = useRef<HTMLDivElement>(null);
  useReveal(shellRef, DASH_REVEAL);

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
    <div className="shell" ref={shellRef}>
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

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <main className="tabbody">
        {tab === "Closet" && <ClosetTab me={me} onWear={wear} onChange={reload} />}
        {tab === "Purchases" && <PurchasesTab me={me} onChange={reload} />}
        {tab === "How you dress" && <DressTab me={me} usage={me.usage} />}
        {tab === "Value" && <ValueTab me={me} onWear={wear} onChange={reload} />}
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
