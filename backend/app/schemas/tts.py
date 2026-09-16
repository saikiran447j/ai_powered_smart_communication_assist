from __future__ import annotations

from pydantic import BaseModel


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    language: str | None = None
