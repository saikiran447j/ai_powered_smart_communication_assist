"""GET /api/health — reports server status and which providers are
selected/configured, without leaking key values. Useful for confirming
".env is set up correctly" before wiring up the frontend.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "environment": settings.environment,
        "providers": {
            "stt": settings.stt_provider,
            "tts": settings.tts_provider,
            "translation": settings.translation_provider,
            "ai": settings.ai_provider,
        },
        "credentials_configured": {
            "openai": bool(settings.openai_api_key),
            "google_translate": bool(settings.google_translate_api_key),
        },
    }
