import { FIXTURE, Portfolio } from "./fixtures";

const BRAIN = "http://localhost:8000";

export async function getPortfolio(): Promise<{ data: Portfolio; live: boolean }> {
  try {
    const r = await fetch(`${BRAIN}/portfolio`);
    if (!r.ok) throw new Error();
    return { data: await r.json(), live: true };
  } catch {
    return { data: FIXTURE, live: false };
  }
}
