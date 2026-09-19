// Service worker: bridges the page to the Puddle brain, with an offline fallback.
const BRAIN = "http://localhost:8000";

// Canned insights so the duck still works if the brain is down / wifi off.
const FALLBACK = {
  cand_boots: {
    headline: "Fifth pair of size-8 boots. You returned the other 4.",
    duck_state: "concerned",
    confidence: 0.9,
    speak: true,
    insights: [
      { type: "return_pattern", stat: { returned: 4, total: 5, size: "8" },
        line: "Fifth pair of size-8 boots. You returned the other 4." },
      { type: "time_pattern", stat: { hour: 23, return_rate: 0.88, baseline: 0.18 },
        line: "It's late — 88% of what you buy this late comes back, against 18% the rest of the day." }
    ],
    portfolio: { alpha: 0.04, covers_gap: null, redundant_with: [] }
  },
  cand_crew4: {
    headline: "Fourth charcoal crewneck — you own 3 already, and they cover the same days.",
    duck_state: "concerned",
    confidence: 0.75,
    speak: true,
    insights: [{ type: "redundancy", stat: { corr_owned: 3 },
      line: "Fourth charcoal crewneck — you own 3 already, and they cover the same days." }],
    portfolio: { alpha: -0.01, covers_gap: null, redundant_with: ["own_crew1", "own_crew2", "own_crew3"] }
  },
  cand_suit: {
    headline: "Buy it — you've got nothing for 'Formal', and this covers it.",
    duck_state: "approving",
    confidence: 0.66,
    speak: true,
    insights: [{ type: "coverage_gap", stat: { state: "Formal", alpha: 0.25 },
      line: "Buy it — you've got nothing for 'Formal', and this actually covers it." }],
    portfolio: { alpha: 0.25, covers_gap: "Formal", redundant_with: [] }
  }
};

async function score(item, nowHour) {
  try {
    const r = await fetch(`${BRAIN}/score_item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item, now_hour: nowHour })
    });
    if (!r.ok) throw new Error("brain " + r.status);
    return await r.json();
  } catch (e) {
    const fb = FALLBACK[item.id] || {
      headline: "That one's fine. Go for it.",
      duck_state: "approving", confidence: 0.4, speak: false,
      insights: [], portfolio: { alpha: 0.1, covers_gap: null, redundant_with: [] }
    };
    return { item, prediction_id: "p_offline", offline: true, ...fb };
  }
}

async function checkout(item) {
  try {
    const r = await fetch(`${BRAIN}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item })
    });
    if (!r.ok) throw new Error();
    return await r.json();
  } catch (e) {
    return { mode: "mock", approved: true, token: "tok_offline", amount: item.price, network: "VISA" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "score") {
    score(msg.item, msg.now_hour).then(sendResponse);
    return true;
  }
  if (msg.type === "checkout") {
    checkout(msg.item).then(sendResponse);
    return true;
  }
});
