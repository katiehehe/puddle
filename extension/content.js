// Puddle content script: watches for checkout, then shows the duck.
(function () {
  // The extension ignores the explicitly selected web demo, which has its own panel.
  if (document.body.dataset.puddleMode === "web" && globalThis.chrome?.runtime?.id) return;
  // web/src/styles.css, light cards on warm paper: ink text, duck-yellow accents.
  const PALETTE = {
    ink: "#1d2026", muted: "#6b7280", line: "#e7e3da", track: "#eceadf",
    duck: "#ffd166", beak: "#f1893b",
    good: "#2f8f5b", bad: "#c8493f",
  };

  // The same mascot the app draws: a yellow circle duck, not an emoji.
  const DUCK = `<svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
    <circle cx="32" cy="34" r="20" fill="${PALETTE.duck}"/>
    <circle cx="44" cy="20" r="12" fill="${PALETTE.duck}"/>
    <circle cx="48" cy="17" r="2.2" fill="#23262d"/>
    <path d="M56 21 h9 l-3 5 h-6 z" fill="${PALETTE.beak}"/></svg>`;

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

  // Escaped text with the numbers that matter picked out, meaning prices and
  // percentages get a duck-yellow underline.
  const emph = (text) => esc(text).replace(
    /(\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?%)/g,
    '<u class="hl">$1</u>'
  );

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
    const pond = (await send({ type: "pond" })) || { saved: 0 };
    if (version !== renderVersion) return;
    const c = chip(result);
    const money = result.shopping;
    const advice = result.advice || null;
    // Puddle's own sentences when the brain has them; the old facts otherwise.
    const plain = advice ? advice.reasons.map(r => r.text) : facts(money);
    // The card stays compact: three reasons up front, the rest under "Tell me more".
    const shown = plain.slice(0, 3), rest = plain.slice(3);
    const line = result.headline || ((result.insights || [])[0] || {}).line || "That one's fine.";
    const verdictTone = advice
      ? advice.stance === "for" ? PALETTE.good : advice.stance === "against" ? PALETTE.bad : PALETTE.ink
      : PALETTE.ink;
    const verdictBg = advice
      ? advice.stance === "for" ? "#e7f4ec" : advice.stance === "against" ? "#faecea" : "#f2efe7"
      : "#f2efe7";
    // One event_id per intentional action; the brain dedupes retries on it.
    const skipEvent = crypto.randomUUID();
    const pay = result.payment || null;
    const cardLabel = (p) => p?.card ? `${p.card.network === "VISA" ? "Visa" : esc(p.card.network)} \u2022\u2022\u2022\u2022 ${esc(p.card.last4)}` : "Visa";
    const guardList = (guards) => (guards || []).map(g => `<li>${esc(g)}</li>`).join("");

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:"Outfit",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(320px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;
          background:#fff;color:${PALETTE.ink};border-radius:18px;
          border:1px solid ${PALETTE.line};
          padding:16px 18px;animation:pop .2s ease;
          box-shadow:0 1px 2px rgba(29,32,38,.05),0 12px 32px rgba(29,32,38,.12)}
        @keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .duckhead{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;
          cursor:grab;user-select:none;touch-action:none}
        .duckhead:active{cursor:grabbing}
        .duckhead svg{flex:0 0 auto}
        .duckhead b{color:${PALETTE.muted};font-weight:700}
        .x{margin-left:auto;background:none;border:0;color:${PALETTE.muted};
          font-size:15px;line-height:1;padding:4px;cursor:pointer;border-radius:6px;touch-action:auto}
        .x:hover{color:${PALETTE.ink};background:#f4f1ea}
        .hl{font-weight:700;text-decoration:underline;text-decoration-color:${PALETTE.duck};
          text-decoration-thickness:2.5px;text-underline-offset:2px}
        .verdict{display:inline-block;font-size:15px;font-weight:800;color:${verdictTone};
          background:${verdictBg};border-radius:99px;padding:5px 14px;margin:0 0 12px}
        .line{font-size:14px;line-height:1.5;color:${PALETTE.ink};margin:0 0 10px}
        .chip{display:inline-block;border:1px solid ${PALETTE.line};
          padding:3px 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.muted};margin-bottom:10px;font-weight:700;border-radius:99px}
        .btns{display:flex;gap:8px}
        .btns[hidden]{display:none}
        .btns button{flex:1;padding:11px 0;font-size:14px;font-weight:700;cursor:pointer;
          border-radius:12px;transition:all .15s}
        button:focus-visible{outline:2px solid ${PALETTE.duck};outline-offset:2px}
        .skip{background:${PALETTE.duck};color:${PALETTE.ink};border:0}
        .skip:hover{transform:translateY(-1px)}
        .buy{background:#fff;color:${PALETTE.ink};border:1px solid ${PALETTE.line}}
        .buy:hover{background:#f7f5ef}
        .pond{margin-top:14px;height:6px;background:${PALETTE.track};
          border-radius:99px;overflow:hidden}
        .fill{height:100%;background:${PALETTE.duck};
          width:${pondPct(pond.saved)}%;transition:width .3s ease}
        @media(prefers-reduced-motion:reduce){.card{animation:none}}
        .saved{font-size:11px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.muted};margin-top:6px;font-weight:700}
        .ask{font-size:13px;font-weight:700;color:${PALETTE.ink};margin:12px 0 10px}
        .done{font-size:14px;color:${PALETTE.ink}}
        .checkout-review{border-top:2px solid ${PALETTE.line};margin-top:12px;padding-top:12px}
        .checkout-review h3{font-size:15px;margin:0 0 8px;color:${PALETTE.ink}}
        .checkout-summary{display:grid;grid-template-columns:1fr auto;gap:5px 12px;
          padding:10px;background:#f7f5ef;border-radius:12px;color:${PALETTE.ink}}
        .checkout-summary b{text-align:right}
        .checkout-note,.checkout-status{font-size:12px;line-height:1.45;color:${PALETTE.muted};margin:8px 0}
        .checkout-status{color:${PALETTE.bad}}
        .checkout-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
        .checkout-actions button{padding:10px 12px;border-radius:10px;font-weight:700;cursor:pointer}
        .confirm-purchase{background:${PALETTE.duck};color:${PALETTE.ink};border:0}
        .back-checkout{background:#fff;color:${PALETTE.ink};border:1px solid ${PALETTE.line}}
        .facts{margin:0 0 10px;padding:0;list-style:none}
        .facts li{font-size:13px;line-height:1.5;color:${PALETTE.muted};margin-bottom:4px}
        .cardlinks{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 12px}
        .more,.why{font-size:12px;font-weight:600;color:${PALETTE.muted};
          text-decoration:underline;text-underline-offset:2px}
        .more{background:none;border:none;padding:0;cursor:pointer}
        .why{display:inline-block}
        .nums{display:none;font-size:12px;color:${PALETTE.muted};margin-bottom:10px;line-height:1.6}
        .nums.open{display:block}
        .nums b{color:${PALETTE.ink}}
        .payline{display:flex;align-items:center;justify-content:space-between;gap:8px;
          font-size:11px;color:${PALETTE.muted};margin-top:10px}
        .payline .vmark{font-weight:900;font-style:italic;letter-spacing:-.02em;color:#1a1f71;font-size:13px}
        .payline button{background:none;border:0;padding:0;font-size:11px;font-weight:600;
          color:${PALETTE.muted};text-decoration:underline;text-underline-offset:2px;cursor:pointer}
        .guards{display:none;margin:6px 0 0;padding:0 0 0 14px;font-size:11px;line-height:1.55;color:${PALETTE.muted}}
        .guards.open{display:block}
        .receipt{border:1px solid ${PALETTE.line};border-radius:12px;padding:12px 14px;margin:0 0 10px;
          font-size:12px;line-height:1.6;color:${PALETTE.muted};background:#fbfaf6}
        .receipt .row{display:flex;justify-content:space-between;gap:10px}
        .receipt b{color:${PALETTE.ink}}
        .receipt .ok{color:#1e7f4f;font-weight:700}
        .receipt .no{color:${PALETTE.bad};font-weight:700}
        .receipt .vmark{font-weight:900;font-style:italic;color:#1a1f71;font-size:14px}
        .receipt ul{margin:6px 0 0;padding:0 0 0 14px}
      </style>
      <div class="card" id="card">
        <div class="duckhead">${DUCK}<b>Puddle</b>${result.phrasing?.source === "llm"
          ? `<span class="chip" style="margin:0 0 0 auto" title="${esc(result.headline_math || "")}">said by ${esc(result.phrasing.model)}${result.phrasing.cached ? " · cached" : ""}</span>`
          : ""}
          <button class="x" id="close" aria-label="Close" title="Close">✕</button>
        </div>
        ${advice ? `<div class="verdict">${esc(advice.verdict)}</div>` : ""}
        <div class="line">${emph(line)}</div>
        ${c ? `<span class="chip">${esc(c)}</span>` : ""}
        <ul class="facts">${shown.map(f => `<li>${emph(f)}</li>`).join("")}</ul>
        <div class="ask">Still worth it?</div>
        <div class="cardlinks">
          <button class="more" id="more">Tell me more</button>
          <a class="why" target="_blank" rel="noopener"
             href="${esc(DASHBOARD + encodeURIComponent(item.title || ""))}">See my closet</a>
          <button class="more" id="asktoggle">Ask the duck</button>
        </div>
        <div class="nums" id="nums">
          ${rest.length ? `<ul class="facts">${rest.map(f => `<li>${emph(f)}</li>`).join("")}</ul>` : ""}
          ${money ? `Worth about <b>${esc(cash(money.resale))}</b> resold. ` : ""}
          At 5 wears <b>${esc(cash((money?.per_wear_at || {})[5] || 0))}</b> each,
          at 10 <b>${esc(cash((money?.per_wear_at || {})[10] || 0))}</b>,
          at 20 <b>${esc(cash((money?.per_wear_at || {})[20] || 0))}</b>.
        </div>
        <div id="voiceslot" hidden></div>
        <div class="btns">
          <button class="skip" id="skip">${state === "approving" ? "Not now" : "Skip it"}</button>
          <button class="buy" id="buy">${pay?.blocked ? "Over your cap" : "Buy anyway"}</button>
        </div>
        ${pay ? `<div class="payline"><span><span class="vmark">VISA</span>&nbsp; ${cardLabel(pay)}${pay.blocked ? " \u00b7 " + esc(pay.blocked) : ""}</span><button id="guards">Why this is safe</button></div>
        <ul class="guards" id="guardlist">${guardList(pay.guards)}</ul>` : ""}
        <div class="pond"><div class="fill"></div></div>
        <div class="saved">$${esc(pond.saved)} in the pond</div>
      </div>`;

    const guardsBtn = shadow.getElementById("guards");
    if (guardsBtn) {
      guardsBtn.onclick = () => {
        const open = shadow.getElementById("guardlist").classList.toggle("open");
        guardsBtn.textContent = open ? "Hide" : "Why this is safe";
      };
    }

    const more = shadow.getElementById("more");
    if (more) {
      more.onclick = () => {
        const nums = shadow.getElementById("nums");
        const open = nums.classList.toggle("open");
        more.textContent = open ? "Show less" : "Tell me more";
      };
    }

    voiceCleanup = globalThis.PuddleVoice.attach(shadow, item, total => {
      shadow.querySelector(".fill").style.width = pondPct(total) + "%";
      shadow.querySelector(".saved").textContent = `$${total} in the pond`;
    }, result.prediction_id);
    if (result.speak) speak(line);

    // The voice panel starts tucked away until "Ask the duck" opens it.
    const slot = shadow.getElementById("voiceslot");
    const panelEl = shadow.querySelector(".voice-panel");
    if (slot && panelEl) slot.appendChild(panelEl);
    const askToggle = shadow.getElementById("asktoggle");
    if (askToggle && slot) {
      askToggle.onclick = () => {
        slot.hidden = !slot.hidden;
        askToggle.textContent = slot.hidden ? "Ask the duck" : "Hide the duck";
      };
    }

    const close = () => {
      clearTimeout(dismissTimer);
      dismissTimer = null;
      voiceCleanup?.(); voiceCleanup = null;
      if (host) host.remove();
      host = null;
    };
    shadow.getElementById("close").onclick = close;

    // The card is draggable by its header; it keeps whatever spot it lands on.
    const dragHandle = shadow.querySelector(".duckhead");
    let drag = null;
    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      host.style.left = rect.left + "px";
      host.style.top = rect.top + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
      dragHandle.setPointerCapture(event.pointerId);
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const left = Math.max(0, Math.min(innerWidth - host.offsetWidth, event.clientX - drag.dx));
      const top = Math.max(0, Math.min(innerHeight - host.offsetHeight, event.clientY - drag.dy));
      host.style.left = left + "px";
      host.style.top = top + "px";
    });
    dragHandle.addEventListener("pointerup", () => { drag = null; });
    dragHandle.addEventListener("pointercancel", () => { drag = null; });

    const dismiss = (after) => {
      clearTimeout(dismissTimer);
      dismissTimer = setTimeout(close, after);
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
        </div>
        <p class="checkout-note"><span class="vmark">VISA</span>&nbsp; ${cardLabel(pay)} · Signed intent. No card details are collected by Puddle.</p>
        <p class="checkout-status" role="status">${esc(intent.blocked_reason || "")}</p>
        <div class="checkout-actions">
          <button type="button" class="back-checkout">Back</button>
          <button type="button" class="confirm-purchase" ${intent.checkout_enabled ? "" : "disabled"}>
            ${esc(confirmationLabel)}
          </button>
        </div>`;
      shadow.querySelector(".card").appendChild(review);
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
        shadow.querySelector(".line").innerHTML = declined
          ? `<span class="done">Payment ${esc(res.status || "failed")}: nothing was recorded.</span>`
          : `<span class="done">Bought. It's in your closet now.</span>`;
        const receipt = document.createElement("div");
        receipt.className = "receipt";
        receipt.innerHTML = `
          <div class="row"><span><span class="vmark">VISA</span>&nbsp; ${cardLabel(res)}</span>
            <span class="${declined ? "no" : "ok"}">${declined ? "Declined" : "Approved"}</span></div>
          <div class="row"><span>Amount</span><b>${esc(cash(res.amount ?? item.price))}</b></div>
          <div class="row"><span>Rail</span><b>${esc(res.rail || "Visa Direct")}</b></div>
          ${res.auth_code ? `<div class="row"><span>Auth code</span><b>${esc(res.auth_code)}</b></div>` : ""}
          ${res.token ? `<div class="row"><span>Network token</span><b>${esc(String(res.token).slice(0, 12))}\u2026</b></div>` : ""}
          ${res.receipt?.intent_id ? `<div class="row"><span>Receipt</span><b>${esc(res.receipt.intent_id)}</b></div>` : ""}
          ${declined && res.message ? `<div>${esc(res.message)}</div>` : ""}
          <ul>${guardList(res.guards)}</ul>`;
        review.replaceWith(receipt);
        buttons.remove();
        shadow.querySelector(".payline")?.remove();
        shadow.getElementById("guardlist")?.remove();
        dismiss(declined ? 6000 : 5200);
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
