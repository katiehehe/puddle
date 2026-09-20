// Puddle content script: watches for checkout, then shows the duck.
(function () {
  // The extension ignores the explicitly selected web demo, which has its own panel.
  if (document.body.dataset.puddleMode === "web" && globalThis.chrome?.runtime?.id) return;
  const PALETTE = {
    ink: "#16191c", muted: "#5d6771", line: "#e4e8ec",
    duck: "#f2b431", bill: "#ef7a2c", water: "#2a7fb8", good: "#0d7a4a", bad: "#b3261e", surface: "#ffffff"
  };

  // One duck, four moods. Eyes and brow carry the whole expression.
  const DUCK = (state) => {
    const face = {
      idle: {
        eye: '<circle cx="64" cy="46" r="3.1" fill="#16191c"/>',
        brow: "",
      },
      curious: {
        eye: '<circle cx="65" cy="45" r="3.3" fill="#16191c"/>',
        brow: '<path d="M58 36 q7 -4 13 -1" stroke="#a97c12" stroke-width="3" fill="none" stroke-linecap="round"/>',
      },
      concerned: {
        eye: '<circle cx="64" cy="47" r="3.4" fill="#16191c"/>',
        brow: '<path d="M57 34 l13 6" stroke="#a97c12" stroke-width="3" fill="none" stroke-linecap="round"/>',
      },
      approving: {
        eye: '<path d="M60 47 q4.5 -5 9 0" stroke="#16191c" stroke-width="3" fill="none" stroke-linecap="round"/>',
        brow: "",
      },
    }[state] || { eye: '<circle cx="64" cy="46" r="3.1" fill="#16191c"/>', brow: "" };

    return `<svg width="74" height="74" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="96" rx="34" ry="7" fill="#dceaf4"/>
      <ellipse cx="55" cy="93" rx="22" ry="4" fill="#bcdcef"/>
      <ellipse cx="38" cy="66" rx="17" ry="14" fill="#e3a521"/>
      <circle cx="56" cy="60" r="30" fill="${PALETTE.duck}"/>
      <circle cx="62" cy="44" r="21" fill="${PALETTE.duck}"/>
      <circle cx="52" cy="53" r="5" fill="#f7c95e" opacity=".55"/>
      <circle cx="73" cy="52" r="4.2" fill="#f08a8a" opacity=".5"/>
      ${face.brow}
      ${face.eye}
      <path d="M80 47 q14 2 13 7 q-1 5 -13 5 z" fill="${PALETTE.bill}"/>
    </svg>`;
  };

  const HEADER = {
    idle: "Puddle", curious: "Puddle · hmm",
    concerned: "Puddle · quack", approving: "Puddle · go on then",
  };

  let host = null, shadow = null, lastKey = "", dismissTimer = null, voiceCleanup = null, renderVersion = 0, scoreVersion = 0;

  function ensureHost() {
    // A new checkout cancels the previous card's pending dismissal.
    clearTimeout(dismissTimer);
    dismissTimer = null;
    if (host) return;
    host = document.createElement("div");
    host.id = "puddle-root";
    host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
  }

  // Anything that reaches innerHTML has passed through page-controlled data:
  // the brain echoes item titles, sizes and gap labels back inside its lines,
  // and once the duck reads items off a real storefront, that text is written
  // by whoever owns the page. Escape at the sink, not at the source.
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));

  function chip(result) {
    const i = (result.insights || [])[0];
    if (!i) return "";
    const dupes = ((result.portfolio || {}).redundant_with || []).length;
    if (i.type === "return_pattern") {
      return `returned ${i.stat.returned}/${i.stat.total}${i.stat.size ? " · size " + i.stat.size : ""}`;
    }
    if (i.type === "time_pattern") return `${Math.round((i.stat.return_rate || 0) * 100)}% returned this late`;
    if (i.type === "redundancy") return `${dupes || i.stat.owned_similar} similar owned`;
    if (i.type === "coverage_gap") return `covers ${i.stat.state}`;
    if (i.type === "overexposure") return "over-concentrated";
    return "";
  }

  const send = msg => globalThis.PuddleSend(msg);

  function speak(text) {
    try {
      // Fallback TTS. Production: ElevenLabs stream (eleven_flash_v2_5).
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.15;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }

  const pondPct = (saved) => Math.min(100, (saved / 800) * 100);

  async function render(result, item) {
    const version = ++renderVersion;
    voiceCleanup?.();
    ensureHost();
    const state = result.duck_state || "idle";
    const accent = state === "concerned" ? PALETTE.bad : state === "approving" ? PALETTE.good : PALETTE.water;
    const pond = (await send({ type: "pond" })) || { saved: 0 };
    if (version !== renderVersion) return;
    const c = chip(result);
    const line = result.headline || ((result.insights || [])[0] || {}).line || "That one's fine.";
    // One event_id per intentional action; the brain dedupes retries on it.
    const skipEvent = crypto.randomUUID(), buyEvent = crypto.randomUUID();

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(346px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;background:${PALETTE.surface};border:1px solid ${PALETTE.line};
          border-left:4px solid ${accent};border-radius:16px;padding:14px 16px;
          box-shadow:0 10px 28px rgba(20,25,28,.16);animation:pop .28s ease}
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
        .fill{height:100%;background:${PALETTE.water};width:${pondPct(pond.saved)}%;transition:width .5s ease}
        .saved{font-size:12px;color:${PALETTE.water};margin-top:5px;font-weight:600}
        .done{font-size:14px;color:${PALETTE.ink}}
      </style>
      <div class="card" id="card">
        <div class="row">
          <div>${DUCK(state)}</div>
          <div class="bubble">
            <div class="quack">${esc(HEADER[state] || "Puddle")}</div>
            <div class="line">${esc(line)}</div>
            ${c ? `<span class="chip">${esc(c)}</span>` : ""}
            <div class="btns">
              <button class="buy" id="buy">Buy anyway</button>
              <button class="skip" id="skip">${state === "approving" ? "Not now" : "Skip it"}</button>
            </div>
          </div>
        </div>
        <div class="pond"><div class="fill"></div></div>
        <div class="saved">🪙 $${esc(pond.saved)} in the pond</div>
      </div>`;

    voiceCleanup = globalThis.PuddleVoice.attach(shadow, item, total => {
      shadow.querySelector(".fill").style.width = pondPct(total) + "%";
      shadow.querySelector(".saved").textContent = `$${total} in the pond`;
    }, result.prediction_id);
    if (result.speak) speak(line);

    const dismiss = (after) => {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => {
        voiceCleanup?.(); voiceCleanup = null;
        if (host) host.remove();
        host = null;
        dismissTimer = null;
      }, after);
    };

    shadow.getElementById("skip").onclick = async () => {
      let next;
      try { next = await send({ type: "skip", item, prediction_id: result.prediction_id, event_id: skipEvent }); }
      catch (error) { shadow.querySelector(".line").textContent = error.message; return; }
      if (version !== renderVersion) return;
      shadow.querySelector(".line").textContent = "Skipped. Your saved total has been updated.";
      shadow.querySelector(".fill").style.width = pondPct(next.saved) + "%";
      shadow.querySelector(".saved").textContent = `🪙 $${next.saved} in the pond`;
      shadow.querySelector(".btns").remove();
      dismiss(2000);
    };

    shadow.getElementById("buy").onclick = async () => {
      let res;
      try { res = await send({ type: "checkout", item, prediction_id: result.prediction_id, event_id: buyEvent }); }
      catch (error) { shadow.querySelector(".line").textContent = error.message; return; }
      if (version !== renderVersion) return;
      const declined = res.approved === false || (res.status && res.status !== "approved");
      shadow.querySelector(".line").innerHTML = declined
        ? `<span class="done">Payment ${esc(res.status || "failed")}: nothing was recorded.</span>`
        : `<span class="done">Done: ${esc(res.network)} ${res.mode === "mock" ? "(simulated)" : ""}. ` +
          `Your wardrobe has been updated.</span>`;
      shadow.querySelector(".btns").remove();
      dismiss(2600);
    };
  }

  function trigger(raw) {
    if (!raw) {
      scoreVersion += 1; renderVersion += 1; lastKey = "";
      clearTimeout(dismissTimer); voiceCleanup?.(); voiceCleanup = null;
      host?.remove(); host = null;
      return;
    }
    if (raw === lastKey) return;
    const requestVersion = ++scoreVersion;
    lastKey = raw;
    let item;
    try { item = JSON.parse(raw); } catch (e) { return; }
    const hour = item.now_hour != null ? item.now_hour : new Date().getHours();
    send({ type: "score", item, now_hour: hour }).then((res) => requestVersion === scoreVersion && res && render(res, item)).catch(error => {
      ensureHost(); shadow.textContent = error.message;
    });
  }

  const obs = new MutationObserver(() => trigger(document.body.dataset.puddleCheckout));
  obs.observe(document.body, { attributes: true, attributeFilter: ["data-puddle-checkout"] });
  window.addEventListener("pagehide", () => { voiceCleanup?.(); clearTimeout(dismissTimer); });
  // fire if already set on load
  if (document.body.dataset.puddleCheckout) trigger(document.body.dataset.puddleCheckout);

  /* --- reading a shop that never agreed to be read ------------------------
   *
   * The dataset attribute above is a shop opting in. Everywhere else the duck
   * has to notice checkout itself: watch for a click on something that reads
   * like a buy button, then extract the product from the page.
   *
   * Listening is passive and capture-phase. The click is never intercepted,
   * defaultPrevented is never set, and the page's own handler runs exactly as
   * it would with the extension uninstalled -- the duck is a bystander that
   * speaks up, not a gate. PRD 8.1: never blocks, one tap overrules.
   */
  const BUY_WORDS = /\b(check ?out|buy|add to (bag|cart)|place order|pay|purchase)\b/i;

  function looksLikeCheckout(element) {
    const control = element.closest?.(
      "button, a, input[type='submit'], [role='button'], [class*='checkout' i], [id*='checkout' i]"
    );
    if (!control) return false;
    const label = [
      control.getAttribute?.("aria-label"),
      control.value,
      control.textContent,
      control.getAttribute?.("name"),
      control.id,
      control.className,
    ].filter(Boolean).join(" ");
    return BUY_WORDS.test(label);
  }

  document.addEventListener("click", (event) => {
    if (!event.isTrusted || !looksLikeCheckout(event.target)) return;
    // Capture runs before the page's own handler, so a shop that sets the
    // attribute has not set it yet. Yield once and let it: an opted-in shop
    // describes its product better than we can infer it, and scoring both
    // ways would render the card twice.
    setTimeout(() => {
      if (document.body.dataset.puddleCheckout) return;
      const item = globalThis.PuddleExtract?.();
      // No readable product means no opinion. A duck that guesses on a
      // homepage is worse than a duck that stays quiet.
      if (!item) return;
      trigger(JSON.stringify({ ...item, _t: Date.now() }));
    }, 0);
  }, true);
})();
