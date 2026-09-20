import { useEffect, useState } from "react";
import {
  CatalogItem, ClosetEntry, ClosetItem, Status,
  getCloset, getClosetLog, getPortfolio, getStatus, getStorefront, gradePrediction,
} from "./api";
import { FIXTURE, Portfolio } from "./fixtures";
import Advice from "./tabs/Advice";
import Closet from "./tabs/Closet";
import Journal from "./tabs/Journal";
import Numbers from "./tabs/Numbers";

const BRAIN = "http://localhost:8000";

function DuckLogo() {
  return (
    <svg className="logo" width="56" height="56" viewBox="0 0 110 110" aria-hidden="true">
      <ellipse cx="38" cy="66" rx="17" ry="14" fill="#e3a521" />
      <circle cx="56" cy="60" r="30" fill="var(--duck)" />
      <circle cx="62" cy="44" r="21" fill="var(--duck)" />
      <path d="M80 45 l17 -4 -3 11 z" fill="#ef7a2c" />
      <circle cx="66" cy="40" r="3.4" fill="#111827" />
    </svg>
  );
}

const TABS = [
  { key: "closet", label: "Closet" },
  { key: "journal", label: "Journal" },
  { key: "advice", label: "Advice" },
  { key: "numbers", label: "The numbers" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Where to get the extension. Loading unpacked is the only route during a
 *  hackathon, so say so plainly rather than linking to a store page that does
 *  not exist yet. */
function ExtensionPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Install the extension">
      <div className="sheetbody">
        <h3>Put the duck in your browser</h3>
        <p>
          The extension is what makes any of this arrive uninvited. It watches for a checkout
          button on a shop, reads what you are about to buy, and says something before you pay.
        </p>
        <ol>
          <li>Open <code>chrome://extensions</code> in Chrome.</li>
          <li>Turn on developer mode using the switch in the top right.</li>
          <li>Choose load unpacked, then pick the <code>extension</code> folder in this project.</li>
          <li>Open the shop below and click checkout.</li>
        </ol>
        <p>
          Once it is loaded it also runs on a handful of real shops, including Allbirds, Everlane,
          Gymshark and anything hosted on Shopify. On those it has to find the buy button and read
          the product off the page itself, so it stays quiet unless it recognises what you are
          looking at.
        </p>
        <p className="muted">
          If you would rather not install anything, the same duck runs on a page the brain serves
          itself. It behaves identically, it just cannot follow you to other shops.
        </p>
        <div className="sheetlinks">
          <a className="btn" href="http://localhost:5500" target="_blank" rel="noreferrer">Open the shop</a>
          <a className="btn ghost" href={`${BRAIN}/demo`} target="_blank" rel="noreferrer">Try it without installing</a>
        </div>
        <button className="tiny" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("closet");
  const [p, setP] = useState<Portfolio>(FIXTURE);
  const [live, setLive] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [logged, setLogged] = useState<ClosetEntry[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [showExt, setShowExt] = useState(false);

  async function refresh() {
    const r = await getPortfolio();
    setP(r.data); setLive(r.live);
    setCloset(await getCloset());
    setLogged(await getClosetLog());
  }

  useEffect(() => {
    refresh();
    getStorefront().then(setItems);
    getStatus().then(setStatus);
  }, []);

  async function grade(id: string, correct: boolean) {
    await gradePrediction(id, correct);
    await refresh();
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <DuckLogo />
          <div>
            <div className="tag">PUDDLE</div>
            <h1>Everything you own, and whether you need any more of it</h1>
            <p className="sub">
              Your closet knows things about you that no shop will ever tell you. This is where
              you can see them.
            </p>
          </div>
        </div>
        <div className="herobtns">
          <button className="btn" onClick={() => setShowExt(true)}>Add the duck to your browser</button>
          <div className={"badge " + (live ? "on" : "off")}>
            {live ? "connected" : "showing saved data"}
          </div>
          {status && status.payments === "mock" && (
            <div className="badge off">payments are simulated</div>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={"tab " + (tab === t.key ? "on" : "")}
                  onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "closet" && <Closet items={closet} logged={logged} coverage={p.coverage} />}
      {tab === "journal" && <Journal entries={logged} onChange={refresh} />}
      {tab === "advice" && <Advice p={p} />}
      {tab === "numbers" && <Numbers p={p} items={items} live={live} onGrade={grade} />}

      {showExt && <ExtensionPanel onClose={() => setShowExt(false)} />}

      <footer className="foot">
        <span className="prints">❋ ❋ ❋</span>
        Puddle at HackMIT 2026
      </footer>
    </div>
  );
}
