"""Real OpenAI text-to-speech implementation.

Uses OpenAI's speech endpoint (gpt-4o-mini-tts by default, configurable via
OPENAI_TTS_MODEL) and returns real MP3 audio bytes. This is deliberately
NOT browser speechSynthesis — the returned bytes are what the frontend
fetches, decodes with the Web Audio API, and injects into the mixed
outgoing WebRTC audio track so the remote participant hears it.
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
from app.providers.base import SpeechResult, TTSProvider
from app.providers.exceptions import (
    InvalidCredentialsError,
    MalformedResponseError,
    MissingCredentialsError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)

_PROVIDER_NAME = "openai_tts"


class OpenAITTSProvider(TTSProvider):
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise MissingCredentialsError(
                "OPENAI_API_KEY is not set. TTS_PROVIDER=openai requires it "
                "(set it in backend/.env).",
                provider=_PROVIDER_NAME,
            )
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_tts_model
        self._default_voice = settings.openai_tts_voice

    async def synthesize(
        self,
        text: str,
        voice: str | None = None,
        language: str | None = None,
    ) -> SpeechResult:
        if not text or not text.strip():
            raise MalformedResponseError(
                "Cannot synthesize empty text.", provider=_PROVIDER_NAME
            )

        try:
            response = await self._client.audio.speech.create(
                model=self._model,
                voice=voice or self._default_voice,
                input=text,
                response_format="mp3",
            )
        except AuthenticationError as exc:
            raise InvalidCredentialsError(
                f"OpenAI rejected the configured API key: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except OpenAIRateLimitError as exc:
            raise RateLimitError(
                f"OpenAI TTS rate limit exceeded: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APITimeoutError as exc:
            raise ProviderTimeoutError(
                f"OpenAI TTS request timed out: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(
                f"Could not reach OpenAI: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(
                f"OpenAI TTS returned an error (status {exc.status_code}): {exc}",
                provider=_PROVIDER_NAME,
            ) from exc

        # The async SDK returns a streamed binary response; support both
        # the async-read and already-materialized-content shapes.
        audio_bytes: bytes | None = None
        if hasattr(response, "aread"):
            audio_bytes = await response.aread()
        elif hasattr(response, "read"):
            audio_bytes = response.read()
        elif hasattr(response, "content"):
            audio_bytes = response.content

        if not audio_bytes:
            raise MalformedResponseError(
                "OpenAI TTS returned no audio data.", provider=_PROVIDER_NAME
            )
        return SpeechResult(audio_bytes=audio_bytes, content_type="audio/mpeg")
