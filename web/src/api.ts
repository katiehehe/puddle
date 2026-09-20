import { FIXTURE, Portfolio } from "./fixtures";

// Empty base = same origin, for the build the brain serves at /dashboard.
const BRAIN = import.meta.env.VITE_BRAIN ?? "http://localhost:8000";

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

export type Quote = {
  ask: number;
  fair_bid: number;
  no_price: boolean;
  fair_value: number;
  expected_wears: number;
  wears_logged: number;
  your_cost_per_wear: number;
  cost_per_wear_if_bought: number | null;
  return_prob: number;
  return_evidence: string;
  friction: number;
  ev: number;
  ev_if_skipped: number;
  units_held: number;
  units: { id: string; title: string; wears: number }[];
  unit_wears: number;
  alpha: number;
  covers_gap: { label: string } | null;
};

/** The same item, quoted as a trade: what it's offered at, what it's worth here. */
export async function getQuote(itemId: string, nowHour: number): Promise<Quote> {
  return call<Quote>(`/desk/${encodeURIComponent(itemId)}?now_hour=${nowHour}`);
}

/** The duck, answering in text. The extension uses this too, then speaks it. */
export async function askDuck(itemId: string, question: string, nowHour: number): Promise<string> {
  const r = await call<{ answer?: string }>("/voice/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: question, item_id: itemId, now_hour: nowHour }),
  });
  return r.answer ?? "I don't have a read on that one.";
}

export async function gradePrediction(id: string, correct: boolean): Promise<void> {
  await call(`/predict/${encodeURIComponent(id)}/grade?correct=${correct}`, { method: "POST" });
}
