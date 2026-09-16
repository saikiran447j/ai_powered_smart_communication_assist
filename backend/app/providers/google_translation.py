"""Real Google Cloud Translation implementation (Translation API v2, REST).

Uses a simple API key (GOOGLE_TRANSLATE_API_KEY) rather than a full service
account, so it drops in the same way as the OpenAI providers via a single
backend-only env var. Isolated behind TranslationProvider so swapping in
Azure Translator (or the v3/Advanced Translation API with service account
auth) later only means writing a new class — routes and callers never
change.
"""
from __future__ import annotations

import httpx

from app.config import settings
from app.providers.base import TranslationProvider, TranslationResult
from app.providers.exceptions import (
    InvalidCredentialsError,
    MalformedResponseError,
    MissingCredentialsError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
    UnsupportedLanguageError,
)

_PROVIDER_NAME = "google_translation"
_ENDPOINT = "https://translation.googleapis.com/language/translate/v2"


class GoogleTranslationProvider(TranslationProvider):
    def __init__(self) -> None:
        if not settings.google_translate_api_key:
            raise MissingCredentialsError(
                "GOOGLE_TRANSLATE_API_KEY is not set. TRANSLATION_PROVIDER=google "
                "requires it (set it in backend/.env).",
                provider=_PROVIDER_NAME,
            )
        self._api_key = settings.google_translate_api_key

    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str,
    ) -> TranslationResult:
        if not text or not text.strip():
            raise MalformedResponseError(
                "Cannot translate empty text.", provider=_PROVIDER_NAME
            )
        if (
            source_language not in self.SUPPORTED_LANGUAGES
            or target_language not in self.SUPPORTED_LANGUAGES
        ):
            raise UnsupportedLanguageError(
                f"Unsupported language pair '{source_language}' -> "
                f"'{target_language}'. Supported languages: "
                f"{sorted(self.SUPPORTED_LANGUAGES)}.",
                provider=_PROVIDER_NAME,
            )
        if source_language == target_language:
            # Nothing to do — return the input unchanged rather than
            # spending an API call on a no-op translation.
            return TranslationResult(
                translated_text=text,
                source_language=source_language,
                target_language=target_language,
            )

        params = {"key": self._api_key}
        payload = {
            "q": text,
            "source": source_language,
            "target": target_language,
            "format": "text",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(_ENDPOINT, params=params, data=payload)
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(
                f"Google Translation request timed out: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderUnavailableError(
                f"Could not reach Google Translation service: {exc}",
                provider=_PROVIDER_NAME,
            ) from exc

        if resp.status_code in (401, 403):
            raise InvalidCredentialsError(
                f"Google rejected the configured API key (status {resp.status_code}): "
                f"{resp.text[:300]}",
                provider=_PROVIDER_NAME,
            )
        if resp.status_code == 429:
            raise RateLimitError(
                "Google Translation rate limit exceeded.", provider=_PROVIDER_NAME
            )
        if resp.status_code >= 500:
            raise ProviderUnavailableError(
                f"Google Translation service error (status {resp.status_code}).",
                provider=_PROVIDER_NAME,
            )
        if resp.status_code != 200:
            raise MalformedResponseError(
                f"Google Translation returned unexpected status "
                f"{resp.status_code}: {resp.text[:300]}",
                provider=_PROVIDER_NAME,
            )

        try:
            data = resp.json()
            translated_text = data["data"]["translations"][0]["translatedText"]
        except (KeyError, IndexError, ValueError) as exc:
            raise MalformedResponseError(
                f"Could not parse Google Translation response: {exc}",
                provider=_PROVIDER_NAME,
            ) from exc

        return TranslationResult(
            translated_text=translated_text,
            source_language=source_language,
            target_language=target_language,
        )
