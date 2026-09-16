from __future__ import annotations

from pydantic import BaseModel


class TranslationRequest(BaseModel):
    text: str
    source_language: str  # "en" | "hi" | "te"
    target_language: str  # "en" | "hi" | "te"


class TranslationResponse(BaseModel):
    translated_text: str
    source_language: str
    target_language: str
