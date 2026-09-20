/* Push-to-talk lives in the content script on the controlled localhost shop.
   MediaRecorder never runs in the MV3 service worker. */
(() => {
  function attach(shadow, item, onSaved, predictionId) {
    const panel = document.createElement("section");
    panel.className = "voice-panel";
    panel.innerHTML = `
      <style>
        .voice-panel{border-top:2px solid #e5e7eb;margin-top:14px;padding-top:14px;color:#111827}
        .voice-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .voice-controls button{background:#f3f4f6;color:#111827;border-radius:6px}
        .voice-controls button:hover{background:#e5e7eb}
        .voice-controls button[aria-pressed="true"]{background:#dc2626;color:#fff}
        .voice-panel button:focus-visible,.voice-panel input:focus-visible{outline:3px solid #3b82f6;outline-offset:2px}
        .voice-panel button:disabled{opacity:.55;cursor:default}
        .voice-status,.voice-heard{font-size:12px;line-height:1.5;color:#6b7280;margin:8px 0}
        .voice-answer{font-size:14px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere}
        .voice-form{display:flex;gap:8px;margin-top:10px}
        .voice-form input{width:0;flex:1;min-width:0;border:2px solid transparent;border-radius:6px;
          padding:10px 12px;font-size:13px;background:#f3f4f6;color:#111827}
        .voice-form input:focus{background:#fff;border-color:#3b82f6}
        .voice-form input::placeholder{color:#6b7280}
        .voice-label{display:block;font-size:12px;margin-top:12px;color:#6b7280;font-weight:600}
        .voice-panel [hidden]{display:none!important}
        @media(prefers-reduced-motion:reduce){.card{animation:none!important}}
      </style>
      <div class="voice-controls">
        <button type="button" class="voice-mic" aria-pressed="false">Talk to Puddle</button>
        <button type="button" class="voice-cancel" hidden>Cancel recording</button>
        <button type="button" class="voice-mute" aria-pressed="false">Mute replies</button>
      </div>
      <p class="voice-status" role="status" aria-live="polite">Checking microphone setup...</p>
      <label class="voice-label" for="puddle-question">Or type a question</label>
      <form class="voice-form">
        <input id="puddle-question" maxlength="1000" autocomplete="off" placeholder="Why should I skip these?">
        <button type="submit">Ask</button>
      </form>
      <p class="voice-heard" hidden></p>
      <p class="voice-answer" aria-live="polite" hidden></p>
      <button type="button" class="voice-confirm" hidden>Confirm skip</button>`;
    shadow.querySelector(".card").appendChild(panel);
    const find = selector => panel.querySelector(selector);
    const mic = find(".voice-mic"), cancel = find(".voice-cancel"), status = find(".voice-status");
    const form = find(".voice-form"), input = find("input"), ask = find("[type=submit]");
    const heard = find(".voice-heard"), answer = find(".voice-answer"), confirm = find(".voice-confirm");
    const mute = find(".voice-mute");
    let disposed = false, configured = false, busy = false, muted = false;
    let recorder = null, stream = null, timer = null, chunks = [], cancelled = false;
    let pendingMic = false, generation = 0, skipEvent = null;
    const send = msg => globalThis.PuddleSend(msg);
    function setBusy(value) {
      busy = value;
      ask.disabled = value;
      input.disabled = value;
      mic.disabled = value || !configured;
    }
    function say(text) {
      if (muted || disposed) return;
      globalThis.PuddleSpeech?.speak(text);
    }
    function releaseMic() {
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      mic.textContent = "Talk to Puddle";
      mic.setAttribute("aria-pressed", "false");
      cancel.hidden = true;
    }
    async function askQuestion(text, token) {
      const result = await send({ type: "voice_respond", transcript: text, item, now_hour: item.now_hour });
      if (disposed || token !== generation) return;
      heard.textContent = `You: ${text}`;
      heard.hidden = false;
      answer.textContent = result.answer;
      answer.hidden = false;
      confirm.hidden = result.pending_action !== "skip";
      skipEvent = result.pending_action === "skip" ? crypto.randomUUID() : null;
      status.textContent = "";
      say(result.answer);
    }
    function beginQuestion() {
      generation += 1;
      globalThis.PuddleSpeech?.cancel();
      confirm.hidden = true;
      answer.hidden = true;
      heard.hidden = true;
      setBusy(true);
      return generation;
    }
    async function submitTyped(event) {
      event.preventDefault();
      if (busy || !input.value.trim()) return;
      const text = input.value.trim(), token = beginQuestion();
      status.textContent = "Thinking...";
      try { await askQuestion(text, token); }
      catch (error) { if (!disposed && token === generation) status.textContent = error.message; }
      finally { if (!disposed && token === generation) setBusy(false); }
    }
    form.addEventListener("submit", submitTyped);
    mute.onclick = () => {
      muted = !muted;
      mute.setAttribute("aria-pressed", String(muted));
      mute.textContent = muted ? "Unmute replies" : "Mute replies";
      if (muted) globalThis.PuddleSpeech?.cancel();
    };
    function stopRecording(discard) {
      cancelled = discard;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseMic();
    }
    cancel.onclick = () => {
      pendingMic = false;
      generation += 1;
      stopRecording(true);
      setBusy(false);
      status.textContent = "Recording cancelled.";
    };
    mic.onclick = async () => {
      if (recorder?.state === "recording") { stopRecording(false); return; }
      if (busy || !configured) return;
      const token = beginQuestion();
      pendingMic = true;
      cancel.hidden = false;
      status.textContent = "Allow microphone access to start recording.";
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (disposed || !pendingMic || token !== generation) {
          acquired.getTracks().forEach(track => track.stop()); return;
        }
        stream = acquired;
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
          .find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error("This browser cannot record supported audio. Type your question instead.");
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
        chunks = []; cancelled = false;
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => {
          if (disposed || token !== generation) return;
          stopRecording(true); setBusy(false); status.textContent = "Recording failed. Please try again.";
        };
        recorder.onstop = async () => {
          if (disposed || token !== generation) return;
          releaseMic();
          if (cancelled) return;
          setBusy(true);
          status.textContent = "Transcribing...";
          try {
            const blob = new Blob(chunks, { type: mimeType });
            chunks = [];
            if (!blob.size || blob.size > 2 * 1024 * 1024) throw new Error("Recording was empty or too large. Please try again.");
            const audio = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(",")[1]);
              reader.onerror = () => reject(new Error("Could not read the recording."));
              reader.readAsDataURL(blob);
            });
            const result = await send({ type: "voice_transcribe", audio, mimeType });
            if (disposed || token !== generation) return;
            status.textContent = "Thinking...";
            input.value = result.transcript;
            await askQuestion(result.transcript, token);
          } catch (error) { if (!disposed && token === generation) status.textContent = error.message; }
          finally { if (!disposed && token === generation) setBusy(false); }
        };
        recorder.start();
        mic.disabled = false;
        mic.textContent = "Stop and ask";
        mic.setAttribute("aria-pressed", "true");
        status.textContent = "Listening. Recording stops after 20 seconds.";
        timer = setTimeout(() => stopRecording(false), 20000);
      } catch (error) {
        if (disposed || token !== generation) return;
        releaseMic();
        if (!disposed && token === generation) {
          setBusy(false);
          status.textContent = error.name === "NotAllowedError" ?
            "Microphone access was denied. Allow it in Chrome or type your question." :
            error.name === "NotFoundError" ? "No microphone was found. Type your question instead." : error.message;
        }
      }
    };
    confirm.onclick = async () => {
      if (busy || !skipEvent) return;
      setBusy(true); confirm.disabled = true;
      try {
        const result = await send({ type: "record_skip", item, event_id: skipEvent, prediction_id: predictionId });
        if (disposed) return;
        onSaved(result.pond.saved);
        confirm.hidden = true;
        answer.textContent = `Skipped. Your saved total is $${result.pond.saved}.`;
        say(answer.textContent);
      } catch (error) { if (!disposed) status.textContent = error.message; }
      finally { if (!disposed) { setBusy(false); confirm.disabled = false; } }
    };
    mic.disabled = true;
    send({ type: "voice_status" }).then(result => {
      if (disposed) return;
      configured = result.configured && Boolean(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
      if (!busy) mic.disabled = !configured;
      status.textContent = !result.configured ? "Voice is not connected yet. You can type a question below." :
        !configured ? "Microphone recording is unavailable here. Type a question below." :
        "Tap to record. Audio is sent to Deepgram after you stop.";
    }).catch(error => { if (!disposed) status.textContent = error.message; });
    return () => {
      disposed = true; generation += 1; pendingMic = false;
      stopRecording(true); globalThis.PuddleSpeech?.cancel(); panel.remove();
    };
  }
  globalThis.PuddleVoice = { attach };
})();
