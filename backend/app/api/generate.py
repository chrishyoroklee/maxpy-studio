"""POST /api/generate — main endpoint for plugin generation."""

import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.llm import generate_code
from app.core.extractor import extract_code, ExtractionError
from app.core.sandbox import execute, SandboxError
from app.models import firestore

logger = logging.getLogger(__name__)

router = APIRouter()


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    model: str = "claude-sonnet-4-20250514"
    messages: list[Message] = []
    session_id: str | None = None


@router.post("/generate")
async def generate(
    req: GenerateRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """Generate an M4L plugin from a natural language prompt.

    Streams the LLM response via SSE, then extracts code, executes it,
    and returns the generation ID for download.
    """
    generation_id = str(uuid.uuid4())
    messages = [m.model_dump() for m in req.messages] + [
        {"role": "user", "content": req.prompt}
    ]

    async def event_stream():
        full_response = ""
        code = None

        # Stream LLM response
        try:
            async for chunk in generate_code(messages, x_api_key, req.model):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
        except Exception as e:
            logger.error("LLM error: %s", e)
            _save(generation_id, req, full_response, None, "error", "LLM request failed")
            yield f"data: {json.dumps({'type': 'error', 'content': 'LLM request failed. Check your API key and model.'})}\n\n"
            return

        # Extract code from response
        try:
            code = extract_code(full_response)
            yield f"data: {json.dumps({'type': 'code_extracted', 'content': code})}\n\n"
        except ExtractionError as e:
            _save(generation_id, req, full_response, None, "error", str(e))
            yield f"data: {json.dumps({'type': 'error', 'content': f'Code extraction failed: {str(e)}'})}\n\n"
            return

        # Execute in sandbox — pass the same generation_id so download URL matches
        try:
            yield f"data: {json.dumps({'type': 'status', 'content': 'Executing code...'})}\n\n"
            result = execute(code, generation_id=generation_id)
            _save(generation_id, req, full_response, code, "success",
                  amxd_path=str(result.files.get("amxd", "")))
            yield f"data: {json.dumps({'type': 'success', 'generation_id': generation_id, 'stdout': result.stdout})}\n\n"
        except SandboxError as e:
            logger.error("Sandbox error: %s", e)
            _save(generation_id, req, full_response, code, "error", str(e))
            yield f"data: {json.dumps({'type': 'error', 'content': f'Execution failed: {str(e)}'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


def _save(
    generation_id: str,
    req: GenerateRequest,
    llm_response: str,
    code: str | None,
    status: str,
    error_message: str | None = None,
    amxd_path: str | None = None,
):
    """Persist generation to Firestore (if configured)."""
    try:
        firestore.save_generation(
            generation_id=generation_id,
            prompt=req.prompt,
            model=req.model,
            llm_response=llm_response,
            generated_code=code,
            status=status,
            error_message=error_message,
            amxd_path=amxd_path,
            session_id=req.session_id,
        )
    except Exception as e:
        logger.warning("Failed to save to Firestore: %s", e)
