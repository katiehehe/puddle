"""Occasion states: the 'states of the world' the closet is a portfolio over.

Requirements per state are structural (an interview needs formal clothes).
The *probabilities* are not hardcoded -- they are estimated from the user's
logged wear events in `history`, so the life-mix comes from data.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class State:
    key: str
    label: str
    formality: int  # 1-5 required
    warmth: int  # 1-5 required
    wet: bool
    stake: float = 1.0  # cost of getting this occasion wrong


STATES: list[State] = [
    State("casual_warm", "Class / casual (warm)", 2, 2, False),
    State("casual_cold", "Class / casual (cold)", 2, 4, False),
    State("gym", "Gym / athletic", 1, 2, False),
    State("lounge", "Lounge / comfort", 1, 3, False),
    State("night_out", "Night out / party", 4, 2, False, 1.5),
    State("date", "Date / nice dinner", 4, 2, False, 2.0),
    State("formal", "Formal / interview", 5, 3, False, 6.0),
    State("rain", "Rain / snow", 2, 4, True, 1.5),
]

STATE_INDEX = {s.key: i for i, s in enumerate(STATES)}

# Fallback prior, used only when a user has no logged wear events at all.
UNIFORM_PRIOR = {s.key: 1.0 / len(STATES) for s in STATES}


def life_mix(wear_events: list[dict], smoothing: float = 2.0) -> dict[str, float]:
    """Estimate p_s from logged wear events, Laplace-smoothed."""
    counts = {s.key: smoothing for s in STATES}
    for event in wear_events:
        if event["state"] in counts:
            counts[event["state"]] += 1.0
    total = sum(counts.values())
    return {k: v / total for k, v in counts.items()}


def stake_weighted(mix: dict[str, float]) -> dict[str, float]:
    """Rare occasions you cannot afford to fail still carry weight.

    An interview happens twice a year, but showing up wrong costs far more
    than a bad gym outfit, so the portfolio is priced against p_s * stake_s.
    """
    weighted = {s.key: mix[s.key] * s.stake for s in STATES}
    total = sum(weighted.values())
    return {k: v / total for k, v in weighted.items()}
