"""The closet as a scenario-based portfolio.

Items are assets, occasions are states of the world. An item's "return" in a
state is how well it serves that occasion; covariance between two items is how
much they serve the *same* occasions, which is exactly redundancy.

  mu_i     = sum_s p_s a_is
  Sigma_ij = sum_s p_s (a_is - mu_i)(a_js - mu_j)

Everything below is deliberately transparent: the explanation is the product,
so a learned payoff function would be a downgrade even if it were available.
"""

from __future__ import annotations

import numpy as np

from .catalog import Item
from .states import STATES, stake_weighted

RISK_AVERSION = 3.0

# Colours that do the same job in an outfit. Two neutrals stand in for each
# other; a neutral and a bright do not, which is why a fifth charcoal crewneck
# is a duplicate and the first red one is not.
NEUTRALS = frozenset({
    "black", "charcoal", "grey", "gray", "white", "cream", "ivory",
    "beige", "tan", "khaki", "navy", "brown", "denim", "indigo",
    "taupe", "camel", "stone", "sand", "oatmeal", "ecru", "bone",
    "slate", "graphite", "olive", "natural", "nude", "off-white",
})


def interchangeable_colour(owned: str, candidate: str) -> bool:
    """Whether two colours can stand in for each other in the same outfit.

    An unknown colour answers True: a storefront that never said what colour
    this is has not given us grounds to claim the two are *different*, and
    refusing to substitute on missing data would quietly hide real duplicates.
    """
    owned, candidate = (owned or "").strip().lower(), (candidate or "").strip().lower()
    if not owned or not candidate or owned == candidate:
        return True
    return owned in NEUTRALS and candidate in NEUTRALS


def payoff(item: Item, state) -> float:
    """a_is in [0,1] -- multiplicative so any hard mismatch zeroes it out."""
    # Formality: being underdressed is punished hard, overdressed mildly.
    gap = item.formality - state.formality
    if gap < 0:
        formality = max(0.0, 1.0 + gap * 0.45)
    else:
        formality = max(0.0, 1.0 - gap * 0.18)

    # Warmth: too cold is a real failure, too warm is an inconvenience.
    wgap = item.warmth - state.warmth
    if wgap < 0:
        warmth = max(0.0, 1.0 + wgap * 0.35)
    else:
        warmth = max(0.0, 1.0 - wgap * 0.12)

    rain = 1.0 if (not state.wet or item.rain_ok or item.warmth >= 4) else 0.35

    return float(item.quality * formality * warmth * rain)


def payoff_matrix(items: list[Item]) -> np.ndarray:
    return np.array([[payoff(i, s) for s in STATES] for i in items], dtype=float)


