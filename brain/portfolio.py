"""Portfolio engine: treats a closet as a risk-return portfolio.

States of the world = occasions. Each item has a payoff in each state.
Returns, covariance, Sharpe, and the alpha buy-rule are the standard
Markowitz objects, computed over state-weighted moments.
"""
from __future__ import annotations

from dataclasses import dataclass
import numpy as np

# 8 states of the world. p = life mix (sums to 1). f = required formality (1-5),
# w = required warmth (1-5), wet = rain/snow.
STATES = [
    {"name": "Class (warm)",  "p": 0.24, "f": 2, "w": 2, "wet": False},
    {"name": "Class (cold)",  "p": 0.20, "f": 2, "w": 4, "wet": False},
    {"name": "Gym",           "p": 0.12, "f": 1, "w": 2, "wet": False},
    {"name": "Lounge",        "p": 0.10, "f": 1, "w": 3, "wet": False},
    {"name": "Night out",     "p": 0.09, "f": 4, "w": 2, "wet": False},
    {"name": "Date",          "p": 0.06, "f": 4, "w": 3, "wet": False},
    {"name": "Formal",        "p": 0.06, "f": 5, "w": 3, "wet": False},
    {"name": "Rain/Snow",     "p": 0.13, "f": 2, "w": 4, "wet": True},
]

P = np.array([s["p"] for s in STATES], dtype=float)
P = P / P.sum()
RF = 0.10  # "risk-free" baseline utility (loungewear you always fall back on)


def payoff(item: dict, state: dict) -> float:
    """How good `item` is in `state`, in [0, 1]. Multiplicative: any hard
    mismatch (formality, warmth, rain) kills it."""
    q = float(item.get("q", 0.7))
    form_match = max(0.0, 1.0 - abs(item["formality"] - state["f"]) / 4.0)
    warm_match = max(0.0, 1.0 - abs(item["warmth"] - state["w"]) / 4.0)
    rain = 1.0 if (not state["wet"] or item.get("waterproof")) else 0.3
    return q * form_match * warm_match * rain


def payoff_matrix(items: list[dict]) -> np.ndarray:
    """Returns A with shape (n_items, n_states)."""
    return np.array([[payoff(it, s) for s in STATES] for it in items], dtype=float)


def w_mean(A: np.ndarray) -> np.ndarray:
    """State-weighted expected payoff per item -> mu (n,)."""
    return A @ P


def w_cov(A: np.ndarray, mu: np.ndarray | None = None) -> np.ndarray:
    """State-weighted covariance of item payoffs -> Sigma (n, n)."""
    if mu is None:
        mu = w_mean(A)
    D = A - mu[:, None]              # center each item across states
    return (D * P) @ D.T             # sum_s p_s (a_i-mu_i)(a_j-mu_j)


def _ridge_inv(M: np.ndarray, eps: float = 1e-3) -> np.ndarray:
    return np.linalg.inv(M + eps * np.eye(M.shape[0]))


def tangency_weights(mu: np.ndarray, Sigma: np.ndarray, rf: float = RF) -> np.ndarray:
    """Max-Sharpe weights, long-only. Closed-form w ~ Sigma^-1 (mu - rf),
    then clip negatives (no shorting a shirt) and renormalize."""
    n = len(mu)
    if n == 0:
        return np.zeros(0)
    excess = mu - rf
    w = _ridge_inv(Sigma) @ excess
    w = np.clip(w, 0.0, None)
    s = w.sum()
    if s <= 1e-9:
        return np.ones(n) / n
    return w / s


def sharpe(w: np.ndarray, mu: np.ndarray, Sigma: np.ndarray, rf: float = RF) -> float:
    if len(w) == 0:
        return 0.0
    ret = float(w @ mu)
    var = float(w @ (Sigma + 1e-6 * np.eye(len(w))) @ w)
    if var <= 0:
        return 0.0
    return (ret - rf) / np.sqrt(var)


