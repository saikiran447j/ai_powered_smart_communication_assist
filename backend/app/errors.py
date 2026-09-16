"""Global error handling.

Every provider raises a ProviderError subclass (see
app/providers/exceptions.py) instead of leaking raw SDK exceptions. This
handler is the single place that turns those into HTTP responses, so every
route gets the same consistent error shape without repeating try/except
boilerplate.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.providers.exceptions import ProviderError


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProviderError)
    async def provider_error_handler(request: Request, exc: ProviderError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": type(exc).__name__,
                "message": exc.message,
                "provider": exc.provider,
            },
        )
