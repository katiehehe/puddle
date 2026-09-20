// Service worker: bridges the page to the Puddle brain, with an offline fallback.
const BRAIN = "http://localhost:8000";

// Canned insights so the duck still works if the brain is down / wifi off.
const FALLBACK = {
  cand_boots: {
    headline: "Fifth pair of size-8 boots you've bought. You returned four of the previous 4.",
    duck_state: "concerned",
    confidence: 1.0,
    speak: true,
    insights: [
      { type: "return_pattern", stat: { returned: 4, total: 4, size: "8", baseline: 0.182 },
        line: "Fifth pair of size-8 boots you've bought. You returned four of the previous 4." },
      { type: "time_pattern", stat: { hour: 23, return_rate: 0.583, baseline: 0.182 },
        line: "It's 11:40pm — 88% of everything you've returned was bought after 11pm." }
    ],
    portfolio: { alpha: -0.046, covers_gap: null, redundant_with: [{ id: "own_151" }] }
  },
  cand_crew4: {
    headline: "You own 3 of these already — they cover the same days, and you've worn them 32 times between them.",
    duck_state: "concerned",
    confidence: 0.93,
    speak: true,
    insights: [{ type: "redundancy", stat: { owned_similar: 3, wears_of_similar: 32 },
      line: "You own 3 of these already — they cover the same days, and you've worn them 32 times between them." }],
    portfolio: { alpha: -0.302, covers_gap: null, redundant_with: [{ id: "own_101" }, { id: "own_102" }, { id: "own_103" }] }
  },
  cand_suit: {
    headline: "Get it. You have nothing for \"formal / interview\" — this is the first thing in your closet that would cover it.",
    duck_state: "approving",
    confidence: 0.63,
    speak: true,
    insights: [{ type: "coverage_gap", stat: { state: "Formal / interview", alpha: 0.967 },
      line: "Get it. You have nothing for \"formal / interview\" — this is the first thing in your closet that would cover it." }],
    portfolio: { alpha: 0.967, covers_gap: { label: "Formal / interview" }, redundant_with: [] }
  }
};

async function post(path, body) {
  const r = await fetch(`${BRAIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

// The pond lives in the brain so the dashboard and the duck agree on it;
// chrome.storage is only the offline mirror.
async function localPond(delta) {
  const cur = await new Promise((res) => chrome.storage.local.get(["saved"], (d) => res(d.saved || 0)));
  if (!delta) return { saved: cur, offline: true };
  const next = Math.round((cur + delta) * 100) / 100;
  await new Promise((res) => chrome.storage.local.set({ saved: next }, res));
  return { saved: next, offline: true };
}

async function score(item, nowHour) {
  try {
    return await post("/score_item", { item, now_hour: nowHour });
  } catch (e) {
    const fb = FALLBACK[item.id] || {
      headline: "Nothing in your history says anything about this one.",
      duck_state: "idle", confidence: 0.4, speak: false,
      insights: [], portfolio: { alpha: 0.1, covers_gap: null, redundant_with: [] }
    };
    return { item, prediction_id: null, offline: true, ...fb };
  }
}

async function checkout(item, predictionId, eventId) {
  try {
    return await post("/checkout", { item, prediction_id: predictionId, event_id: eventId });
  } catch (e) {
    return { mode: "mock", approved: true, token: "tok_offline", amount: item.price, network: "VISA" };
  }
}

async function skip(item, predictionId, eventId) {
  try {
    const res = await post("/skip", { item, prediction_id: predictionId, event_id: eventId });
    return res.pond;
  } catch (e) {
    return localPond(item.price || 0);
  }
}

async function pond() {
  try {
    const r = await fetch(`${BRAIN}/pond`);
    if (!r.ok) throw new Error();
    return await r.json();
  } catch (e) {
    return localPond(0);
  }
}

const HANDLERS = {
  score: (m) => score(m.item, m.now_hour),
  checkout: (m) => checkout(m.item, m.prediction_id, m.event_id),
  skip: (m) => skip(m.item, m.prediction_id, m.event_id),
  pond: () => pond()
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.type];
  if (!handler) return false;
  handler(msg).then(sendResponse);
  return true;
});
