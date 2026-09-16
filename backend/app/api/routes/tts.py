"""POST /api/tts — synthesize speech and return real audio bytes.

The response body IS the audio (audio/mpeg), not JSON. The frontend fetches
this, decodes it with the Web Audio API (AudioContext.decodeAudioData), and
feeds the resulting buffer into the shared mixer that feeds the outgoing
WebRTC track — the same path used for typed, translated, gaze, and AI TTS.
"""
from __future__ import annotations

from fastapi import APIRouter, Response, Request, HTTPException
import logging

from app.schemas.tts import TTSRequest
from app.services.tts_service import generate_speech_wav, PiperNotFoundError, PiperModelMissingError

router = APIRouter(tags=["tts"])

logger = logging.getLogger("app.api.tts")


@router.post("/api/tts")
async def synthesize_speech(request: Request, payload: TTSRequest) -> Response:
    # Log request origin and headers to aid debugging when preflight fails
    origin = request.headers.get("origin")
    logger.info("TTS request from origin=%s path=%s", origin, request.url.path)

    try:
        audio_bytes, content_type = generate_speech_wav(payload.text, voice=payload.voice)
    except PiperNotFoundError as exc:
        logger.error("Piper not found: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    except PiperModelMissingError as exc:
        logger.error("Piper model missing: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="TTS generation failed")

    return Response(content=audio_bytes, media_type=content_type)
