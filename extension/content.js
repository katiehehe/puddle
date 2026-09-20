// Puddle content script: watches for checkout, then shows the duck.
(function () {
  // The extension ignores the explicitly selected web demo, which has its own panel.
  if (document.body.dataset.puddleMode === "web" && globalThis.chrome?.runtime?.id) return;
  // docs/theme.md — Clay Pond palette, kept in sync with web/src/styles.css.
  const PALETTE = {
    ink: "#332f3a", muted: "#635f69", line: "#b8d4e4",
    duck: "#f2b431", duckDeep: "#8a6408", bill: "#ef7a2c",
    water: "#0ea5e9", waterDeep: "#0369a1", waterLight: "#7dd3fc", ripple: "#b8d9ec", foam: "#e3f1f9",
    good: "#10b981", bad: "#f43f5e", surface: "#ffffff", surfaceHi: "#f0f7fb",
    recessed: "#e2edf5", page: "#eaf2f8"
  };

  // The mascot is the duck emoji; mood rides in a small badge and the card accent.
  const DUCK = (state) => {
    const mark = { curious: "?", concerned: "!", approving: "✓" }[state] || "";
    return `<div class="duckwrap"><span class="duckmoji">🦆</span>${
      mark ? `<span class="mood">${mark}</span>` : ""}</div>`;
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
    globalThis.PuddleSpeech?.speak(text);
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
        .card{width:min(346px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;
          background:linear-gradient(165deg,#fff6dd 0%,#dff0fb 55%,${PALETTE.surface} 100%);
          border-radius:28px;padding:16px 18px;animation:pop .28s ease;
          box-shadow:16px 16px 32px rgba(96,140,170,.3),-10px -10px 24px rgba(255,255,255,.9),
            inset 4px 4px 8px rgba(14,165,233,.05),inset -4px -4px 8px rgba(255,255,255,1),
            inset -4px 0 0 ${accent}}
        @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
        .row{display:flex;gap:12px;align-items:flex-start}
        .duckwrap{position:relative;flex-shrink:0;width:60px;height:60px;border-radius:50%;
          background:linear-gradient(145deg,#ffffff,${PALETTE.foam});
          box-shadow:8px 8px 16px rgba(96,140,170,.3),-6px -6px 12px rgba(255,255,255,.9),
            inset 3px 3px 6px rgba(255,255,255,.6),inset -3px -3px 6px rgba(14,165,233,.08);
          display:flex;align-items:center;justify-content:center}
        .duckmoji{font-size:36px;line-height:1}
        .mood{position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;
          background:${accent};color:#fff;font-size:12px;font-weight:800;
          display:flex;align-items:center;justify-content:center;
          box-shadow:2px 3px 6px rgba(0,0,0,.25),inset 1px 2px 3px rgba(255,255,255,.4)}
        .bubble{flex:1}
        .quack{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:700}
        .line{font-size:15px;line-height:1.45;color:${PALETTE.ink};margin:3px 0 8px}
        .chip{display:inline-block;background:${PALETTE.foam};border-radius:99px;
          padding:4px 12px;font-size:12px;color:${PALETTE.waterDeep};margin-bottom:10px;font-weight:700;
          box-shadow:inset 3px 3px 6px #cddcea,inset -3px -3px 6px #ffffff}
        .btns{display:flex;gap:8px;justify-content:flex-end}
        button{border-radius:16px;padding:9px 15px;font-size:13px;font-weight:700;cursor:pointer;
          border:none;transition:all .2s}
        button:hover{transform:translateY(-2px)}
        button:active{transform:scale(.92);box-shadow:inset 6px 6px 12px rgba(0,0,0,.15),inset -6px -6px 12px rgba(255,255,255,.3)}
        button:focus-visible{outline:3px solid ${PALETTE.water};outline-offset:2px}
        .skip{background:linear-gradient(145deg,${accent},${accent});color:#fff;
          box-shadow:8px 8px 16px rgba(96,140,170,.35),inset 2px 3px 5px rgba(255,255,255,.45),inset -2px -3px 5px rgba(0,0,0,.15)}
        .buy{background:${PALETTE.surface};color:${PALETTE.ink};
          box-shadow:8px 8px 16px rgba(96,140,170,.25),-4px -4px 10px rgba(255,255,255,.9),inset 2px 3px 5px rgba(255,255,255,.8),inset -2px -3px 5px rgba(14,165,233,.08)}
        .pond{margin-top:14px;height:12px;border-radius:99px;background:${PALETTE.recessed};overflow:hidden;
          box-shadow:inset 6px 6px 12px #cddcea,inset -6px -6px 12px #ffffff}
        .fill{height:100%;border-radius:99px;position:relative;
          background:linear-gradient(180deg,${PALETTE.waterLight},${PALETTE.water});
          box-shadow:inset 2px 3px 4px rgba(255,255,255,.6),inset -2px -3px 4px rgba(3,105,161,.4);
          width:${pondPct(pond.saved)}%;transition:width .5s ease}
        @media(prefers-reduced-motion:reduce){.card{animation:none}}
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
