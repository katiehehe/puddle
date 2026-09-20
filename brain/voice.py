"""Short-clip transcription, spoken replies, and deterministic evidence-grounded answers."""

from __future__ import annotations

import base64
import os
import re
from dataclasses import replace
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import ask, storage
from .catalog import STOREFRONT

router = APIRouter(prefix="/voice", tags=["voice"])
MAX_AUDIO_BYTES = 2 * 1024 * 1024
MAX_RECORD_SECONDS = 20
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/mpeg"}
DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
# Flash is the low-latency model; the duck has to answer while the shopper waits.
ELEVENLABS_MODEL = "eleven_flash_v2_5"
ELEVENLABS_FORMAT = "mp3_44100_64"
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
MAX_SPEECH_CHARS = 600


def api_key():
    return os.getenv("DEEPGRAM_API_KEY", "").strip()


def speech_key():
    return os.getenv("ELEVENLABS_API_KEY", "").strip()


def voice_id():
    return os.getenv("ELEVENLABS_VOICE_ID", "").strip() or DEFAULT_VOICE_ID


@router.get("/status")
def status():
    return {
        "configured": bool(api_key()),
        "provider": "deepgram",
        "model": "nova-3",
        "speech": "elevenlabs" if speech_key() else "browser",
        "max_audio_bytes": MAX_AUDIO_BYTES,
        "max_record_seconds": MAX_RECORD_SECONDS,
    }


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_SPEECH_CHARS)
    # The duck voice is played back fast, so it is rendered slow and warm.
    ducky: bool = False


@router.post("/speak")
async def speak(req: SpeechRequest):
    """Render a reply with ElevenLabs. Callers fall back to browser speech on 503."""
    text = req.text.strip()
    if not text:
        raise HTTPException(422, "Nothing to speak.")
    if not speech_key():
        raise HTTPException(503, "Hosted speech is not configured.")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{ELEVENLABS_URL}/{voice_id()}",
                params={"output_format": ELEVENLABS_FORMAT},
                headers={"xi-api-key": speech_key(), "Content-Type": "application/json"},
                json={
                    "text": text,
                    "model_id": ELEVENLABS_MODEL,
                    "voice_settings": (
                        {"stability": 0.6, "similarity_boost": 0.9, "style": 0.35, "speed": 0.7}
                        if req.ducky
                        else {"stability": 0.45, "similarity_boost": 0.75, "speed": 1.05}
                    ),
                },
            )
        if response.status_code in (401, 403):
            raise HTTPException(502, "ElevenLabs rejected the credentials. Check the server API key.")
        if response.status_code == 429:
            raise HTTPException(503, "ElevenLabs is rate limited right now.")
        if response.status_code >= 400:
            raise HTTPException(502, "ElevenLabs could not render this reply.")
        audio = response.content
        if not audio:
            raise HTTPException(502, "ElevenLabs returned empty audio.")
        return {"audio": base64.b64encode(audio).decode(), "mime": "audio/mpeg", "provider": "elevenlabs"}
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Speech timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not reach ElevenLabs.") from exc


async def deepgram_transcribe(audio: bytes, content_type: str):
    if not api_key():
        raise HTTPException(503, "Microphone transcription is not configured. Type your question for now.")
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                DEEPGRAM_URL,
                params={"model": "nova-3", "smart_format": "true", "language": "en"},
                headers={"Authorization": f"Token {api_key()}", "Content-Type": content_type},
                content=audio,
            )
        if response.status_code in (401, 403):
            raise HTTPException(502, "Deepgram rejected the credentials. Check the server API key.")
        if response.status_code == 429:
            raise HTTPException(503, "Deepgram is temporarily unavailable. Try again or type your question.")
        if response.status_code >= 400:
            raise HTTPException(502, "Deepgram could not transcribe this recording. Try again or type your question.")
        channels = response.json()["results"]["channels"]
        if channels == []:
            raise HTTPException(422, "No audio was detected. Try recording again.")
        alternative = channels[0]["alternatives"][0]
        transcript = alternative["transcript"]
        if not isinstance(transcript, str):
            raise ValueError("invalid transcript")
        transcript = transcript.strip()
        if not transcript:
            raise HTTPException(422, "No speech was detected. Try again or type your question.")
        if len(transcript) > 1000:
            raise HTTPException(422, "That question is too long. Please ask a shorter question.")
        return {"transcript": transcript, "provider": "deepgram"}
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Transcription timed out. Try again or type your question.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not reach Deepgram. Try again or type your question.") from exc
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Deepgram returned an unreadable response. Try again.") from exc


@router.post("/transcribe")
async def transcribe(request: Request):
    content_type = request.headers.get("content-type", "").split(";")[0].lower().strip()
    if content_type not in AUDIO_TYPES:
        raise HTTPException(415, "Unsupported audio type. Use WebM, Ogg, WAV, MP4 or MP3.")
    chunks = bytearray()
    async for chunk in request.stream():
        if len(chunks) + len(chunk) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Recording is too large. Keep questions under 20 seconds.")
        chunks.extend(chunk)
    if not chunks:
        raise HTTPException(422, "Recording is empty. Try recording again.")
    return await deepgram_transcribe(bytes(chunks), content_type)


