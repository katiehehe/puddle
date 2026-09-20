import { useEffect, useRef, useState } from "react";
import "../../extension/speech.js";
import "../../extension/voice.js";

const brain = "http://localhost:8000";
const runtime = globalThis as any;
runtime.PuddleSend = async (msg: any) => {
  const routes: Record<string, string> = {
    voice_status: "/voice/status", voice_respond: "/voice/respond",
    voice_speak: "/voice/speak", voice_transcribe: "/voice/transcribe",
  };
  if (!routes[msg.type]) throw new Error("This panel only answers wardrobe questions.");
  let body: any = msg.type === "voice_respond"
    ? { transcript: msg.transcript, scope: "wardrobe" } : { text: msg.text };
  const headers = { "Content-Type": "application/json" };
  if (msg.type === "voice_transcribe") {
    body = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
    headers["Content-Type"] = msg.mimeType;
  }
  const status = msg.type === "voice_status";
  let response;
  try {
    response = await fetch(brain + routes[msg.type], {
      method: status ? "GET" : "POST", headers,
      ...(!status ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error("Puddle could not connect. Check the backend and try again."); }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Puddle could not answer. Try a shorter question.");
  return data;
};

export default function AskPuddle() {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !host.current) return;
    const shadow = host.current.shadowRoot || host.current.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{display:block} .card{font:14px/1.5 Arial,sans-serif}
      button{padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font:inherit}
    </style><div class="card"></div>`;
    const dispose = runtime.PuddleVoice.attach(shadow, {}, () => {});
    const cleanup = () => dispose();
    window.addEventListener("pagehide", cleanup);
    return () => { window.removeEventListener("pagehide", cleanup); dispose(); };
  }, [open]);
  return <section className="card" aria-label="Wardrobe assistant">
    <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="wardrobe-voice">
      {open ? "Close Ask Puddle" : "Ask Puddle"}
    </button>
    {open && <div id="wardrobe-voice">
      <h2>Ask about your wardrobe</h2>
      <p className="muted">Try “What should I buy for an interview?” or “What should I stop buying?” Answers use the current backend wardrobe.</p>
      <div ref={host} />
    </div>}
  </section>;
}