def moments(items: list[Item], mix: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    eff = stake_weighted(mix)
    p = np.array([eff[s.key] for s in STATES], dtype=float)
    A = payoff_matrix(items)
    mu = A @ p
    D = A - mu[:, None]
    sigma = (D * p) @ D.T
    return mu, sigma


def _project_simplex(v: np.ndarray) -> np.ndarray:
    """Euclidean projection onto {w >= 0, sum w = 1}."""
    u = np.sort(v)[::-1]
    css = np.cumsum(u) - 1.0
    idx = np.arange(1, len(v) + 1)
    cond = u - css / idx > 0
    rho = idx[cond][-1]
    theta = css[cond][-1] / rho
    return np.maximum(v - theta, 0.0)


def optimal_weights(mu: np.ndarray, sigma: np.ndarray, steps: int = 800) -> np.ndarray:
    """max w'mu - (lambda/2) w'Sigma w  s.t. w >= 0, sum w = 1.

    Projected gradient ascent. n is tiny (tens of items) so this converges in
    milliseconds and avoids a solver dependency.
    """
    n = len(mu)
    w = np.full(n, 1.0 / n)
    scale = float(np.max(np.abs(sigma))) or 1.0
    lr = 0.5 / (RISK_AVERSION * scale * n)
    for _ in range(steps):
        grad = mu - RISK_AVERSION * (sigma @ w)
        w = _project_simplex(w + lr * grad)
    return w


def weights_with_floor(
    mu: np.ndarray, sigma: np.ndarray, idx: int, floor: float, steps: int = 800
) -> np.ndarray:
    """Same objective, but asset `idx` must carry at least `floor` weight.

    Buying something and never wearing it is not a neutral act, so the
    frontier after a purchase has to assume you actually wear the thing.
    Without this the optimiser just assigns a redundant item zero weight and
    Style Sharpe never moves.
    """
    n = len(mu)
    u = np.full(n, 1.0 / n)
    scale = float(np.max(np.abs(sigma))) or 1.0
    lr = 0.5 / (RISK_AVERSION * scale * n)
    e = np.zeros(n)
    e[idx] = 1.0
    for _ in range(steps):
        w = (1.0 - floor) * u + floor * e
        grad = (1.0 - floor) * (mu - RISK_AVERSION * (sigma @ w))
        u = _project_simplex(u + lr * grad)
    return (1.0 - floor) * u + floor * e


def sharpe(w: np.ndarray, mu: np.ndarray, sigma: np.ndarray, rf: float) -> float:
    var = float(w @ sigma @ w)
    if var <= 1e-12:
        return 0.0
    return float((w @ mu - rf) / np.sqrt(var))


def risk_free(items: list[Item], mix: dict[str, float]) -> float:
    """The loungewear baseline: what you get by always reaching for the comfy thing."""
    lounge = [i for i in items if i.formality <= 1]
    if not lounge:
        return 0.0
    mu, _ = moments(lounge, mix)
    return float(np.mean(mu))


COVERED = 0.55  # payoff at which an occasion counts as served


class Closet:
    def __init__(self, items: list[Item], mix: dict[str, float]):
        self.items = items
        self.mix = mix
        self.mu, self.sigma = moments(items, mix)
        self.w = optimal_weights(self.mu, self.sigma)
        self.rf = risk_free(items, mix)
        self.sharpe = sharpe(self.w, self.mu, self.sigma, self.rf)
        self._A = payoff_matrix(items)
        eff = stake_weighted(mix)
        self._p = np.array([eff[s.key] for s in STATES])  # used for all moments
        self._p_raw = np.array([mix[s.key] for s in STATES])  # how life actually splits

    # --- coverage -----------------------------------------------------------
    def coverage(self) -> list[dict]:
        """How well the best available item serves each occasion."""
        best = self._A.max(axis=0)
        out = []
        for j, s in enumerate(STATES):
            out.append(
                {
                    "state": s.key,
                    "label": s.label,
                    "p": round(float(self._p_raw[j]), 4),
                    "p_weighted": round(float(self._p[j]), 4),
                    "best": round(float(best[j]), 3),
                    "best_item": self.items[int(self._A[:, j].argmax())].id,
                    "covered": bool(best[j] >= COVERED),
                }
            )
        return out

    def gaps(self) -> list[dict]:
        return [c for c in self.coverage() if not c["covered"]]

    def serving(self, state_key: str) -> list[tuple[Item, float]]:
        """Items that clear the coverage bar for one occasion, best first."""
        j = next(k for k, s in enumerate(STATES) if s.key == state_key)
        scored = [(item, round(float(self._A[i][j]), 3)) for i, item in enumerate(self.items)]
        return sorted([pair for pair in scored if pair[1] >= COVERED], key=lambda pair: -pair[1])

    def donatable(self) -> list[str]:
        """Ids of items you can let go without opening a hole.

        Lowest expected payoff is the wrong test on its own: the one thing you
        own for an occasion is rarely worn precisely because that occasion is
        rare, and donating it is how a covered state becomes a gap. An item is
        safe only where something else already clears the bar behind it.
        """
        if len(self.items) < 2:
            return []
        A = self._A
        n_states = A.shape[1]
        order = np.argsort(-A, axis=0)
        best_i = order[0]                                  # who serves each state
        runner_up = A[order[1], np.arange(n_states)]       # what is left without them
        safe = []
        for i, item in enumerate(self.items):
            sole_support = any(
                best_i[j] == i and A[i, j] >= COVERED and runner_up[j] < COVERED
                for j in range(n_states)
            )
            if not sole_support:
                safe.append(item.id)
        return safe

    def concentration(self) -> dict:
        """Herfindahl over which occasion each item is *for* (its argmax state)."""
        counts = np.zeros(len(STATES))
        for row in self._A:
            counts[int(row.argmax())] += 1.0
        share = counts / counts.sum()
        hhi = float((share**2).sum())
        top = int(share.argmax())
        return {
            "hhi": round(hhi, 4),
            "top_state": STATES[top].key,
            "top_label": STATES[top].label,
            "top_share": round(float(share[top]), 3),
            "top_count": int(counts[top]),
        }

    # --- the buy decision ---------------------------------------------------
    def evaluate(self, candidate: Item) -> dict:
        """Does adding this item expand the frontier?

        alpha_j = mu_j - beta_j * mu_p, with beta from the covariance of the
        candidate against the current optimal wear-allocation. Redundant items
        have high beta and therefore no alpha.
        """
        a_c = np.array([payoff(candidate, s) for s in STATES])
        mu_c = float(a_c @ self._p)

        port = self._A.T @ self.w  # payoff of the closet-as-held, per state
        mu_p = float(port @ self._p)
        dp = port - mu_p
        var_p = float((dp * dp) @ self._p)
        cov_cp = float(((a_c - mu_c) * dp) @ self._p)
        beta = cov_cp / var_p if var_p > 1e-12 else 0.0
        alpha = mu_c - beta * mu_p

        # Sharpe if you buy it *and wear it*: the new item gets at least its
        # fair share of wears, the rest of the closet re-optimises around it.
        items_after = self.items + [candidate]
        mu_a, sigma_a = moments(items_after, self.mix)
        floor = 1.0 / len(items_after)
        w_a = weights_with_floor(mu_a, sigma_a, len(items_after) - 1, floor)
        sharpe_after = sharpe(w_a, mu_a, sigma_a, risk_free(items_after, self.mix))

        # which owned items does this thing duplicate?
        dupes = []
        for idx, item in enumerate(self.items):
            a_i = self._A[idx]
            d_i, d_c = a_i - self.mu[idx], a_c - mu_c
            denom = np.sqrt(((d_i * d_i) @ self._p) * ((d_c * d_c) @ self._p))
            corr = float(((d_i * d_c) @ self._p) / denom) if denom > 1e-12 else 0.0
            # Same slot means genuinely substitutable. Two garments can trace
            # near-identical payoff curves and still not stand in for each
            # other, so correlation alone is not enough: substitution is a
            # claim about what the things *are*. Kind carries that; category
            # is too coarse (a sports bra and a ribbed tank are both "top"),
            # and the remaining guards catch variation inside one kind.
            same_slot = (
                item.kind == candidate.kind
                and abs(item.formality - candidate.formality) <= 1
                and item.rain_ok == candidate.rain_ok
                and abs(item.warmth - candidate.warmth) <= 1
                # Colour is part of what a garment *is*, not decoration on top
                # of it: you reach for the red one when the charcoal one will
                # not do, so it cannot be the charcoal one's substitute.
                and interchangeable_colour(item.color, candidate.color)
            )
            if corr > 0.82 and same_slot:
                dupes.append(
                    {
                        "id": item.id,
                        "title": item.title,
                        "kind": item.kind,
                        "corr": round(corr, 3),
                    }
                )
        dupes.sort(key=lambda d: -d["corr"])

        # does it fill a gap we actually have?
        covers = None
        for gap in self.gaps():
            j = next(k for k, s in enumerate(STATES) if s.key == gap["state"])
            if a_c[j] >= 0.55:
                covers = {"state": gap["state"], "label": gap["label"], "payoff": round(float(a_c[j]), 3)}
                break

        return {
            "style_sharpe_before": round(self.sharpe, 3),
            "style_sharpe_after": round(sharpe_after, 3),
            "alpha": round(alpha, 3),
            "beta": round(beta, 3),
            "mu": round(mu_c, 3),
            "redundant_with": dupes[:3],
            "covers_gap": covers,
            "top_state": STATES[int(a_c.argmax())].key,
            "top_label": STATES[int(a_c.argmax())].label,
        }
