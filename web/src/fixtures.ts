// Offline fallback so the dashboard renders even if the brain isn't running.
// Generated from GET /portfolio -- regenerate after changing brain/history.py or
// the rebalance rules, or the offline demo will disagree with the live one.
export const FIXTURE = {
  "style_sharpe": 1.58,
  "risk_free": 0.257,
  "coverage": [
    {
      "state": "Class / casual (warm)",
      "coverage": 0.9,
      "p": 0.2667,
      "covered": true
    },
    {
      "state": "Class / casual (cold)",
      "coverage": 0.748,
      "p": 0.2083,
      "covered": true
    },
    {
      "state": "Gym / athletic",
      "coverage": 0.85,
      "p": 0.15,
      "covered": true
    },
    {
      "state": "Lounge / comfort",
      "coverage": 0.8,
      "p": 0.1333,
      "covered": true
    },
    {
      "state": "Night out / party",
      "coverage": 0.78,
      "p": 0.1,
      "covered": true
    },
    {
      "state": "Date / nice dinner",
      "coverage": 0.78,
      "p": 0.0458,
      "covered": true
    },
    {
      "state": "Formal / interview",
      "coverage": 0.279,
      "p": 0.0167,
      "covered": false
    },
    {
      "state": "Rain / snow",
      "coverage": 0.748,
      "p": 0.0792,
      "covered": true
    }
  ],
  "holdings": [
    {
      "id": "own_101",
      "title": "Charcoal crewneck",
      "category": "top",
      "price": 58,
      "wears": 10,
      "expected_payoff": 0.391,
      "weight": 0.0,
      "cost_per_wear": 5.8,
      "redundant_with": [
        "own_102",
        "own_103"
      ]
    },
    {
      "id": "own_102",
      "title": "Charcoal crewneck (heavier)",
      "category": "top",
      "price": 72,
      "wears": 17,
      "expected_payoff": 0.365,
      "weight": 0.0,
      "cost_per_wear": 4.24,
      "redundant_with": [
        "own_101",
        "own_103"
      ]
    },
    {
      "id": "own_103",
      "title": "Grey crewneck",
      "category": "top",
      "price": 45,
      "wears": 5,
      "expected_payoff": 0.287,
      "weight": 0.0,
      "cost_per_wear": 9.0,
      "redundant_with": [
        "own_101",
        "own_102"
      ]
    },
    {
      "id": "own_104",
      "title": "Charcoal hoodie",
      "category": "top",
      "price": 64,
      "wears": 18,
      "expected_payoff": 0.318,
      "weight": 0.0,
      "cost_per_wear": 3.56,
      "redundant_with": [
        "own_142"
      ]
    },
    {
      "id": "own_110",
      "title": "Black satin cami",
      "category": "top",
      "price": 42,
      "wears": 7,
      "expected_payoff": 0.223,
      "weight": 0.0,
      "cost_per_wear": 6.0,
      "redundant_with": [
        "own_111",
        "own_112"
      ]
    },
    {
      "id": "own_111",
      "title": "Sequin halter top",
      "category": "top",
      "price": 55,
      "wears": 1,
      "expected_payoff": 0.128,
      "weight": 0.0,
      "cost_per_wear": 55.0,
      "redundant_with": [
        "own_110",
        "own_112"
      ]
    },
    {
      "id": "own_112",
      "title": "Red going-out top",
      "category": "top",
      "price": 38,
      "wears": 7,
      "expected_payoff": 0.177,
      "weight": 0.0,
      "cost_per_wear": 5.43,
      "redundant_with": [
        "own_110",
        "own_111"
      ]
    },
    {
      "id": "own_113",
      "title": "Mesh long-sleeve",
      "category": "top",
      "price": 34,
      "wears": 2,
      "expected_payoff": 0.143,
      "weight": 0.0,
      "cost_per_wear": 17.0,
      "redundant_with": [
        "own_110",
        "own_111",
        "own_112"
      ]
    },
    {
      "id": "own_114",
      "title": "Corset top",
      "category": "top",
      "price": 48,
      "wears": 4,
      "expected_payoff": 0.157,
      "weight": 0.0,
      "cost_per_wear": 12.0,
      "redundant_with": [
        "own_110",
        "own_111",
        "own_112"
      ]
    },
    {
      "id": "own_115",
      "title": "Off-shoulder top",
      "category": "top",
      "price": 40,
      "wears": 3,
      "expected_payoff": 0.171,
      "weight": 0.0,
      "cost_per_wear": 13.33,
      "redundant_with": [
        "own_110",
        "own_111",
        "own_112"
      ]
    },
    {
      "id": "own_120",
      "title": "Straight-leg jeans",
      "category": "bottom",
      "price": 88,
      "wears": 7,
      "expected_payoff": 0.413,
      "weight": 0.0,
      "cost_per_wear": 12.57,
      "redundant_with": [
        "own_140",
        "own_123"
      ]
    },
    {
      "id": "own_121",
      "title": "Black jeans",
      "category": "bottom",
      "price": 78,
      "wears": 8,
      "expected_payoff": 0.398,
      "weight": 0.0,
      "cost_per_wear": 9.75,
      "redundant_with": [
        "own_124"
      ]
    },
    {
      "id": "own_122",
      "title": "Sweatpants",
      "category": "bottom",
      "price": 45,
      "wears": 20,
      "expected_payoff": 0.318,
      "weight": 0.0,
      "cost_per_wear": 2.25,
      "redundant_with": [
        "own_123"
      ]
    },
    {
      "id": "own_123",
      "title": "Leggings",
      "category": "bottom",
      "price": 32,
      "wears": 15,
      "expected_payoff": 0.296,
      "weight": 0.0,
      "cost_per_wear": 2.13,
      "redundant_with": [
        "own_140",
        "own_122"
      ]
    },
    {
      "id": "own_124",
      "title": "Denim mini skirt",
      "category": "bottom",
      "price": 42,
      "wears": 4,
      "expected_payoff": 0.131,
      "weight": 0.0,
      "cost_per_wear": 10.5,
      "redundant_with": [
        "own_121"
      ]
    },
    {
      "id": "own_130",
      "title": "Puffer jacket",
      "category": "outer",
      "price": 140,
      "wears": 20,
      "expected_payoff": 0.443,
      "weight": 0.5463,
      "cost_per_wear": 7.0,
      "redundant_with": [
        "own_132"
      ]
    },
    {
      "id": "own_131",
      "title": "Denim jacket",
      "category": "outer",
      "price": 95,
      "wears": 4,
      "expected_payoff": 0.322,
      "weight": 0.0,
      "cost_per_wear": 23.75,
      "redundant_with": []
    },
    {
      "id": "own_132",
      "title": "Rain shell",
      "category": "outer",
      "price": 110,
      "wears": 12,
      "expected_payoff": 0.422,
      "weight": 0.0,
      "cost_per_wear": 9.17,
      "redundant_with": [
        "own_130"
      ]
    },
    {
      "id": "own_140",
      "title": "Running shorts",
      "category": "bottom",
      "price": 28,
      "wears": 16,
      "expected_payoff": 0.153,
      "weight": 0.0,
      "cost_per_wear": 1.75,
      "redundant_with": [
        "own_123",
        "own_120"
      ]
    },
    {
      "id": "own_141",
      "title": "Sports bra",
      "category": "top",
      "price": 34,
      "wears": 7,
      "expected_payoff": 0.162,
      "weight": 0.0,
      "cost_per_wear": 4.86,
      "redundant_with": [
        "own_142"
      ]
    },
    {
      "id": "own_142",
      "title": "Training tee",
      "category": "top",
      "price": 26,
      "wears": 4,
      "expected_payoff": 0.261,
      "weight": 0.0,
      "cost_per_wear": 6.5,
      "redundant_with": [
        "own_141",
        "own_104"
      ]
    },
    {
      "id": "own_150",
      "title": "White sneakers",
      "category": "shoes",
      "price": 85,
      "wears": 9,
      "expected_payoff": 0.413,
      "weight": 0.0,
      "cost_per_wear": 9.44,
      "redundant_with": []
    },
    {
      "id": "own_151",
      "title": "Chelsea boots",
      "category": "shoes",
      "price": 120,
      "wears": 2,
      "expected_payoff": 0.204,
      "weight": 0.0,
      "cost_per_wear": 60.0,
      "redundant_with": []
    },
    {
      "id": "own_152",
      "title": "Rain boots",
      "category": "shoes",
      "price": 65,
      "wears": 15,
      "expected_payoff": 0.294,
      "weight": 0.0,
      "cost_per_wear": 4.33,
      "redundant_with": []
    },
    {
      "id": "own_153",
      "title": "Strappy heels",
      "category": "shoes",
      "price": 78,
      "wears": 0,
      "expected_payoff": 0.128,
      "weight": 0.0,
      "cost_per_wear": 78.0,
      "redundant_with": []
    },
    {
      "id": "own_160",
      "title": "Black slip dress",
      "category": "dress",
      "price": 95,
      "wears": 7,
      "expected_payoff": 0.387,
      "weight": 0.4537,
      "cost_per_wear": 13.57,
      "redundant_with": []
    }
  ],
  "rebalance": {
    "buy": [
      {
        "decision": "buy",
        "reasons": [
          "Get it. You have nothing for \"formal / interview\" \u2014 this is the first thing in your closet that would cover it."
        ],
        "id": "sku_999",
        "title": "Charcoal wool suit",
        "price": 320,
        "alpha": 0.967,
        "sharpe_after": 2.283,
        "covers_gap": "Formal / interview",
        "redundant_with": []
      }
    ],
    "skip": [
      {
        "decision": "skip",
        "reasons": [
          "Fifth pair of size-8 boots you've bought. You returned every one of the other four.",
          "You already own chelsea boots \u2014 it covers the same days, and you've worn it 2 times.",
          "It's 11:48pm \u2014 83% of what you buy this late comes back, against 18% the rest of the day."
        ],
        "id": "sku_991",
        "title": "Suede Chelsea boots",
        "price": 128,
        "alpha": -0.046,
        "sharpe_after": 1.552,
        "covers_gap": null,
        "redundant_with": [
          "own_151"
        ]
      },
      {
        "decision": "skip",
        "reasons": [
          "You own 3 of these already (Charcoal crewneck, Charcoal crewneck (heavier)) \u2014 they cover the same days, and you've worn them 32 times between them.",
          "It's 11:48pm \u2014 83% of what you buy this late comes back, against 18% the rest of the day."
        ],
        "id": "sku_992",
        "title": "Charcoal crewneck sweatshirt",
        "price": 68,
        "alpha": -0.302,
        "sharpe_after": 1.538,
        "covers_gap": null,
        "redundant_with": [
          "own_101",
          "own_102",
          "own_103"
        ]
      },
      {
        "decision": "skip",
        "reasons": [
          "You already own white sneakers \u2014 it covers the same days, and you've worn it 9 times.",
          "It's 11:48pm \u2014 83% of what you buy this late comes back, against 18% the rest of the day."
        ],
        "id": "sku_996",
        "title": "Platform sneakers",
        "price": 95,
        "alpha": -0.334,
        "sharpe_after": 1.51,
        "covers_gap": null,
        "redundant_with": [
          "own_150"
        ]
      },
      {
        "decision": "skip",
        "reasons": [
          "You own 2 of these already (Puffer jacket, Rain shell) \u2014 they cover the same days, and you've worn them 32 times between them.",
          "It's 11:48pm \u2014 83% of what you buy this late comes back, against 18% the rest of the day."
        ],
        "id": "sku_997",
        "title": "Quilted rain parka",
        "price": 148,
        "alpha": -0.308,
        "sharpe_after": 1.574,
        "covers_gap": null,
        "redundant_with": [
          "own_130",
          "own_132"
        ]
      },
      {
        "decision": "skip",
        "reasons": [
          "You already own sports bra \u2014 it covers the same days, and you've worn it 7 times.",
          "It's 11:48pm \u2014 83% of what you buy this late comes back, against 18% the rest of the day."
        ],
        "id": "sku_998",
        "title": "Ribbed tank",
        "price": 24,
        "alpha": -0.202,
        "sharpe_after": 1.486,
        "covers_gap": null,
        "redundant_with": [
          "own_141"
        ]
      }
    ],
    "neutral": [
      {
        "decision": "neutral",
        "reasons": [],
        "id": "sku_995",
        "title": "Cashmere scarf",
        "price": 74,
        "alpha": -0.078,
        "sharpe_after": 1.577,
        "covers_gap": null,
        "redundant_with": []
      }
    ],
    "donate": [
      {
        "id": "own_111",
        "title": "Sequin halter top",
        "category": "top",
        "price": 55,
        "wears": 1,
        "expected_payoff": 0.128,
        "weight": 0.0,
        "cost_per_wear": 55.0,
        "redundant_with": [
          "own_110",
          "own_112"
        ]
      },
      {
        "id": "own_153",
        "title": "Strappy heels",
        "category": "shoes",
        "price": 78,
        "wears": 0,
        "expected_payoff": 0.128,
        "weight": 0.0,
        "cost_per_wear": 78.0,
        "redundant_with": []
      }
    ],
    "budget": 400.0,
    "spent": 320.0
  },
  "overexposure": {
    "hhi": 0.2811,
    "top_state": "casual_warm",
    "top_label": "Class / casual (warm)",
    "top_share": 0.385
  },
  "pond": {
    "saved": 0,
    "skips": 0
  },
  "ledger": {
    "predictions": [
      {
        "id": "p_seed1",
        "item": "Faux-leather pants",
        "call": "skip",
        "line": "Third pair you've bought this late. You returned both others.",
        "duck_state": "concerned",
        "confidence": 0.78,
        "created_at": "2026-02-11T23:41:00+00:00",
        "graded": true,
        "correct": true,
        "user_action": "skipped",
        "seeded": true
      },
      {
        "id": "p_seed2",
        "item": "Charcoal wool suit",
        "call": "buy",
        "line": "Get it. You have nothing for an interview.",
        "duck_state": "approving",
        "confidence": 0.71,
        "created_at": "2026-03-02T14:05:00+00:00",
        "graded": true,
        "correct": true,
        "user_action": "bought",
        "seeded": true
      },
      {
        "id": "p_seed3",
        "item": "Cashmere scarf",
        "call": "skip",
        "line": "You own two that cover the same days.",
        "duck_state": "concerned",
        "confidence": 0.62,
        "created_at": "2026-03-19T21:12:00+00:00",
        "graded": true,
        "correct": false,
        "user_action": "bought",
        "seeded": true
      }
    ],
    "accuracy": "2/3"
  }
};

export type Portfolio = typeof FIXTURE;
