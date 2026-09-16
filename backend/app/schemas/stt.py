from __future__ import annotations

from pydantic import BaseModel


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
