// Offline fallback so the dashboard renders even if the brain isn't running.
export const FIXTURE = {
  style_sharpe: 2.434,
  coverage: [
    { state: "Class (warm)", coverage: 0.85, p: 0.24 },
    { state: "Class (cold)", coverage: 0.72, p: 0.2 },
    { state: "Gym", coverage: 0.7, p: 0.12 },
    { state: "Lounge", coverage: 0.56, p: 0.1 },
    { state: "Night out", coverage: 0.65, p: 0.09 },
    { state: "Date", coverage: 0.49, p: 0.06 },
    { state: "Formal", coverage: 0.37, p: 0.06 },
    { state: "Rain/Snow", coverage: 0.17, p: 0.13 },
  ],
  holdings: [
    { id: "own_crew1", title: "Charcoal crewneck", category: "top", price: 55, wears: 22, expected_payoff: 0.34, cost_per_wear: 2.5, redundant_with: ["own_crew2", "own_crew3"] },
    { id: "own_jeans", title: "Dark wash jeans", category: "bottom", price: 78, wears: 55, expected_payoff: 0.36, cost_per_wear: 1.42, redundant_with: [] },
    { id: "own_going", title: "Silky night-out top", category: "top", price: 65, wears: 5, expected_payoff: 0.18, cost_per_wear: 13.0, redundant_with: [] },
  ],
  rebalance: {
    buy: [
      { id: "cand_rain", title: "Packable rain shell", price: 95, alpha: 0.3972, sharpe_after: 2.52, covers_gap: "Rain/Snow", redundant_with: [] },
      { id: "cand_suit", title: "Charcoal wool suit", price: 320, alpha: 0.2513, sharpe_after: 2.53, covers_gap: "Formal", redundant_with: [] },
    ],
    skip: [
      { id: "cand_crew4", title: "Charcoal crewneck (new)", price: 68, alpha: -0.01, sharpe_after: 2.42, covers_gap: null, redundant_with: ["own_crew1", "own_crew2", "own_crew3"] },
    ],
    donate: [
      { id: "own_going", title: "Silky night-out top", expected_payoff: 0.18 },
    ],
    budget: 400, spent: 155,
  },
  overexposure: 0.32,
  pond: { saved: 68 },
  ledger: {
    predictions: [
      { id: "p_0001", item: "Suede boots", call: "skip", graded: true, correct: true },
      { id: "p_0003", item: "Wool coat", call: "buy", graded: true, correct: true },
      { id: "p_0004", item: "Neon sneakers", call: "skip", graded: true, correct: false },
    ],
    accuracy: "4/5",
  },
};
export type Portfolio = typeof FIXTURE;