class VoiceQuestion(BaseModel):
    transcript: str = Field(min_length=1, max_length=1000)
    item_id: str | None = None
    item: dict | None = None
    now_hour: int | None = Field(default=None, ge=0, le=23)


NUMBERS = {"six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12"}


def intent(text):
    clean = re.sub(r"[^\w.\s]", "", text.lower()).strip(" .")
    # Only exact positive action commands produce a suggestion. Negation or
    # quoted/ambiguous speech cannot execute an action.
    if clean in {"skip", "skip it", "skip this", "skip these", "skip this item", "dont buy it", "do not buy it"}:
        return "skip", None
    if clean in {"buy", "buy it", "buy this", "buy these", "buy anyway", "checkout", "check out"}:
        return "buy", None
    size = re.search(r"\bsize\s+(\d{1,2}(?:\.5)?|six|seven|eight|nine|ten|eleven|twelve)\b", clean)
    if size:
        return "size", NUMBERS.get(size[1], size[1])
    if re.search(r"\b(instead|alternative|alternatives)\b", clean):
        return "alternatives", None
    if re.search(r"\b(why|explain|should|recommend|worth)\b", clean) or clean in {
        "what about this",
        "what about this one",
    }:
        return "explain", None
    return "unknown", None


@router.post("/respond")
def respond(req: VoiceQuestion):
    # Import at call time to keep the router independent from application setup.
    from .app import _context, _resolve, recommend

    if not req.transcript.strip():
        raise HTTPException(422, "Please ask a question.")
    item = _resolve(req)
    closet, miner, counts = _context()
    now = datetime.now()
    if req.now_hour is not None:
        now = now.replace(hour=req.now_hour, minute=40)
    kind, size = intent(req.transcript)
    result = recommend(item, closet, miner, now)
    response = {
        "intent": kind,
        "transcript": req.transcript.strip(),
        "item": item.dict(),
        "decision": result["decision"],
        "pending_action": None,
        "alternatives": [],
    }
    if kind == "skip":
        response.update(answer=f"Skip {item.title}? Select Confirm skip to record it.", pending_action="skip")
    elif kind == "buy":
        response["answer"] = "Use the Buy anyway button to review checkout. I have not placed an order."
    elif kind == "size":
        changed = replace(item, size=size)
        updated = recommend(changed, closet, miner, now)
        returns = next((i for i in updated["insights"] if i["type"] == "return_pattern"), None)
        answer = (
            returns["line"]
            if returns
            else (
                f"I do not see a repeated return warning for size {size}. That does not establish whether it will fit."
            )
        )
        other = next((i["line"] for i in updated["insights"] if i["type"] in ("redundancy", "coverage_gap")), None)
        if other:
            answer += " " + other
        response.update(answer=answer, decision=updated["decision"], evaluated_item=changed.dict())
    elif kind == "alternatives":
        owned = {storage.variant(i) for i in closet.items}
        candidates = []
        for candidate in STOREFRONT:
            if candidate.id == item.id or storage.variant(candidate) in owned:
                continue
            candidate_result = recommend(candidate, closet, miner, now)
            if candidate_result["decision"] == "buy":
                candidates.append((candidate, candidate_result))
        candidates.sort(key=lambda pair: pair[1]["portfolio"]["alpha"], reverse=True)
        choices = candidates[:2]
        response["alternatives"] = [{"item": c.dict(), "reasons": r["reasons"]} for c, r in choices]
        response["answer"] = (
            " ".join(
                f"Consider {c.title} at ${c.price:g}. "
                + (r["reasons"][0] if r["reasons"] else "It improves your modeled wardrobe coverage.")
                for c, r in choices
            )
            or "I do not have a strong alternative in this catalog right now."
        )
    elif kind == "explain":
        response["answer"] = " ".join(result["reasons"][:2]) or (
            "The portfolio model sees some benefit, but I do not have a strong personal-history signal for this item."
            if result["decision"] == "buy"
            else "I do not have a strong reason to recommend buying or skipping this item."
        )
    else:
        # A question the checkout handler has no reading of is usually about the
        # closet rather than the thing on the page, so it goes to the wardrobe
        # answers before it becomes a list of supported commands.
        wardrobe = ask.answer(req.transcript, closet, miner, counts)
        if wardrobe is not None:
            response.update(answer=wardrobe["answer"], intent=wardrobe["intent"], scope="wardrobe")
        else:
            response["answer"] = (
                "Ask why I recommend this item, what about size nine, or what to get instead. "
                "I can also answer about your closet: what you own for rain, or what you never wear."
            )
    response["answer"] = response["answer"].replace(" \u2014 ", ", ")
    return response
