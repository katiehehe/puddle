// Puddle content script: watches for checkout, then shows the duck.
(function () {
  // The extension ignores the explicitly selected web demo, which has its own panel.
  if (document.body.dataset.puddleMode === "web" && globalThis.chrome?.runtime?.id) return;
  // docs/theme.md — Flat Pond palette, kept in sync with web/src/styles.css.
  const PALETTE = {
    ink: "#111827", muted: "#6b7280", line: "#e5e7eb",
    duck: "#f2b431", duckDeep: "#92600a", bill: "#ef7a2c",
    water: "#3b82f6", waterDeep: "#2563eb", waterTint: "#eff6ff", ripple: "#c7d8ea", foam: "#f3f4f6",
    good: "#10b981", bad: "#ef4444", surface: "#ffffff", surfaceHi: "#f3f4f6",
    page: "#f3f4f6"
  };

  // The mascot is the duck emoji; mood rides in a small badge and the card accent.
  const DUCK = (state) => {
    const mark = { curious: "?", concerned: "!", approving: "✓" }[state] || "";
    return `<div class="duckwrap"><span class="duckmoji">🦆</span>${
      mark ? `<span class="mood">${mark}</span>` : ""}</div>`;
  };

  const HEADER = {
    idle: "Puddle", curious: "Hmm",
    concerned: "Quack", approving: "Go on then",
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
      return `returned ${i.stat.returned}/${i.stat.total}${i.stat.size ? ", size " + i.stat.size : ""}`;
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
    const skipEvent = crypto.randomUUID();

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:"Outfit",-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(346px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;
          background:${PALETTE.surface};
          border-radius:0 8px 8px 0;padding:16px 18px;animation:pop .2s ease;
          border-left:8px solid ${accent};outline:2px solid ${PALETTE.line}}
        @keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .row{display:flex;gap:12px;align-items:flex-start}
        .duckwrap{position:relative;flex-shrink:0;width:56px;height:56px;border-radius:50%;
          background:${PALETTE.duck};
          display:flex;align-items:center;justify-content:center}
        .duckmoji{font-size:34px;line-height:1}
        .mood{position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;
          background:${accent};color:#fff;font-size:12px;font-weight:800;
          display:flex;align-items:center;justify-content:center}
        .bubble{flex:1}
        .quack{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${PALETTE.muted};font-weight:700}
        .line{font-size:15px;line-height:1.45;color:${PALETTE.ink};margin:3px 0 8px;font-weight:500}
        .chip{display:inline-block;background:${PALETTE.waterTint};border-radius:99px;
          padding:4px 12px;font-size:12px;color:${PALETTE.waterDeep};margin-bottom:10px;font-weight:700}
        .btns{display:flex;gap:8px;justify-content:flex-end}
        button{border-radius:6px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;
          border:none;transition:all .2s}
        button:hover{transform:scale(1.05)}
        button:active{transform:scale(.97)}
        button:focus-visible{outline:3px solid ${PALETTE.water};outline-offset:2px}
        .skip{background:${accent};color:#fff}
        .buy{background:${PALETTE.foam};color:${PALETTE.ink}}
        .buy:hover{background:${PALETTE.line}}
        .pond{margin-top:14px;height:10px;border-radius:6px;background:${PALETTE.line};overflow:hidden}
        .fill{height:100%;background:${PALETTE.water};
          width:${pondPct(pond.saved)}%;transition:width .3s ease}
        @media(prefers-reduced-motion:reduce){.card{animation:none}}
        .saved{font-size:12px;color:${PALETTE.water};margin-top:5px;font-weight:600}
        .done{font-size:14px;color:${PALETTE.ink}}
        .checkout-review{border-top:2px solid ${PALETTE.line};margin-top:12px;padding-top:12px}
        .checkout-review h3{font-size:15px;margin:0 0 8px;color:${PALETTE.ink}}
        .checkout-summary{display:grid;grid-template-columns:1fr auto;gap:5px 12px;
          padding:10px;background:${PALETTE.surfaceHi};border-radius:6px;color:${PALETTE.ink}}
        .checkout-summary b{text-align:right}
        .checkout-note,.checkout-status{font-size:12px;line-height:1.45;color:${PALETTE.muted};margin:8px 0}
        .checkout-status{color:${PALETTE.bad}}
        .checkout-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
        .confirm-purchase{background:${PALETTE.waterDeep};color:#fff}
        .back-checkout{background:${PALETTE.foam};color:${PALETTE.ink}}
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
        <div class="saved">$${esc(pond.saved)} in the pond</div>
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
      shadow.querySelector(".line").textContent = "Skipped. Added to the pond.";
      shadow.querySelector(".fill").style.width = pondPct(next.saved) + "%";
      shadow.querySelector(".saved").textContent = `$${next.saved} in the pond`;
      shadow.querySelector(".btns").remove();
      dismiss(2000);
    };

    shadow.getElementById("buy").onclick = async () => {
      const buy = shadow.getElementById("buy");
      buy.disabled = true;
      buy.textContent = "Preparing checkout";
      let intent;
      try {
        intent = await send({
          type: "payment_intent", item, prediction_id: result.prediction_id, budget_limit: 500
        });
      } catch (error) {
        buy.disabled = false;
        buy.textContent = "Buy anyway";
        shadow.querySelector(".line").textContent = error.message;
        return;
      }
      if (version !== renderVersion) return;
      const buttons = shadow.querySelector(".btns");
      buttons.hidden = true;
      const provider = intent.provider || {};
      const confirmationLabel = provider.simulated ? "Confirm simulated purchase" : "Confirm Visa sandbox purchase";
      const review = document.createElement("section");
      review.className = "checkout-review";
      review.setAttribute("role", "region");
      review.setAttribute("aria-labelledby", "secure-checkout-title");
      review.innerHTML = `
        <h3 id="secure-checkout-title">Secure checkout</h3>
        <div class="checkout-summary">
          <span>${esc(intent.item.title)}</span><b>$${esc(Number(intent.amount).toFixed(2))}</b>
          <span>Payment</span><b>${esc(provider.label || "Unavailable")}</b>
          <span>Limit</span><b>$${esc(Number(intent.budget_limit).toFixed(2))}</b>
        </div>
        <p class="checkout-note">Signed intent. No card details are collected by Puddle.</p>
        <p class="checkout-status" role="status">${esc(intent.blocked_reason || "")}</p>
        <div class="checkout-actions">
          <button type="button" class="back-checkout">Back</button>
          <button type="button" class="confirm-purchase" ${intent.checkout_enabled ? "" : "disabled"}>
            ${esc(confirmationLabel)}
          </button>
        </div>`;
      shadow.querySelector(".bubble").appendChild(review);
      const back = review.querySelector(".back-checkout");
      const confirm = review.querySelector(".confirm-purchase");
      const status = review.querySelector(".checkout-status");
      back.onclick = () => {
        review.remove();
        buttons.hidden = false;
        buy.disabled = false;
        buy.textContent = "Buy anyway";
      };
      confirm.onclick = async () => {
        confirm.disabled = true;
        back.disabled = true;
        status.textContent = "Processing checkout.";
        let res;
        try { res = await send({ type: "confirm_payment_intent", token: intent.token }); }
        catch (error) {
          if (version !== renderVersion) return;
          status.textContent = error.message;
          confirm.disabled = false;
          back.disabled = false;
          return;
        }
        if (version !== renderVersion) return;
        const declined = res.approved === false || (res.status && res.status !== "approved");
        const receipt = res.receipt || {};
        shadow.querySelector(".line").textContent = declined
          ? `Payment ${res.status || "failed"}. Nothing was recorded.`
          : `${receipt.simulated ? "Simulated Visa purchase approved" : "Visa sandbox purchase approved"}. ` +
            `Added to your closet. Receipt ${receipt.intent_id || "recorded"}.`;
        review.remove();
        buttons.remove();
        if (!declined) dismiss(3200);
      };
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
