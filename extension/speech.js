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
      current.src = "";
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

  function play(base64, mime) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || "audio/mpeg" }));
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    audio.onended = audio.onerror = () => {
      if (currentUrl === url) { URL.revokeObjectURL(url); currentUrl = null; }
      if (current === audio) current = null;
    };
    return audio.play();
  }

  async function speak(text) {
    const line = String(text ?? "").trim().slice(0, MAX_CHARS);
    if (!line) return;
    cancel();
    const token = generation;
    if (!hosted) { browserSpeak(line); return; }
    try {
      const result = await globalThis.PuddleSend({ type: "voice_speak", text: line });
      if (token !== generation) return;
      await play(result.audio, result.mime);
    } catch (error) {
      if (token !== generation) return;
      // A missing key is permanent for this session; anything else may be transient.
      if (/not configured/i.test(error.message || "")) hosted = false;
      browserSpeak(line);
    }
  }

  globalThis.PuddleSpeech = { speak, cancel, get hosted() { return hosted; } };
})();
