"""Real OpenAI AI-reply implementation using the Responses API.

Generates context-aware communication replies for the accessibility
assistant. The returned text is meant to be passed through TTSProvider and
then the Web Audio mixer, exactly like typed, translated, or gaze-typed
text — same downstream pipeline, different source.
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
from app.providers.base import AIProvider, AIReplyResult
from app.providers.exceptions import (
    InvalidCredentialsError,
    MalformedResponseError,
    MissingCredentialsError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)

_PROVIDER_NAME = "openai_ai"

_BASE_INSTRUCTIONS = (
    "You are an accessible communication assistant helping a user who may "
    "have limited mobility or speech participate naturally in a live voice "
    "call with another person. Keep replies short, natural, and "
    "conversational — the reply will be spoken aloud via text-to-speech "
    "into the call, so avoid anything that only makes sense written down "
    "(no markdown, no bullet lists, no emojis)."
)


class OpenAIProvider(AIProvider):
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise MissingCredentialsError(
                "OPENAI_API_KEY is not set. AI_PROVIDER=openai requires it "
                "(set it in backend/.env).",
                provider=_PROVIDER_NAME,
            )
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_ai_model

    async def generate_reply(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
        language: str | None = None,
    ) -> AIReplyResult:
        if not message or not message.strip():
            raise MalformedResponseError(
                "Cannot generate a reply to empty input.", provider=_PROVIDER_NAME
            )

        input_items: list[dict] = []
        for turn in conversation_history or []:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if content:
                input_items.append({"role": role, "content": content})
        input_items.append({"role": "user", "content": message})

        instructions = _BASE_INSTRUCTIONS
        if language:
            instructions += f" Respond in {language}."

        try:
            response = await self._client.responses.create(
                model=self._model,
                instructions=instructions,
                input=input_items,
            )
        except AuthenticationError as exc:
            raise InvalidCredentialsError(
                f"OpenAI rejected the configured API key: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except OpenAIRateLimitError as exc:
            raise RateLimitError(
                f"OpenAI rate limit exceeded: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APITimeoutError as exc:
            raise ProviderTimeoutError(
                f"OpenAI request timed out: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIConnectionError as exc:
            raise ProviderUnavailableError(
                f"Could not reach OpenAI: {exc}", provider=_PROVIDER_NAME
            ) from exc
        except APIStatusError as exc:
            raise ProviderUnavailableError(
                f"OpenAI returned an error (status {exc.status_code}): {exc}",
                provider=_PROVIDER_NAME,
            ) from exc

        text = getattr(response, "output_text", None)
        if not text or not text.strip():
            raise MalformedResponseError(
                "OpenAI Responses API returned no output_text.",
                provider=_PROVIDER_NAME,
            )
        return AIReplyResult(reply_text=text.strip())
