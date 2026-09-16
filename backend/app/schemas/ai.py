from __future__ import annotations

from pydantic import BaseModel


class ConversationTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class AIReplyRequest(BaseModel):
    message: str
    conversation_history: list[ConversationTurn] | None = None
    language: str | None = None


class AIReplyResponse(BaseModel):
    reply_text: str
