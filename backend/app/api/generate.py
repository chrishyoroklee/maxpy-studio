"""POST /api/generate — main endpoint for plugin generation."""

import json
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.llm import generate_code
from app.core.extractor import extract_code, ExtractionError
from app.core.sandbox import execute, SandboxError

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str
    model: str = "claude-sonnet-4-20250514"
    messages: list[dict] = []  # prior conversation for multi-turn


@router.post("/generate")
async def generate(
    req: GenerateRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """Generate an M4L plugin from a natural language prompt.

    Streams the LLM response via SSE, then extracts code, executes it,
    and returns the generation ID for download.
    """

    # Build messages list
    messages = req.messages + [{"role": "user", "content": req.prompt}]

    async def event_stream():
        full_response = ""

        # Stream LLM response
        try:
            async for chunk in generate_code(messages, x_api_key, req.model):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'LLM error: {str(e)}'})}\n\n"
            return

        # Extract code from response
        try:
            code = extract_code(full_response)
            yield f"data: {json.dumps({'type': 'code_extracted', 'content': code})}\n\n"
        except ExtractionError as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Code extraction failed: {str(e)}'})}\n\n"
            return

        # Execute in sandbox
        try:
            yield f"data: {json.dumps({'type': 'status', 'content': 'Executing code...'})}\n\n"
            result = execute(code)
            yield f"data: {json.dumps({'type': 'success', 'generation_id': result.generation_id, 'stdout': result.stdout})}\n\n"
        except SandboxError as e:
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
