"""Error hierarchy shared by every provider implementation.

Routes never catch raw SDK exceptions themselves — each provider translates
its own SDK/HTTP errors into one of these, and a single FastAPI exception
handler (see app/errors.py) turns them into a consistent JSON error body.
"""
from __future__ import annotations


class ProviderError(Exception):
    """Base class for all provider-layer errors."""

    status_code: int = 500

    def __init__(self, message: str, provider: str | None = None):
        self.message = message
        self.provider = provider
        super().__init__(message)


class MissingCredentialsError(ProviderError):
    """No API key/credential configured for the selected provider.

    This is a server configuration problem, not the caller's fault — but it
    must never be silently swallowed or faked. Surfaced as a clear 500 so
    whoever runs the backend knows exactly which env var to set.
    """

    status_code = 500


class InvalidCredentialsError(ProviderError):
    """The provider rejected the configured credentials (e.g. bad/revoked key)."""

    status_code = 502


class ProviderUnavailableError(ProviderError):
    """The provider could not be reached, or returned a server-side error."""

    status_code = 503


class RateLimitError(ProviderError):
    """The provider's rate limit was hit."""

    status_code = 429


class ProviderTimeoutError(ProviderError):
    """The request to the provider timed out."""

    status_code = 504


class UnsupportedLanguageError(ProviderError):
    """The requested language / language pair isn't supported."""

    status_code = 400


class MalformedResponseError(ProviderError):
    """The provider returned a response we couldn't parse as expected."""

    status_code = 502
