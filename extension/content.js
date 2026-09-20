// Puddle content script: watches for checkout, then shows the duck.
(function () {
  // The extension ignores the explicitly selected web demo, which has its own panel.
  if (document.body.dataset.puddleMode === "web" && globalThis.chrome?.runtime?.id) return;
  // docs/theme.md — Field Guide palette, kept in sync with web/src/styles.css.
  const PALETTE = {
    ink: "#2c2a24", muted: "#8a8270", line: "#cfc5a8",
    duck: "#c98a2b", duckDeep: "#8a5a17", bill: "#b06a28",
    water: "#3e6b8e", waterDeep: "#2f5570", waterTint: "#e7edf1", ripple: "#b9c8cf", foam: "#ece4cf",
    good: "#5b7a4b", bad: "#a63d2f", surface: "#fbf8ee", surfaceHi: "#ece4cf",
    page: "#f6f1e3"
  };

  // The mascot is the duck emoji; mood rides in a small badge and the card accent.
  const DUCK = (state) => {
    const mark = { curious: "?", concerned: "!", approving: "✓" }[state] || "";
    return `<div class="duckwrap"><span class="duckmoji">🦆</span>${
      mark ? `<span class="mood">${mark}</span>` : ""}</div>`;
  };

  // Where the duck's reasoning is shown in full.
  const DASHBOARD = (document.body.dataset.puddleMode === "web" ? "" : "http://localhost:8000")
    + "/dashboard/?item=";

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
      return `you sent back ${i.stat.returned} of ${i.stat.total}${i.stat.size ? ", size " + i.stat.size : ""}`;
    }
    if (i.type === "time_pattern") return `${Math.round((i.stat.return_rate || 0) * 100)}% of late-night buys go back`;
    if (i.type === "redundancy") return `${dupes || i.stat.owned_similar} similar already owned`;
    if (i.type === "coverage_gap") return `nothing else for ${i.stat.state}`;
    if (i.type === "overexposure") return "you have plenty of these";
    return "";
  }

  const cash = (n) => "$" + Number(n).toFixed(2).replace(/\.00$/, "");

  /* The checkout facts, said the way a friend would say them: what you already
   * own, whether this price is normal for you, what it works out to per wear. */
  function facts(shopping) {
    if (!shopping) return [];
    const lines = [];
    if (shopping.owned_count > 0 && shopping.closest) {
      lines.push(
        `You already own ${shopping.owned_count} of these. You've worn your ${shopping.closest.title} ` +
        `${shopping.closest.wears} time${shopping.closest.wears === 1 ? "" : "s"}.`
      );
    }
    if (shopping.typical_price != null && shopping.difference != null) {
      const gap = Math.abs(shopping.difference);
      lines.push(
        gap < 1
          ? `That's about what you usually pay (${shopping.basis}).`
          : `That's ${cash(gap)} ${shopping.difference > 0 ? "below" : "above"} what you usually pay ` +
            `(${shopping.basis}: ${cash(shopping.typical_price)}).`
      );
    }
    const twenty = (shopping.per_wear_at || {})[20];
    if (twenty) lines.push(`Wear it 20 times and it costs ${cash(twenty)} a wear.`);
    return lines;
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
    const money = result.shopping;
    const plain = facts(money);
    const line = result.headline || ((result.insights || [])[0] || {}).line || "That one's fine.";
    // One event_id per intentional action; the brain dedupes retries on it.
    const skipEvent = crypto.randomUUID(), buyEvent = crypto.randomUUID();

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:"Space Grotesk","Outfit",-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(346px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;
          background:${PALETTE.surface};
          padding:16px 18px;animation:pop .2s ease;
          border:1px solid ${PALETTE.ink};border-left:4px solid ${accent}}
        @keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .row{display:flex;gap:12px;align-items:flex-start}
        .duckwrap{position:relative;flex-shrink:0;width:56px;height:56px;border-radius:50%;
          background:${PALETTE.foam};border:1px solid ${PALETTE.ink};
          display:flex;align-items:center;justify-content:center}
        .duckmoji{font-size:34px;line-height:1}
        .mood{position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;
          background:${accent};color:#fff;font-size:12px;font-weight:800;
          display:flex;align-items:center;justify-content:center}
        .bubble{flex:1}
        .quack{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${PALETTE.muted};font-weight:700}
        .line{font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.45;
          color:${PALETTE.ink};margin:3px 0 8px;font-style:italic}
        .chip{display:inline-block;border:1px solid ${PALETTE.waterDeep};
          padding:3px 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.waterDeep};margin-bottom:10px;font-weight:700}
        .btns{display:flex;gap:8px;justify-content:flex-end}
        button{padding:9px 14px;font-size:10px;font-weight:700;cursor:pointer;
          text-transform:uppercase;letter-spacing:.08em;border:1px solid ${PALETTE.ink};
          transition:all .15s}
        button:focus-visible{outline:2px solid ${PALETTE.water};outline-offset:2px}
        .skip{background:${accent};border-color:${accent};color:#fff}
        .buy{background:transparent;color:${PALETTE.ink}}
        .buy:hover{background:${PALETTE.foam}}
        .pond{margin-top:14px;height:10px;background:${PALETTE.page};
          border:1px solid ${PALETTE.ink};overflow:hidden}
        .fill{height:100%;background:${PALETTE.water};
          width:${pondPct(pond.saved)}%;transition:width .3s ease}
        @media(prefers-reduced-motion:reduce){.card{animation:none}}
        .saved{font-size:11px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.water};margin-top:6px;font-weight:700}
        .ask{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
          color:${PALETTE.muted};margin-bottom:8px}
        .done{font-size:14px;color:${PALETTE.ink};font-style:normal}
        .facts{margin:0 0 10px;padding:0;list-style:none}
        .facts li{font-family:Georgia,"Times New Roman",serif;font-style:italic;
          font-size:13px;line-height:1.45;color:${PALETTE.muted};margin-bottom:4px}
        .more,.why{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.waterDeep};text-decoration:underline;text-underline-offset:2px}
        .more{display:block;background:none;border:none;padding:0 0 10px;cursor:pointer}
        .why{display:inline-block;margin-bottom:10px}
        .nums{display:none;font-size:12px;color:${PALETTE.muted};margin-bottom:10px;line-height:1.6}
        .nums.open{display:block}
        .nums b{color:${PALETTE.ink}}
      </style>
      <div class="card" id="card">
        <div class="row">
          ${DUCK(state)}
          <div class="bubble">
            <div class="quack">Quant Quack</div>
            <div class="line">${esc(line)}</div>
            ${c ? `<span class="chip">${esc(c)}</span>` : ""}
            <ul class="facts">${plain.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
            <div class="ask">Still worth it?</div>
            <button class="more" id="more">Show the numbers</button>
            <div class="nums" id="nums">
              ${money ? `Worth about <b>${esc(cash(money.resale))}</b> resold. ` : ""}
              At 5 wears <b>${esc(cash((money?.per_wear_at || {})[5] || 0))}</b> each,
              at 10 <b>${esc(cash((money?.per_wear_at || {})[10] || 0))}</b>,
              at 20 <b>${esc(cash((money?.per_wear_at || {})[20] || 0))}</b>.
            </div>
            <a class="why" target="_blank" rel="noopener"
               href="${esc(DASHBOARD + encodeURIComponent(item.title || ""))}">See my closet</a>
            <div class="btns">
              <button class="buy" id="buy">Buy anyway</button>
              <button class="skip" id="skip">${state === "approving" ? "Not now" : "Skip it"}</button>
            </div>
          </div>
        </div>
        <div class="pond"><div class="fill"></div></div>
        <div class="saved">$${esc(pond.saved)} in the pond</div>
      </div>`;

    const more = shadow.getElementById("more");
    if (more) {
      more.onclick = () => {
        const nums = shadow.getElementById("nums");
        const open = nums.classList.toggle("open");
        more.textContent = open ? "Hide the numbers" : "Show the numbers";
      };
    }

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
      shadow.querySelector(".line").textContent = "Skipped. That money's in your pond.";
      shadow.querySelector(".fill").style.width = pondPct(next.saved) + "%";
      shadow.querySelector(".saved").textContent = `$${next.saved} in the pond`;
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
        : `<span class="done">Bought${res.mode === "mock" ? " (simulated)" : ""}. It's in your closet now.</span>`;
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
  const BUY_WORDS =
    /\b(check ?out|buy|add to (bag|cart|basket)|place (your )?order|complete (your )?(order|purchase)|pay now|purchase)\b/i;

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
