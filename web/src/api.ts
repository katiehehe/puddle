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
  shopping?: ShoppingContext;
  advice: Advice;
};

export type Reason = { tone: "for" | "against" | "neutral"; kind: string; text: string };

/** The whole answer to "is this worth buying", in the order a person reads it:
 *  the verdict, why, what it costs per wear, and only then the arithmetic. */
export type Advice = {
  verdict: string;
  stance: "for" | "think" | "against";
  score: number;
  subhead: string;
  reasons: Reason[];
  per_wear: Record<string, number>;
  expected_wears: number;
  resale: number | null;
  questions: string[];
  numbers: {
    paid: number;
    typical_price: number | null;
    resale: number | null;
    expected_wears: number;
    cost_per_wear_if_bought: number | null;
    your_cost_per_wear: number;
    similar_owned: number;
    similar_wears: number;
    return_prob: number;
    ev: number;
    fair_bid: number;
    no_price: boolean;
    alpha: number;
  };
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

export type ClosetPiece = {
  id: string;
  title: string;
  category: string;
  kind: string;
  color: string;
  material: string;
  size: string | null;
  paid: number;
  worth_now: number;
  value_retained: number;
  lost: number;
  cost_per_wear: number | null;
  wears: number;
  typical_price: number | null;
  difference: number | null;
  verdict: string;
  duplicates: string[];
  tags: string[];
  brand: string;
  photo: string;
  yours: boolean;
};

export type PurchaseRow = {
  id: string;
  title: string;
  category: string;
  price: number;
  bought_at: string;
  returned: boolean;
  return_reason: string | null;
  in_closet: boolean;
  wears: number | null;
  worth_now: number | null;
  cost_per_wear: number | null;
  brand: string;
  size: string | null;
  color: string;
  photo: string;
  notes: string;
  source_url: string;
  archived: boolean;
  archive_reason: string | null;
  tags?: string[];
  /** True for things the user typed in: only those can be edited or wear-logged. */
  yours: boolean;
};

export type Occasion = {
  state: string;
  label: string;
  strength: "good" | "thin" | "none";
  score: number;
  covered: boolean;
  best_item: string | null;
  options: number;
};

export type Coverage = {
  headline: string;
  advice: string;
  well_covered: string[];
  gaps: string[];
  weakest: string | null;
  occasions: Occasion[];
};

export type Usage = {
  rows: { state: string; label: string; wears: number; share: number }[];
  total_wears: number;
  enough_data: boolean;
  lines: string[];
};

export type Notice = { title: string; detail: string };

export type Me = {
  closet: ClosetPiece[];
  purchases: PurchaseRow[];
  shopping: {
    lines: string[];
    categories: { category: string; label: string; count: number }[];
    items_owned: number;
    in_rotation: number;
    spent_recently: number;
    recent_days: number;
    best_value: { title: string; cost_per_wear: number } | null;
    least_used: { title: string; price: number } | null;
    returned_count: number;
    purchase_count: number;
  };
  coverage: Coverage;
  usage: Usage;
  notices: Notice[];
  value: { spent: number; worth_now: number; value_retained: number; saved: number };
};

export type NewPurchase = {
  title: string;
  price: number;
  bought_at?: string;
  brand?: string;
  category?: string;
  size?: string;
  color?: string;
  source_url?: string;
  photo?: string;
  notes?: string;
  resale_estimate?: number;
  wears?: number;
  add_to_closet?: boolean;
};

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BRAIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => null);
    throw new Error(detail?.detail ?? `${path} ${r.status}`);
  }
  return r.json();
}

export async function addPurchase(purchase: NewPurchase): Promise<PurchaseRow> {
  const r = await send<{ purchase: PurchaseRow }>("/purchases", "POST", purchase);
  return r.purchase;
}

export async function editPurchase(id: string, patch: Partial<NewPurchase & { archived: boolean; archive_reason: string; in_closet: boolean }>): Promise<PurchaseRow> {
  const r = await send<{ purchase: PurchaseRow }>(`/purchases/${encodeURIComponent(id)}`, "PATCH", patch);
  return r.purchase;
}

/** One click, one wear. Deliberately the cheapest interaction in the app. */
export async function logWears(itemIds: string[]): Promise<Record<string, number>> {
  const r = await send<{ wears: Record<string, number> }>("/wears", "POST", { item_ids: itemIds });
  return r.wears;
}

export type Guess = { recognised: boolean; brand: string; category?: string; kind?: string };

/** What we can work out from the name and the shop, so nobody types it twice. */
export async function guessItem(title: string, url: string): Promise<Guess | null> {
  if (!title.trim()) return null;
  try {
    return await call<Guess>(`/guess?title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`);
  } catch {
    return null;
  }
}

/** Everything the closet dashboard shows: what you own, what you bought, what
 *  it's worth, and what your own history says about how you shop. */
export async function getMe(): Promise<Me> {
  return call<Me>("/me");
}

export type ShoppingContext = {
  owned_count: number;
  owned_titles: string[];
  owned_wears: number;
  closest: { title: string; wears: number } | null;
  resale: number;
  per_wear_at: Record<string, number>;
  typical_price: number | null;
  difference: number | null;
  verdict: string;
  basis: string;
};

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
