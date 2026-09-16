"""POST /api/stt — transcribe an uploaded audio clip."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile

from app.providers.registry import get_stt_provider
from app.schemas.stt import TranscriptionResponse

router = APIRouter(tags=["stt"])


@router.post("/api/stt", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> TranscriptionResponse:
    audio_bytes = await file.read()
    provider = get_stt_provider()
    result = await provider.transcribe(
        audio_bytes=audio_bytes,
        filename=file.filename or "audio.webm",
        content_type=file.content_type or "audio/webm",
        language=language,
    )
    return TranscriptionResponse(text=result.text, language=result.language)
