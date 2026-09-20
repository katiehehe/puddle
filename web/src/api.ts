import { FIXTURE, Portfolio } from "./fixtures";

const BRAIN = "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BRAIN}${path}`, init);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export async function getPortfolio(): Promise<{ data: Portfolio; live: boolean }> {
  try {
    return { data: await call<Portfolio>("/portfolio"), live: true };
  } catch {
    return { data: FIXTURE, live: false };
  }
}

export type Insight = {
  type: string;
  line: string;
  weight: number;
  stat: Record<string, unknown>;
};

export type Score = {
  decision: string;
  duck_state: string;
  confidence: number;
  speak: boolean;
  headline: string;
  insights: Insight[];
  portfolio: {
    alpha: number;
    beta: number;
    style_sharpe_before: number;
    style_sharpe_after: number;
    redundant_with: { id: string; title: string; corr: number }[];
    covers_gap: { label: string } | null;
  };
  item: { title: string; price: number };
};

/** The live brain, scoring one item. This is the same call the duck makes at
 *  checkout, which is the point of showing it here. */
export async function scoreItem(itemId: string, nowHour: number): Promise<Score> {
  return call<Score>("/score_item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId, now_hour: nowHour }),
  });
}

export type CatalogItem = { id: string; title: string; price: number; category: string };

export async function getStorefront(): Promise<CatalogItem[]> {
  try {
    const d = await call<{ candidates?: CatalogItem[]; storefront?: CatalogItem[] }>("/catalog");
    return d.storefront ?? d.candidates ?? [];
  } catch {
    return [];
  }
}

export type Status = {
  payments: string;
  voice: { configured: boolean; provider?: string; model?: string };
};

/** What is actually wired up right now. Shown so nobody has to guess whether
 *  the Visa call is real, and so a missing key is visible before a demo. */
export async function getStatus(): Promise<Status | null> {
  try {
    const [health, voice] = await Promise.all([
      call<{ payments: string }>("/health"),
      call<{ configured: boolean; provider?: string; model?: string }>("/voice/status"),
    ]);
    return { payments: health.payments, voice };
  } catch {
    return null;
  }
}

export async function gradePrediction(id: string, correct: boolean): Promise<void> {
  await call(`/predict/${encodeURIComponent(id)}/grade?correct=${correct}`, { method: "POST" });
}

export type Understood = {
  category: string; kind: string; formality: number; warmth: number; rain_ok: boolean;
};

export type ClosetEntry = {
  id: string;
  title: string;
  price: number | null;
  wears: number;
  note: string | null;
  link: string | null;
  image: string | null;
  size: string | null;
  color: string | null;
  created_at: string;
  understood: Understood | null;
};


/* When there is no brain to talk to, the journal falls back to this browser.
 * A shared link is the main case: somebody opening the site from a phone has
 * no localhost to reach, and a form that silently fails is worse than one that
 * keeps your entries where you typed them. */
const LOCAL_KEY = "puddle.closet.log";

function readLocal(): ClosetEntry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; }
}

function writeLocal(entries: ClosetEntry[]): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(entries)); } catch { /* private window */ }
}

/** The same inference the brain does, kept deliberately small: enough to name
 *  the common garments so a shared link still understands what you typed. */
const LOCAL_KINDS: [RegExp, string, string][] = [
  [/rain|parka|anorak|waterproof/, "rain_outer", "outer"],
  [/puffer|down jacket/, "puffer", "outer"],
  [/blazer|suit/, "blazer", "outer"],
  [/jacket|coat/, "light_jacket", "outer"],
  [/crewneck|sweatshirt|sweater|jumper|knit/, "crewneck", "top"],
  [/hoodie/, "hoodie", "top"],
  [/tank|cami|halter|corset/, "going_out_top", "top"],
  [/shirt|tee|top|blouse|polo/, "crewneck", "top"],
  [/jeans|trouser|chino|pant/, "jeans", "bottom"],
  [/legging|tights/, "leggings", "bottom"],
  [/skirt/, "skirt", "bottom"],
  [/short/, "athletic_shorts", "bottom"],
  [/boot/, "boots", "shoes"],
  [/heel|pump/, "heels", "shoes"],
  [/sneaker|trainer/, "sneakers", "shoes"],
  [/dress/, "going_out_dress", "dress"],
  [/scarf|beanie|hat|belt|sock/, "scarf", "accessory"],
];

function guessLocally(title: string): Understood | null {
  const t = title.toLowerCase();
  for (const [re, kind, category] of LOCAL_KINDS) {
    if (re.test(t)) return { category, kind, formality: 2, warmth: 3, rain_ok: /rain|waterproof/.test(t) };
  }
  return null;
}

export async function getClosetLog(): Promise<ClosetEntry[]> {
  try {
    return (await call<{ entries: ClosetEntry[] }>("/closet/log")).entries;
  } catch {
    return readLocal();
  }
}

/** Adds one item. Throws with the server's own sentence so the form can show it. */
/** Adds one item. A refused entry is a real answer and is rethrown so the form
 *  can show the server's own sentence; only a transport failure falls back to
 *  saving in this browser. */
export async function addClosetEntry(entry: Record<string, unknown>): Promise<ClosetEntry> {
  let r: Response;
  try {
    r = await fetch(`${BRAIN}/closet/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    return addLocally(entry);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : "That did not save.");
  return body.entry;
}

function addLocally(entry: Record<string, unknown>): ClosetEntry {
  const title = String(entry.title ?? "").trim();
  const understood = guessLocally(title);
  if (!understood) {
    throw new Error(
      `We could not work out what "${title}" is. Try naming the garment, for example ` +
      `charcoal crewneck, rain jacket, or chelsea boots.`,
    );
  }
  const saved: ClosetEntry = {
    id: "log_" + Math.random().toString(36).slice(2, 12),
    title,
    price: entry.price == null ? null : Number(entry.price),
    wears: Number(entry.wears ?? 0),
    note: (entry.note as string) ?? null,
    link: (entry.link as string) ?? null,
    image: (entry.image as string) ?? null,
    size: (entry.size as string) ?? null,
    color: (entry.color as string) ?? null,
    created_at: new Date().toISOString(),
    understood,
  };
  writeLocal([saved, ...readLocal()]);
  return saved;
}

export async function removeClosetEntry(id: string): Promise<void> {
  try {
    const r = await fetch(`${BRAIN}/closet/log/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) return;
  } catch { /* fall through to the browser copy */ }
  writeLocal(readLocal().filter((e) => e.id !== id));
}

export type ClosetItem = {
  id: string; title: string; category: string; price: number;
  wears: number; expected_payoff: number;
};

export async function getCloset(): Promise<ClosetItem[]> {
  try {
    const d = await call<{ closet: ClosetItem[] }>("/closet");
    return d.closet;
  } catch {
    return [];
  }
}
