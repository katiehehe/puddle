/* The duck's voice. ElevenLabs when the brain has a key, browser speech otherwise.
   One speaker for the whole page so a new reply always cuts off the previous one. */
(() => {
  const MAX_CHARS = 600;
  let current = null, currentUrl = null, generation = 0, hosted = true;

  function cancel() {
    generation += 1;
    globalThis.speechSynthesis?.cancel();
    if (current) {
      current.pause();
      current.removeAttribute("src");
      current = null;
    }
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  }

  function browserSpeak(text) {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.15;
    speechSynthesis.speak(utterance);
  }

  function play(base64, mime, onFailure) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || "audio/mpeg" }));
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    const cleanup = () => {
      if (currentUrl === url) { URL.revokeObjectURL(url); currentUrl = null; }
      if (current === audio) current = null;
    };
    audio.onended = cleanup;
    audio.onerror = () => { cleanup(); onFailure(); };
    return audio.play().catch(error => { cleanup(); throw error; });
  }

  async function speak(text) {
    const line = String(text ?? "").trim().slice(0, MAX_CHARS);
    if (!line) return;
    cancel();
    const token = generation;
    let failed = false;
    const fallback = () => {
      if (failed || token !== generation) return;
      failed = true;
      browserSpeak(line);
    };
    if (!hosted) { browserSpeak(line); return; }
    try {
      const result = await globalThis.PuddleSend({ type: "voice_speak", text: line });
      if (token !== generation) return;
      await play(result.audio, result.mime, fallback);
    } catch (error) {
      if (token !== generation) return;
      // A missing key is permanent for this session; anything else may be transient.
      if (/not configured/i.test(error.message || "")) hosted = false;
      fallback();
    }
  }

  globalThis.PuddleSpeech = { speak, cancel, get hosted() { return hosted; } };
})();
