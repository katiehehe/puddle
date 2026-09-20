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
      { type: "time_pattern", stat: { hour: 23, return_rate: 1.0, baseline: 0.58 },
        line: "It's late: that's when most of your returns get bought." }
    ],
    portfolio: { alpha: 0.04, covers_gap: null, redundant_with: [] }
  },
  cand_crew4: {
    headline: "You already own 3 things that cover the same days.",
    duck_state: "concerned",
    confidence: 0.75,
    speak: true,
    insights: [{ type: "redundancy", stat: { corr_owned: 3 },
      line: "You already own 3 charcoal crewnecks. This adds nothing new." }],
    portfolio: { alpha: -0.01, covers_gap: null, redundant_with: ["own_crew1", "own_crew2", "own_crew3"] }
  },
  cand_suit: {
    headline: "Buy it: you've got nothing for 'Formal', and this covers it.",
    duck_state: "approving",
    confidence: 0.66,
    speak: true,
    insights: [{ type: "coverage_gap", stat: { state: "Formal", alpha: 0.25 },
      line: "Buy it: you've got nothing for 'Formal', and this actually covers it." }],
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
      body: JSON.stringify({ event_id: msg.event_id, item: msg.item, action: "skip" }) };
  } else if (msg.type === "read_pond") path = "/pond";
  else throw new Error("Unknown voice request.");
  const response = await fetch(`${BRAIN}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The request could not be completed.");
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!["voice_status", "voice_respond", "voice_transcribe", "record_skip", "read_pond"].includes(msg.type)) return false;
  voiceRequest(msg).then(sendResponse).catch(error => sendResponse({
    error: error.name === "TimeoutError" ? "The request timed out. Please try again." :
      error instanceof TypeError ? "Puddle is unavailable. Start the backend and try again." : error.message
  }));
  return true;
});
