"""POST /api/ai/reply — generate a context-aware AI reply.

The returned text is meant to be sent straight to POST /api/tts by the
frontend, then through the same Web Audio mixer / WebRTC pipeline as every
other speech source.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.providers.registry import get_ai_provider
from app.schemas.ai import AIReplyRequest, AIReplyResponse

router = APIRouter(tags=["ai"])


@router.post("/api/ai/reply", response_model=AIReplyResponse)
async def generate_ai_reply(payload: AIReplyRequest) -> AIReplyResponse:
    provider = get_ai_provider()
    history = (
        [turn.model_dump() for turn in payload.conversation_history]
        if payload.conversation_history
        else None
    )
    result = await provider.generate_reply(
        message=payload.message,
        conversation_history=history,
        language=payload.language,
    )
    return AIReplyResponse(reply_text=result.reply_text)
