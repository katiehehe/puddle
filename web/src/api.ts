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

export async function getClosetLog(): Promise<ClosetEntry[]> {
  try {
    const d = await call<{ entries: ClosetEntry[] }>("/closet/log");
    return d.entries;
  } catch {
    return [];
  }
}

/** Adds one item. Throws with the server's own sentence so the form can show it. */
export async function addClosetEntry(entry: Record<string, unknown>): Promise<ClosetEntry> {
  const r = await fetch(`${BRAIN}/closet/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : "That did not save.");
  return body.entry;
}

export async function removeClosetEntry(id: string): Promise<void> {
  await fetch(`${BRAIN}/closet/log/${encodeURIComponent(id)}`, { method: "DELETE" });
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
