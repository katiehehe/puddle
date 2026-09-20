// Puddle content script: watches for checkout, then shows the duck.
(function () {
  const PALETTE = {
    ink: "#16191c", muted: "#5d6771", line: "#e4e8ec",
    duck: "#e8a317", water: "#2a7fb8", good: "#0d7a4a", bad: "#b3261e", surface: "#ffffff"
  };

  const DUCK = (state) => {
    // simple flat duck; brow/eye changes per state
    const brow = {
      idle: "", curious: '<path d="M40 40 l14 -5" stroke="#7a5b12" stroke-width="3" stroke-linecap="round"/>',
      concerned: '<path d="M38 38 l16 6" stroke="#7a5b12" stroke-width="3" stroke-linecap="round"/>',
      approving: '<path d="M40 42 q7 -6 14 0" stroke="#0d7a4a" stroke-width="3" fill="none" stroke-linecap="round"/>'
    }[state] || "";
    return `<svg width="72" height="72" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="86" rx="26" ry="6" fill="#cfe3ef"/>
      <circle cx="50" cy="52" r="34" fill="${PALETTE.duck}"/>
      <circle cx="62" cy="44" r="5.5" fill="#fff"/><circle cx="63.5" cy="44" r="2.6" fill="#16191c"/>
      ${brow}
      <path d="M78 50 l16 -4 -3 10 z" fill="#e8681c"/>
    </svg>`;
  };

  let host = null, shadow = null, lastKey = "", voiceCleanup = null, dismissTimer = null, renderVersion = 0;

  function ensureHost() {
    clearTimeout(dismissTimer);
    if (host) return;
    host = document.createElement("div");
    host.id = "puddle-root";
    host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
  }

  function chip(result) {
    const i = (result.insights || [])[0];
    if (!i) return "";
    if (i.type === "return_pattern") return `returned ${i.stat.returned}/${i.stat.total}${i.stat.size ? " · size " + i.stat.size : ""}`;
    if (i.type === "time_pattern") return `${Math.round((i.stat.return_rate || 0) * 100)}% returned this late`;
    if (i.type === "redundancy") return `${(result.portfolio.redundant_with || []).length} similar owned`;
    if (i.type === "coverage_gap") return `covers ${i.stat.state}`;
    if (i.type === "overexposure") return `over-concentrated`;
    return "";
  }

  function send(msg) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(msg, result => {
      if (chrome.runtime.lastError || !result || result.error) reject(new Error(result?.error || "Puddle is unavailable."));
      else resolve(result);
    }));
  }
  async function getSaved() {
    try { return (await send({ type: "read_pond" })).saved; }
    catch { return 0; }
  }

  function speak(text) {
    try {
      // Fallback TTS. Production: ElevenLabs stream (eleven_flash_v2_5).
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }

  async function render(result, item) {
    const version = ++renderVersion;
    voiceCleanup?.();
    ensureHost();
    const concerned = result.duck_state === "concerned";
    const accent = concerned ? PALETTE.bad : result.duck_state === "approving" ? PALETTE.good : PALETTE.water;
    const saved = await getSaved();
    if (version !== renderVersion) return;
    const c = chip(result);

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(340px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;background:${PALETTE.surface};border:1px solid ${PALETTE.line};
          border-left:4px solid ${accent};border-radius:14px;padding:14px 16px;
          box-shadow:0 8px 24px rgba(20,25,28,.14);animation:pop .28s ease}
        @keyframes pop{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .row{display:flex;gap:12px;align-items:flex-start}
        .bubble{flex:1}
        .quack{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:700}
        .line{font-size:15px;line-height:1.45;color:${PALETTE.ink};margin:3px 0 8px}
        .chip{display:inline-block;background:#f3f6f8;border:1px solid ${PALETTE.line};border-radius:99px;
          padding:2px 10px;font-size:12px;color:${PALETTE.muted};margin-bottom:10px}
        .btns{display:flex;gap:8px;justify-content:flex-end}
        button{border-radius:9px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid ${PALETTE.line}}
        .skip{background:${accent};color:#fff;border-color:${accent}}
        .buy{background:#fff;color:${PALETTE.ink}}
        .pond{margin-top:12px;height:8px;border-radius:99px;background:#eaf3f8;overflow:hidden}
        .fill{height:100%;background:${PALETTE.water};width:${Math.min(100, saved / 5)}%}
        .saved{font-size:12px;color:${PALETTE.water};margin-top:5px;font-weight:600}
        .done{font-size:14px;color:${PALETTE.ink}}
      </style>
      <div class="card" id="card">
        <div class="row">
          <div>${DUCK(result.duck_state)}</div>
          <div class="bubble">
            <div class="quack">Puddle · quack</div>
            <div class="line">${result.headline || (result.insights[0] && result.insights[0].line) || "That one's fine."}</div>
            ${c ? `<span class="chip">${c}</span>` : ""}
            <div class="btns">
              <button class="buy" id="buy">Buy anyway</button>
              <button class="skip" id="skip">${concerned ? "Skip it" : "Not now"}</button>
            </div>
          </div>
        </div>
        <div class="pond"><div class="fill"></div></div>
        <div class="saved">🪙 $${saved} saved so far</div>
      </div>`;

    voiceCleanup = globalThis.PuddleVoice.attach(shadow, item, total => {
      shadow.querySelector(".fill").style.width = Math.min(100, total / 5) + "%";
      shadow.querySelector(".saved").textContent = `$${total} saved so far`;
    });
    const dismiss = delay => {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => {
        voiceCleanup?.(); voiceCleanup = null;
        host?.remove(); host = null;
      }, delay);
    };
    if (result.speak) speak(result.headline || result.insights[0]?.line || "");

    const skipEvent = crypto.randomUUID();
    shadow.getElementById("skip").onclick = async () => {
      let total;
      try { total = (await send({ type: "record_skip", item, event_id: skipEvent })).pond.saved; }
      catch (error) { shadow.querySelector(".line").textContent = error.message; return; }
      shadow.querySelector(".line").textContent = "Good call. I'll remember this one.";
      shadow.querySelector(".fill").style.width = Math.min(100, total / 5) + "%";
      shadow.querySelector(".saved").textContent = `🪙 $${total} saved so far`;
      dismiss(1600);
    };
    shadow.getElementById("buy").onclick = () => {
      chrome.runtime.sendMessage({ type: "checkout", item }, (res) => {
        shadow.querySelector(".line").innerHTML =
          `<span class="done">Done: ${res.network} ${res.mode === "mock" ? "(sandbox)" : ""}. I'll ask in 30 days whether I was wrong.</span>`;
        shadow.querySelector(".btns").remove();
        dismiss(2600);
      });
    };
  }

  function trigger(raw) {
    if (!raw || raw === lastKey) return;
    lastKey = raw;
    let item;
    try { item = JSON.parse(raw); } catch (e) { return; }
    const hour = item.now_hour != null ? item.now_hour : new Date().getHours();
    chrome.runtime.sendMessage({ type: "score", item, now_hour: hour }, (res) => res && render(res, item));
  }

  const obs = new MutationObserver(() => trigger(document.body.dataset.puddleCheckout));
  obs.observe(document.body, { attributes: true, attributeFilter: ["data-puddle-checkout"] });
  window.addEventListener("pagehide", () => { voiceCleanup?.(); clearTimeout(dismissTimer); });
  // fire if already set on load
  if (document.body.dataset.puddleCheckout) trigger(document.body.dataset.puddleCheckout);
})();
