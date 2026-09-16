"""Provider selection.

Reads STT_PROVIDER / TTS_PROVIDER / TRANSLATION_PROVIDER / AI_PROVIDER from
settings and returns the matching concrete implementation. Application code
(routes, mixer logic, etc.) only ever imports from here and from
`app/providers/base.py` — never a concrete provider module directly — so
adding a new provider later means: write the class, add one branch below.

Missing-credential errors are raised lazily, the first time a provider is
actually requested — not at import time — so the server can still boot and
report a clear configuration error via /api/health and per-request 500s
instead of crashing on startup.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.providers.base import AIProvider, STTProvider, TranslationProvider, TTSProvider


@lru_cache
def get_stt_provider() -> STTProvider:
    if settings.stt_provider == "openai":
        from app.providers.openai_stt import OpenAISTTProvider

        return OpenAISTTProvider()
    raise ValueError(f"Unknown STT_PROVIDER: '{settings.stt_provider}'")


@lru_cache
def get_tts_provider() -> TTSProvider:
    if settings.tts_provider == "openai":
        from app.providers.openai_tts import OpenAITTSProvider

        return OpenAITTSProvider()
    raise ValueError(f"Unknown TTS_PROVIDER: '{settings.tts_provider}'")


@lru_cache
def get_translation_provider() -> TranslationProvider:
    if settings.translation_provider == "google":
        from app.providers.google_translation import GoogleTranslationProvider

        return GoogleTranslationProvider()
    raise ValueError(f"Unknown TRANSLATION_PROVIDER: '{settings.translation_provider}'")


@lru_cache
def get_ai_provider() -> AIProvider:
    if settings.ai_provider == "openai":
        from app.providers.openai_ai import OpenAIProvider

        return OpenAIProvider()
    raise ValueError(f"Unknown AI_PROVIDER: '{settings.ai_provider}'")
