"""Real OpenAI speech-to-text implementation.

Uses OpenAI's transcription endpoint (gpt-4o-mini-transcribe by default,
configurable via OPENAI_STT_MODEL). No mocking — if OPENAI_API_KEY is
missing or invalid, this raises a clear ProviderError rather than returning
placeholder text.
"""
from __future__ import annotations

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
)
from openai import RateLimitError as OpenAIRateLimitError

from app.config import settings
from app.providers.base import STTProvider, TranscriptionResult
from app.providers.exceptions import (
    InvalidCredentialsError,
    MalformedResponseError,
    MissingCredentialsError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)

_PROVIDER_NAME = "openai_stt"


class OpenAISTTProvider(STTProvider):
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise MissingCredentialsError(
                "OPENAI_API_KEY is not set. STT_PROVIDER=openai requires it "
                "(set it in backend/.env).",
                provider=_PROVIDER_NAME,
            )
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_stt_model

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str,
        content_type: str,
        language: str | None = None,
    ) -> TranscriptionResult:
        if not audio_bytes:
            raise MalformedResponseError(
                "No audio data received to transcribe.", provider=_PROVIDER_NAME
            )

        kwargs: dict = {
            "model": self._model,
            "file": (filename, audio_bytes, content_type),
        }
        # OpenAI expects ISO-639-1 language hints (e.g. "en", "hi", "te").
        if language:
            kwargs["language"] = language

        try:
            result = await self._client.audio.transcriptions.create(**kwargs)
        except AuthenticationError as exc:
            raise InvalidCredentialsError(
                f"OpenAI rejected the configured API key: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except OpenAIRateLimitError as exc:
            raise RateLimitError(
                f"OpenAI STT rate limit exceeded: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APITimeoutError as exc:
            raise ProviderTimeoutError(
                f"OpenAI STT request timed out: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(
                f"Could not reach OpenAI: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(
                f"OpenAI STT returned an error (status {exc.status_code}): {exc}",
                provider=_PROVIDER_NAME,
            ) from exc

        text = getattr(result, "text", None)
        if not isinstance(text, str):
            raise MalformedResponseError(
                "OpenAI STT response did not contain a 'text' field.",
                provider=_PROVIDER_NAME,
            )
        return TranscriptionResult(text=text, language=language)
