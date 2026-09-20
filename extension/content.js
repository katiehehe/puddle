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
  // Set only on a storefront that never opted in: the product the page is
  // showing, and what the brain already said about it. See the bootstrap below.
  let pageItem = null, pageResult = null;

  function ensureHost() {
    // A new checkout cancels the previous card's pending dismissal.
    clearTimeout(dismissTimer);
    dismissTimer = null;
    if (host) return;
    host = document.createElement("div");
    host.id = "puddle-root";
    // Parked on a product page the duck sits top-right, clear of the sticky
    // footers and support widgets that crowd the bottom of a storefront.
    host.style.cssText = `position:fixed;${pageItem ? "top" : "bottom"}:20px;right:20px;z-index:2147483647;`;
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

  /* The duck parked on a product page, before anyone has clicked anything.
   *
   * On a real storefront the buy button submits a form, so a card drawn in
   * response to that click dies with the page that drew it -- the verdict is
   * on screen for a few hundred milliseconds and then gone. So on a page the
   * shop never prepared for us, the duck scores the item up front and waits as
   * a button instead. A dot means it has an opinion; the card opens on a click
   * and stays open, because the product page is not going anywhere. */
  function renderLauncher() {
    if (!pageResult) return;
    voiceCleanup?.(); voiceCleanup = null;
    ensureHost();
    // The dot is the whole "speaks up uninvited" budget on a page we were not
    // invited onto: present whenever there is a verdict, coloured by which way
    // it leans, so a glance is worth something before the click.
    const stance = pageResult.advice?.stance;
    const dotColor = { for: PALETTE.good, against: PALETTE.bad, think: PALETTE.beak }[stance];
    shadow.innerHTML = `
      <style>
        .launch{width:52px;height:52px;border-radius:50%;border:1px solid ${PALETTE.line};
          background:#fff;cursor:pointer;display:grid;place-items:center;position:relative;
          padding:0;animation:pop .2s ease;transition:transform .15s;
          box-shadow:0 1px 2px rgba(29,32,38,.05),0 8px 24px rgba(29,32,38,.14)}
        .launch:hover{transform:translateY(-2px)}
        .launch:focus-visible{outline:2px solid ${PALETTE.duck};outline-offset:2px}
        @keyframes pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){.launch{animation:none}}
        .dot{position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;
          border:2px solid #fff;background:${dotColor || PALETTE.muted}}
      </style>
      <button class="launch" title="${esc(pageResult.advice?.verdict || "Puddle")}"
              aria-label="Puddle on this item: ${esc(pageResult.advice?.verdict || "no verdict yet")}">
        ${DUCK}${dotColor ? `<span class="dot"></span>` : ""}
      </button>`;
    shadow.querySelector(".launch").onclick = () => render(pageResult, pageItem);
  }

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
    // The card stays compact: verdict and one line up front, every reason under "Tell me more".
    const line = result.headline || ((result.insights || [])[0] || {}).line || "That one's fine.";
    // Traffic light: green go, yellow maybe, red skip.
    const light = advice
      ? advice.stance === "for" ? { fg: "#1e7f4f", bg: "#e3f5ea" }
        : advice.stance === "against" ? { fg: "#b3261e", bg: "#fbe7e5" }
        : { fg: "#8a6100", bg: "#fff1c2" }
      : { fg: PALETTE.ink, bg: "#f2efe7" };
    // One event_id per intentional action; the brain dedupes retries on it.
    const skipEvent = crypto.randomUUID();
    const pay = result.payment || null;
    const cardLabel = (p) => p?.card ? `${p.card.network === "VISA" ? "Visa" : esc(p.card.network)} \u2022\u2022\u2022\u2022 ${esc(p.card.last4)}` : "Visa";
    const guardList = (guards) => (guards || []).map(g => `<li>${esc(g)}</li>`).join("");
    // Checkout reads like the real thing: the API's "Visa Direct (simulated)"
    // and "Visa sandbox simulation" show as plain "Visa Direct". The simulated
    // flag itself stays in the payload; only the wording is dressed up.
    const real = (s) => String(s ?? "")
      .replace(/\s*\(simulated\)/gi, "")
      .replace(/\bsandbox simulation\b/gi, "Direct")
      .replace(/\bsandbox\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:"Outfit",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
        .card{width:min(320px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;
          background:#fff;color:${PALETTE.ink};border-radius:10px;
          border:1px solid ${PALETTE.line};
          padding:16px 18px;animation:pop .2s ease;
          box-shadow:0 1px 2px rgba(29,32,38,.05),0 12px 32px rgba(29,32,38,.12)}
        @keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        .card>*{animation:rise .45s cubic-bezier(.2,.7,.2,1) both}
        .card>:nth-child(2){animation-delay:.08s}.card>:nth-child(3){animation-delay:.18s}
        .card>:nth-child(4){animation-delay:.28s}.card>:nth-child(5){animation-delay:.36s}
        .card>:nth-child(6){animation-delay:.42s}.card>:nth-child(7){animation-delay:.48s}
        .card>:nth-child(n+8){animation-delay:.54s}
        .duckhead{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;
          cursor:grab;user-select:none;touch-action:none}
        .duckhead:active{cursor:grabbing}
        .duckhead b{color:${PALETTE.muted};font-weight:700}
        .x{margin-left:auto;background:none;border:0;color:${PALETTE.muted};
          font-size:15px;line-height:1;padding:4px;cursor:pointer;border-radius:6px;touch-action:auto}
        .x:hover{color:${PALETTE.ink};background:#f4f1ea}
        .hl{font-weight:700;text-decoration:underline;text-decoration-color:${PALETTE.duck};
          text-decoration-thickness:2.5px;text-underline-offset:2px}
        .card{border-top:5px solid ${light.fg}}
        .verdict{display:inline-block;font-size:16px;font-weight:800;color:${light.fg};
          background:${light.bg};border-radius:6px;padding:6px 12px;margin:0 0 12px}
        .line{font-size:14px;line-height:1.5;color:${PALETTE.ink};margin:0 0 10px}
        .chip{display:inline-block;border:1px solid ${PALETTE.line};
          padding:3px 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.muted};margin-bottom:10px;font-weight:700;border-radius:6px}
        .btns{display:flex;gap:8px}
        .btns[hidden]{display:none}
        .btns button{flex:1;padding:11px 0;font-size:14px;font-weight:700;cursor:pointer;
          border-radius:8px;transition:all .15s}
        button:focus-visible{outline:2px solid ${PALETTE.duck};outline-offset:2px}
        .skip{background:${PALETTE.duck};color:${PALETTE.ink};border:0}
        .skip:hover{transform:translateY(-1px)}
        .buy{background:#fff;color:${PALETTE.ink};border:1px solid ${PALETTE.line}}
        .buy:hover{background:#f7f5ef}
        .pond{margin-top:14px;height:6px;background:${PALETTE.track};
          border-radius:99px;overflow:hidden}
        .fill{height:100%;background:${PALETTE.duck};
          width:${pondPct(pond.saved)}%;transition:width .3s ease}
        @media(prefers-reduced-motion:reduce){.card,.card>*{animation:none}}
        .saved{font-size:11px;letter-spacing:.08em;text-transform:uppercase;
          color:${PALETTE.muted};margin-top:6px;font-weight:700}
        .ask{font-size:13px;font-weight:700;color:${PALETTE.ink};margin:12px 0 10px}
        .done{font-size:14px;color:${PALETTE.ink}}
        .payoverlay{position:fixed;inset:0;background:rgba(23,25,28,.45);
          display:flex;align-items:center;justify-content:center;animation:pop .2s ease}
        .paymodal{background:#fff;border-radius:18px;width:min(400px,calc(100vw - 48px));
          padding:20px 22px;box-shadow:0 12px 48px rgba(29,32,38,.28);color:${PALETTE.ink}}
        .payhead{display:flex;align-items:center;gap:10px;margin-bottom:14px}
        .payhead b{font-size:16px;font-weight:800}
        .payhead .vmark{font-weight:900;font-style:italic;letter-spacing:-.02em;color:#1a1f71;font-size:15px}
        .payx{margin-left:auto;background:none;border:0;color:${PALETTE.muted};
          font-size:15px;line-height:1;padding:4px;cursor:pointer;border-radius:6px}
        .payx:hover{color:${PALETTE.ink};background:#f4f1ea}
        .paysum{display:grid;grid-template-columns:1fr auto;gap:6px 14px;
          padding:12px 14px;background:#f7f5ef;border-radius:12px;font-size:14px}
        .paysum b{text-align:right}
        .paynote,.paystatus{font-size:12px;line-height:1.45;color:${PALETTE.muted};margin:10px 0 0}
        .paystatus{color:${PALETTE.bad}}
        .paybtns{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
        .paybtns button{padding:11px 16px;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer}
        .payconfirm{background:${PALETTE.duck};color:${PALETTE.ink};border:0}
        .payconfirm:disabled{opacity:.45;cursor:default}
        .payback{background:#fff;color:${PALETTE.ink};border:1px solid ${PALETTE.line}}
        .payreceipt .row{display:flex;justify-content:space-between;gap:12px;
          padding:8px 0;border-bottom:1px solid ${PALETTE.line};font-size:13px;color:${PALETTE.muted}}
        .payreceipt .row:last-of-type{border-bottom:0}
        .payreceipt b{color:${PALETTE.ink}}
        .payreceipt .ok{color:${PALETTE.good};font-weight:800}
        .payreceipt .no{color:${PALETTE.bad};font-weight:800}
        .payreceipt ul{margin:10px 0 0;padding:0 0 0 16px;font-size:12px;line-height:1.6;color:${PALETTE.muted}}
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
      </style>
      <div class="card" id="card">
        <div class="duckhead">${DUCK}<b>Puddle</b>
          <button class="x" id="close" aria-label="Close" title="Close">✕</button>
        </div>
        ${advice ? `<div class="verdict">${esc(advice.verdict)}</div>` : ""}
        <div class="line">${emph(line)}</div>
        <div class="cardlinks">
          <button class="more" id="more">Tell me more</button>
          <a class="why" target="_blank" rel="noopener"
             href="${esc(DASHBOARD + encodeURIComponent(item.title || ""))}">See my closet</a>
          <button class="more" id="asktoggle">Ask the duck</button>
        </div>
        <div class="nums" id="nums">
          ${c ? `<span class="chip">${esc(c)}</span>` : ""}
          ${plain.length ? `<ul class="facts">${plain.map(f => `<li>${emph(f)}</li>`).join("")}</ul>` : ""}
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
      // On a parked product page the duck folds back into its button: the item
      // is still on screen, so the verdict stays one click away.
      if (pageResult) return renderLauncher();
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
      buy.disabled = false;
      buy.textContent = "Buy anyway";
      const buttons = shadow.querySelector(".btns");
      const provider = intent.provider || {};
      const confirmationLabel = "Pay $" + Number(intent.amount).toFixed(2);
      // The Visa step is its own modal — the duck card stays put underneath.
      const overlay = document.createElement("div");
      overlay.className = "payoverlay";
      overlay.innerHTML = `
        <div class="paymodal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <div class="payhead">
            <span class="vmark">VISA</span><b id="pay-title">Secure checkout</b>
            <button class="payx" aria-label="Cancel" title="Cancel">✕</button>
          </div>
          <div class="paysum">
            <span>${esc(intent.item.title)}</span><b>$${esc(Number(intent.amount).toFixed(2))}</b>
            <span>Payment</span><b>${esc(real(provider.label) || "Unavailable")}</b>
            <span>Card</span><b>${cardLabel(pay)}</b>
          </div>
          <p class="paynote">Signed intent. No card details are collected by Puddle.</p>
          <p class="paystatus" role="status">${esc(intent.blocked_reason || "")}</p>
          <div class="paybtns">
            <button type="button" class="payback">Back</button>
            <button type="button" class="payconfirm" ${intent.checkout_enabled ? "" : "disabled"}>
              ${esc(confirmationLabel)}
            </button>
          </div>
        </div>`;
      shadow.appendChild(overlay);
      const closeOverlay = () => overlay.remove();
      overlay.querySelector(".payx").onclick = closeOverlay;
      overlay.querySelector(".payback").onclick = closeOverlay;
      overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };
      const confirm = overlay.querySelector(".payconfirm");
      const back = overlay.querySelector(".payback");
      const status = overlay.querySelector(".paystatus");
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
        // The modal becomes the receipt; the card closes behind it.
        overlay.querySelector(".paymodal").innerHTML = `
          <div class="payhead">
            <span class="vmark">VISA</span><b>${declined ? "Declined" : "Approved"}</b>
            <button class="payx" aria-label="Close" title="Close">✕</button>
          </div>
          <div class="payreceipt">
            <div class="row"><span>Card</span><b>${cardLabel(res)}</b></div>
            <div class="row"><span>Amount</span><b>${esc(cash(res.amount ?? item.price))}</b></div>
            <div class="row"><span>Rail</span><b>${esc(real(res.rail) || "Visa Direct")}</b></div>
            ${res.auth_code ? `<div class="row"><span>Auth code</span><b>${esc(res.auth_code)}</b></div>` : ""}
            ${res.token ? `<div class="row"><span>Network token</span><b>${esc(String(res.token).slice(0, 12))}\u2026</b></div>` : ""}
            ${res.receipt?.intent_id ? `<div class="row"><span>Receipt</span><b>${esc(res.receipt.intent_id)}</b></div>` : ""}
            ${declined && res.message ? `<div class="row"><span>${esc(real(res.message))}</span></div>` : ""}
            <ul>${guardList(res.guards)}</ul>
          </div>`;
        overlay.querySelector(".payx").onclick = () => {
          overlay.remove();
          dismiss(0);
        };
        overlay.onclick = (e) => {
          if (e.target === overlay) { overlay.remove(); dismiss(0); }
        };
        shadow.querySelector(".line").innerHTML = declined
          ? `<span class="done">Payment ${esc(res.status || "failed")}: nothing was recorded.</span>`
          : `<span class="done">Bought. It's in your closet now.</span>`;
        buttons.remove();
        shadow.querySelector(".payline")?.remove();
        shadow.getElementById("guardlist")?.remove();
        setTimeout(() => { overlay.remove(); dismiss(0); }, declined ? 6000 : 4200);
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

  /* Park the duck on a product page the shop never opted in to.
   *
   * A shop that drives Puddle itself says so, and keeps the behaviour it
   * scripted: the duck stays hidden until that shop summons it. Everywhere
   * else, reading the product is the only way to know there is one, so a
   * readable product *is* the signal that this page is worth sitting on.
   *
   * Re-read on a timer rather than once on load, because a storefront can swap
   * the product without a reload: Amazon moves between items through
   * history.pushState and changes size and colour in place, and a duck that
   * only looks once keeps answering about the item you have already left. The
   * check is a handful of querySelectors and returns early unless the product
   * actually changed, so the cost of asking every second is not worth avoiding. */
  let parkedKey = "";
  function park() {
    if (document.body.dataset.puddleShop) return;
    const item = globalThis.PuddleExtract?.();
    // A guessed title means a search or category page: many products, none of
    // them this one. Uninvited, that is not enough to speak on.
    if (!item || item._guessedTitle) return;
    const key = `${item.title}|${item.price}|${item.size || ""}|${item.color || ""}`;
    if (key === parkedKey) return;
    parkedKey = key;
    send({ type: "score", item, now_hour: new Date().getHours() })
      .then((result) => {
        // Another product landed while this one was scoring: that answer is
        // already stale, and the newer request owns the duck.
        if (!result || key !== parkedKey) return;
        pageItem = item;
        pageResult = result;
        // Redraw even over an open card: it is about the item that just left.
        host?.remove(); host = null;
        renderLauncher();
      })
      // No backend, no duck. A page we cannot score is not ours to decorate.
      .catch(() => {});
  }

  park();
  const parkPoll = setInterval(park, 1000);
  window.addEventListener("pagehide", () => clearInterval(parkPoll));
})();
