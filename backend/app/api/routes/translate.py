"""POST /api/translate — translate text between English, Hindi, and Telugu."""
from __future__ import annotations

from fastapi import APIRouter

from app.providers.registry import get_translation_provider
from app.schemas.translation import TranslationRequest, TranslationResponse

router = APIRouter(tags=["translation"])


@router.post("/api/translate", response_model=TranslationResponse)
async def translate_text(payload: TranslationRequest) -> TranslationResponse:
    provider = get_translation_provider()
    result = await provider.translate(
        text=payload.text,
        source_language=payload.source_language,
        target_language=payload.target_language,
    )
    return TranslationResponse(
        translated_text=result.translated_text,
        source_language=result.source_language,
        target_language=result.target_language,
    )
