// Offline fallback so the dashboard renders even if the brain isn't running.
// Generated from GET /portfolio -- regenerate after changing seed.py or the
// rebalance rules, or the offline demo will disagree with the live one.
export const FIXTURE = {
    "style_sharpe": 2.434,
    "coverage": [
      {
        "state": "Class (warm)",
        "coverage": 0.85,
        "p": 0.24
      },
      {
        "state": "Class (cold)",
        "coverage": 0.675,
        "p": 0.2
      },
      {
        "state": "Gym",
        "coverage": 0.7,
        "p": 0.12
      },
      {
        "state": "Lounge",
        "coverage": 0.675,
        "p": 0.1
      },
      {
        "state": "Night out",
        "coverage": 0.65,
        "p": 0.09
      },
      {
        "state": "Date",
        "coverage": 0.525,
        "p": 0.06
      },
      {
        "state": "Formal",
        "coverage": 0.366,
        "p": 0.06
      },
      {
        "state": "Rain/Snow",
        "coverage": 0.203,
        "p": 0.13
      }
    ],
    "holdings": [
      {
        "id": "own_tee1",
        "title": "White cotton tee",
        "category": "top",
        "price": 18,
        "wears": 40,
        "expected_payoff": 0.497,
        "cost_per_wear": 0.45,
        "redundant_with": [
          "own_gymtop"
        ]
      },
      {
        "id": "own_crew1",
        "title": "Charcoal crewneck",
        "category": "top",
        "price": 55,
        "wears": 22,
        "expected_payoff": 0.464,
        "cost_per_wear": 2.5,
        "redundant_with": [
          "own_crew2",
          "own_crew3"
        ]
      },
      {
        "id": "own_crew2",
        "title": "Charcoal crewneck (older)",
        "category": "top",
        "price": 50,
        "wears": 9,
        "expected_payoff": 0.348,
        "cost_per_wear": 5.56,
        "redundant_with": [
          "own_crew1",
          "own_crew3"
        ]
      },
      {
        "id": "own_crew3",
        "title": "Heather-charcoal sweatshirt",
        "category": "top",
        "price": 48,
        "wears": 6,
        "expected_payoff": 0.319,
        "cost_per_wear": 8.0,
        "redundant_with": [
          "own_crew1",
          "own_crew2"
        ]
      },
      {
        "id": "own_jeans",
        "title": "Dark wash jeans",
        "category": "bottom",
        "price": 78,
        "wears": 55,
        "expected_payoff": 0.522,
        "cost_per_wear": 1.42,
        "redundant_with": []
      },
      {
        "id": "own_chinos",
        "title": "Olive chinos",
        "category": "bottom",
        "price": 60,
        "wears": 18,
        "expected_payoff": 0.343,
        "cost_per_wear": 3.33,
        "redundant_with": []
      },
      {
        "id": "own_hoodie",
        "title": "Grey hoodie",
        "category": "outer",
        "price": 45,
        "wears": 48,
        "expected_payoff": 0.32,
        "cost_per_wear": 0.94,
        "redundant_with": []
      },
      {
        "id": "own_gymtop",
        "title": "Dri-fit gym tee",
        "category": "top",
        "price": 25,
        "wears": 30,
        "expected_payoff": 0.349,
        "cost_per_wear": 0.83,
        "redundant_with": [
          "own_tee1"
        ]
      },
      {
        "id": "own_gymshort",
        "title": "Running shorts",
        "category": "bottom",
        "price": 28,
        "wears": 27,
        "expected_payoff": 0.349,
        "cost_per_wear": 1.04,
        "redundant_with": []
      },
      {
        "id": "own_sneak",
        "title": "White sneakers",
        "category": "shoes",
        "price": 90,
        "wears": 60,
        "expected_payoff": 0.497,
        "cost_per_wear": 1.5,
        "redundant_with": []
      },
      {
        "id": "own_going",
        "title": "Silky night-out top",
        "category": "top",
        "price": 65,
        "wears": 5,
        "expected_payoff": 0.258,
        "cost_per_wear": 13.0,
        "redundant_with": []
      }
    ],
    "rebalance": {
      "buy": [
        {
          "id": "cand_rain",
          "title": "Packable rain shell",
          "price": 95,
          "alpha": 0.3972,
          "sharpe_after": 3.4271,
          "covers_gap": "Rain/Snow",
          "redundant_with": [],
          "blocked_by": [],
          "why": "Buy it — you've got nothing for 'Rain/Snow', and this actually covers it.",
          "sharpe_per_dollar": 0.0105
        },
        {
          "id": "cand_oxford",
          "title": "Oxford dress shirt",
          "price": 60,
          "alpha": 0.1644,
          "sharpe_after": 2.5256,
          "covers_gap": null,
          "redundant_with": [
            "own_going"
          ],
          "blocked_by": [],
          "why": null,
          "sharpe_per_dollar": 0.0015
        },
        {
          "id": "cand_suit",
          "title": "Charcoal wool suit",
          "price": 320,
          "alpha": 0.2513,
          "sharpe_after": 2.4964,
          "covers_gap": "Formal",
          "redundant_with": [],
          "blocked_by": [],
          "why": "Buy it — you've got nothing for 'Formal', and this actually covers it.",
          "sharpe_per_dollar": 0.0002
        }
      ],
      "skip": [
        {
          "id": "cand_crew4",
          "title": "Charcoal crewneck (new)",
          "price": 68,
          "alpha": -0.0405,
          "sharpe_after": 2.4289,
          "covers_gap": null,
          "redundant_with": [
            "own_crew1",
            "own_crew2",
            "own_crew3"
          ],
          "blocked_by": [
            "redundancy"
          ],
          "why": "Fourth charcoal crewneck — you own 3 already, and they cover the same days.",
          "sharpe_per_dollar": -0.0001
        },
        {
          "id": "cand_boots",
          "title": "Chelsea boots (size 8)",
          "price": 128,
          "alpha": 0.0408,
          "sharpe_after": 2.4561,
          "covers_gap": null,
          "redundant_with": [],
          "blocked_by": [
            "return_pattern"
          ],
          "why": "Fifth pair of size-8 boots. You returned the other 4.",
          "sharpe_per_dollar": 0.0002
        }
      ],
      "donate": [
        {
          "id": "own_going",
          "title": "Silky night-out top",
          "category": "top",
          "price": 65,
          "wears": 5,
          "expected_payoff": 0.258,
          "cost_per_wear": 13.0,
          "redundant_with": []
        },
        {
          "id": "own_crew3",
          "title": "Heather-charcoal sweatshirt",
          "category": "top",
          "price": 48,
          "wears": 6,
          "expected_payoff": 0.319,
          "cost_per_wear": 8.0,
          "redundant_with": [
            "own_crew1",
            "own_crew2"
          ]
        }
      ],
      "budget": 500.0,
      "spent": 475.0
    },
    "overexposure": 0.016,
    "pond": {
      "saved": 196
    },
    "ledger": {
      "predictions": [
        {
          "id": "p_0001",
          "item": "Suede boots",
          "call": "skip",
          "graded": true,
          "correct": true
        },
        {
          "id": "p_0002",
          "item": "Third hoodie",
          "call": "skip",
          "graded": true,
          "correct": true
        },
        {
          "id": "p_0003",
          "item": "Wool coat",
          "call": "buy",
          "graded": true,
          "correct": true
        },
        {
          "id": "p_0004",
          "item": "Neon sneakers",
          "call": "skip",
          "graded": true,
          "correct": false
        },
        {
          "id": "p_0005",
          "item": "Linen shirt",
          "call": "buy",
          "graded": true,
          "correct": true
        }
      ],
      "accuracy": "4/5"
    }
  };
export type Portfolio = typeof FIXTURE;