def closet_sharpe(items: list[dict]) -> tuple[float, np.ndarray]:
    if not items:
        return 0.0, np.zeros(0)
    A = payoff_matrix(items)
    mu = w_mean(A)
    Sigma = w_cov(A, mu)
    w = tangency_weights(mu, Sigma)
    return sharpe(w, mu, Sigma), w


def _w_moments_1d(x: np.ndarray) -> tuple[float, float]:
    m = float(x @ P)
    v = float(((x - m) ** 2) @ P)
    return m, v


def w_corr(x: np.ndarray, y: np.ndarray) -> float:
    mx, vx = _w_moments_1d(x)
    my, vy = _w_moments_1d(y)
    if vx <= 1e-12 or vy <= 1e-12:
        return 0.0
    cov = float(((x - mx) * (y - my)) @ P)
    return cov / np.sqrt(vx * vy)


@dataclass
class BuyScore:
    alpha: float
    beta: float
    sharpe_before: float
    sharpe_after: float
    redundant_with: list[str]
    covers_gap: str | None


def coverage_by_state(closet: list[dict]) -> list[float]:
    """Best available payoff per state among owned items (0..1)."""
    if not closet:
        return [0.0] * len(STATES)
    A = payoff_matrix(closet)
    return list(np.max(A, axis=0))


def score_candidate(candidate: dict, closet: list[dict],
                    gap_threshold: float = 0.45) -> BuyScore:
    """Evaluate a candidate purchase against the current closet.

    alpha > 0 means it delivers payoff the closet cannot already produce
    (it expands the efficient frontier) -> worth buying.
    """
    sb, w = closet_sharpe(closet)

    a_j = payoff_matrix([candidate])[0]           # (m,)
    mu_j = float(a_j @ P)

    # Closet portfolio payoff across states (the "market" to regress against).
    redundant_with: list[str] = []
    if closet:
        A_owned = payoff_matrix(closet)
        cp = w @ A_owned                          # (m,) portfolio payoff by state
        mean_cp, var_cp = _w_moments_1d(cp)
        cov_jc = float(((a_j - mu_j) * (cp - mean_cp)) @ P)
        beta = cov_jc / var_cp if var_cp > 1e-12 else 0.0
        alpha = (mu_j - RF) - beta * (mean_cp - RF)
        # redundancy: owned items in the SAME category that move with this
        # candidate (you can't substitute jeans for a crewneck).
        for it in closet:
            if it.get("category") != candidate.get("category"):
                continue
            a_i = payoff_matrix([it])[0]
            if w_corr(a_j, a_i) > 0.80:
                redundant_with.append(it["id"])
    else:
        beta, alpha = 0.0, mu_j - RF

    # sharpe after adding the item to the investable set
    sa, _ = closet_sharpe(closet + [candidate])

    # coverage gap: a state the closet underserves that this item is good at
    covers_gap = None
    cov = coverage_by_state(closet)
    best_state, best_gain = None, 0.0
    for si, s in enumerate(STATES):
        if cov[si] < gap_threshold and a_j[si] > 0.5:
            gain = a_j[si] - cov[si]
            if gain > best_gain:
                best_gain, best_state = gain, s["name"]
    if best_state and alpha > 0:
        covers_gap = best_state

    return BuyScore(
        alpha=round(alpha, 4),
        beta=round(beta, 4),
        sharpe_before=round(sb, 4),
        sharpe_after=round(sa, 4),
        redundant_with=redundant_with,
        covers_gap=covers_gap,
    )


def herfindahl_overexposure(closet: list[dict]) -> float:
    """0..1 concentration of the closet's coverage across states.
    High => overexposed to a few occasions."""
    cov = np.array(coverage_by_state(closet))
    if cov.sum() <= 1e-9:
        return 0.0
    shares = cov / cov.sum()
    hhi = float((shares ** 2).sum())
    # normalize: min is 1/m (even), max is 1 (all one state)
    m = len(STATES)
    return (hhi - 1 / m) / (1 - 1 / m)
