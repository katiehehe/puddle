// Service worker: bridges the page to the Puddle brain, with an offline fallback.
const BRAIN = "http://localhost:8000";

// Canned insights so the duck still works if the brain is down / wifi off.
const FALLBACK = {
  cand_boots: {
    headline: "Fifth pair of size-8 boots you've bought. You returned every one of the other four.",
    duck_state: "concerned",
    confidence: 0.9,
    speak: true,
    insights: [
      { type: "return_pattern", stat: { returned: 4, total: 4, size: "8" },
        line: "Fifth pair of size-8 boots you've bought. You returned every one of the other four." },
      { type: "time_pattern", stat: { hour: 23, return_rate: 0.83, baseline: 0.18 },
        line: "It's 11:40pm: 83% of what you buy this late comes back, against 18% the rest of the day." }
    ],
    portfolio: { alpha: -0.05, covers_gap: null, redundant_with: [{ id: "own_151" }] }
  },
  cand_crew4: {
    headline: "You own 3 of these already: they cover the same days.",
    duck_state: "concerned",
    confidence: 0.75,
    speak: true,
    insights: [{ type: "redundancy", stat: { owned_similar: 3 },
      line: "You own 3 charcoal crewnecks already: they cover the same days." }],
    portfolio: { alpha: -0.01, covers_gap: null, redundant_with: [{ id: "own_101" }, { id: "own_102" }, { id: "own_103" }] }
  },
  cand_suit: {
    headline: "Get it. You have nothing for an interview: this is the first thing that covers it.",
    duck_state: "approving",
    confidence: 0.66,
    speak: true,
    insights: [{ type: "coverage_gap", stat: { state: "Formal / interview", alpha: 0.25 },
      line: "Get it. You have nothing for an interview: this is the first thing that covers it." }],
    portfolio: { alpha: 0.25, covers_gap: { label: "Formal / interview" }, redundant_with: [] }
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
    return { approved: false, status: "error", message: "Checkout is unavailable. No purchase was recorded." };
  }
}

async function skip(item, predictionId, eventId) {
  try {
    const res = await post("/skip", { item, prediction_id: predictionId, event_id: eventId });
    return res.pond;
  } catch (e) {
    return { error: "Skip was not recorded. Check the backend and try again." };
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

// Voice uses the service worker for cross-origin requests. The API key stays
// on the Python server; only a short recording is sent from the extension.
async function voiceRequest(msg) {
  let path, options = {};
  if (msg.type === "voice_status") path = "/voice/status";
  else if (msg.type === "voice_respond") {
    path = "/voice/respond";
    options = { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: msg.transcript, item: msg.item, now_hour: msg.now_hour }) };
  } else if (msg.type === "voice_transcribe") {
    if (typeof msg.audio !== "string" || msg.audio.length > 2800000) throw new Error("Recording is too large.");
    const bytes = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
    path = "/voice/transcribe";
    options = { method: "POST", headers: { "Content-Type": msg.mimeType }, body: bytes };
  } else if (msg.type === "record_skip") {
    path = "/actions";
    options = { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: msg.event_id, item: msg.item, prediction_id: msg.prediction_id, action: "skip" }) };
  } else if (msg.type === "voice_speak") {
    path = "/voice/speak";
    options = { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text }) };
  } else if (msg.type === "read_pond") path = "/pond";
  else throw new Error("Unknown voice request.");
  const response = await fetch(`${BRAIN}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The request could not be completed.");
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!["voice_status", "voice_respond", "voice_transcribe", "voice_speak", "record_skip", "read_pond"].includes(msg.type)) return false;
  voiceRequest(msg).then(sendResponse).catch(error => sendResponse({
    error: error.name === "TimeoutError" ? "The request timed out. Please try again." :
      error instanceof TypeError ? "Puddle is unavailable. Start the backend and try again." : error.message
  }));
  return true;
});
