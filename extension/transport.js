// Both demo modes use the same duck and voice panel. In Chrome, the service
// worker forwards requests; /demo uses same-origin HTTP without an extension.
(() => {
  const extension = Boolean(globalThis.chrome?.runtime?.id);
  // Reloading the extension leaves this script running on a page it can no
  // longer talk to. Reaching for the dead port throws where a caller cannot
  // catch it, so check first and fail the way every other error here fails.
  globalThis.PuddleOrphaned = () => extension && !globalThis.chrome?.runtime?.id;
  globalThis.PuddleSend = async msg => {
    if (extension) return new Promise((resolve, reject) => {
      if (globalThis.PuddleOrphaned()) {
        reject(new Error("Puddle was reloaded. Refresh the page."));
        return;
      }
      try {
        chrome.runtime.sendMessage(msg, response => {
          if (chrome.runtime.lastError) reject(new Error("Puddle could not connect. Reload the extension and page."));
          else if (!response || response.error) reject(new Error(response?.error || "Puddle did not respond."));
          else resolve(response);
        });
      } catch (error) { reject(error); }
    });
    let path, body, method = "POST", headers = { "Content-Type": "application/json" };
    switch (msg.type) {
      case "score": path = "/score_item"; body = { item: msg.item, now_hour: msg.now_hour }; break;
      case "voice_status": path = "/voice/status"; method = "GET"; break;
      case "pond": case "read_pond": path = "/pond"; method = "GET"; break;
      case "voice_respond": path = "/voice/respond";
        body = { transcript: msg.transcript, item: msg.item, now_hour: msg.now_hour }; break;
      case "skip": case "record_skip": path = "/actions";
        body = { item: msg.item, prediction_id: msg.prediction_id, event_id: msg.event_id, action: "skip" }; break;
      case "payment_intent": path = "/payment-intents";
        body = { item: msg.item, prediction_id: msg.prediction_id, budget_limit: msg.budget_limit }; break;
      case "confirm_payment_intent": path = "/payment-intents/confirm";
        body = { token: msg.token, confirmed: true }; break;
      case "voice_speak": path = "/voice/speak"; body = { text: msg.text }; break;
      case "voice_transcribe":
        if (typeof msg.audio !== "string" || msg.audio.length > 2800000) throw new Error("Recording is too large.");
        path = "/voice/transcribe";
        body = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
        headers = { "Content-Type": msg.mimeType }; break;
      default: throw new Error("Unknown Puddle request.");
    }
    let response;
    try {
      response = await fetch(path, { method, headers, signal: AbortSignal.timeout(30000),
        ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}) });
    } catch { throw new Error("Puddle could not connect. Check the backend and try again."); }
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Puddle could not complete that request.");
    return msg.type === "skip" ? data.pond : data;
  };
})();
