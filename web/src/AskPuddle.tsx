import { useCallback, useEffect, useRef, useState } from "react";
import { askPuddle, speakLine, transcribe } from "./api";

/* Ask Puddle: the duck, answering about the whole closet.
 *
 * Checkout answers are about the one thing in front of you. These are about
 * everything you own, and they come from the same deterministic brain -- a
 * question it has no statistic for gets told so rather than answered. */

const MAX_TURNS = 8;
const MAX_RECORD_MS = 20_000;

const SUGGESTIONS = [
  "What am I missing?",
  "What do I own for rain?",
  "What do I never wear?",
  "How much have I spent?",
  "How often are you right?",
];

type Turn = { question: string; answer: string; intent: string };

function browserSpeak(text: string) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1.15;
  window.speechSynthesis.speak(utterance);
}

export function AskPuddle({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  // Bumped whenever speech is cancelled, so a reply still being rendered by
  // ElevenLabs when you mute or close never arrives to play over a quiet room.
  const speech = useRef(0);

  const silence = useCallback(() => {
    speech.current += 1;
    window.speechSynthesis?.cancel();
    const player = audio.current;
    if (player) {
      player.pause();
      URL.revokeObjectURL(player.src);
      audio.current = null;
    }
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => {
    if (open) return;
    silence();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, [open, silence]);

  const say = useCallback(
    async (line: string) => {
      if (muted) return;
      silence();
      const turn = speech.current;
      try {
        const hosted = await speakLine(line);
        if (turn !== speech.current) return;
        const bytes = Uint8Array.from(atob(hosted.audio), (c) => c.charCodeAt(0));
        const player = new Audio(URL.createObjectURL(new Blob([bytes], { type: hosted.mime })));
        audio.current = player;
        await player.play();
      } catch {
        if (turn === speech.current) browserSpeak(line);
      }
    },
    [muted, silence],
  );

  const ask = useCallback(
    async (text: string) => {
      const asked = text.trim();
      if (!asked || busy) return;
      setQuestion("");
      setError("");
      setBusy(true);
      try {
        const turn = speech.current;
        const reply = await askPuddle(asked);
        setTurns((previous) =>
          [...previous, { question: asked, answer: reply.answer, intent: reply.intent }].slice(-MAX_TURNS),
        );
        // Muting or closing while the answer is still in flight counts.
        if (turn === speech.current) void say(reply.answer);
      } catch {
        setError("Can't reach the brain. Start it with ./run.sh and try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, say],
  );

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No microphone access. Type your question instead.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    recorder.current = media;
    media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      recorder.current = null;
      const clip = new Blob(chunks, { type: media.mimeType || "audio/webm" });
      if (!clip.size) return;
      setBusy(true);
      try {
        const heard = await transcribe(clip);
        setBusy(false);
        await ask(heard);
      } catch {
        setBusy(false);
        setError("Couldn't transcribe that. Type your question instead.");
      }
    };
    media.start();
    setRecording(true);
    // Deepgram takes short clips; a forgotten open mic is the usual demo failure.
    window.setTimeout(() => media.state === "recording" && media.stop(), MAX_RECORD_MS);
  }, [ask]);

  if (!open) return null;

  return (
    <aside className="askpanel" aria-label="Ask Puddle">
      <header>
        <b>Ask Puddle</b>
        <span>about everything you own</span>
        <button className="askclose" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="asklog" ref={log}>
        {turns.length === 0 && (
          <p className="hint">
            I answer from your closet and your history — what you own, what you wear, what you send
            back. Anything I can't put a number on, I'll say so.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={`${i}-${turn.question}`}>
            <p className="askq">{turn.question}</p>
            <p className="aska">{turn.answer}</p>
          </div>
        ))}
        {busy && <p className="hint">Checking your closet…</p>}
        {error && <p className="askerr">{error}</p>}
      </div>

      <div className="askchips">
        {SUGGESTIONS.map((s) => (
          <button key={s} disabled={busy} onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="askrow">
        <button
          className={recording ? "askmic on" : "askmic"}
          aria-pressed={recording}
          onClick={() => (recording ? stopRecording() : startRecording())}
        >
          {recording ? "Stop" : "Speak"}
        </button>
        <input
          placeholder="Ask about your closet"
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
        />
        <button disabled={!question.trim() || busy} onClick={() => ask(question)}>
          Ask
        </button>
      </div>
      <button
        className="askmute"
        aria-pressed={muted}
        onClick={() => {
          setMuted(!muted);
          if (!muted) silence();
        }}
      >
        {muted ? "Replies muted" : "Mute replies"}
      </button>
    </aside>
  );
}
