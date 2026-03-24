"""POST /api/generate — main endpoint for plugin generation."""

import json
import uuid
from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.llm import generate_code
from app.core.extractor import extract_code, ExtractionError
from app.core.sandbox import execute, SandboxError
from app.models import firestore

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str
    model: str = "claude-sonnet-4-20250514"
    messages: list[dict] = []  # prior conversation for multi-turn
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
    messages = req.messages + [{"role": "user", "content": req.prompt}]

    async def event_stream():
        full_response = ""
        code = None

        # Stream LLM response
        try:
            async for chunk in generate_code(messages, x_api_key, req.model):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
        except Exception as e:
            _save(generation_id, req, full_response, None, "error", str(e))
            yield f"data: {json.dumps({'type': 'error', 'content': f'LLM error: {str(e)}'})}\n\n"
            return

        # Extract code from response
        try:
            code = extract_code(full_response)
            yield f"data: {json.dumps({'type': 'code_extracted', 'content': code})}\n\n"
        except ExtractionError as e:
            _save(generation_id, req, full_response, None, "error", str(e))
            yield f"data: {json.dumps({'type': 'error', 'content': f'Code extraction failed: {str(e)}'})}\n\n"
            return

        # Execute in sandbox
        try:
            yield f"data: {json.dumps({'type': 'status', 'content': 'Executing code...'})}\n\n"
            result = execute(code)
            _save(generation_id, req, full_response, code, "success",
                  amxd_path=str(result.files.get("amxd", "")))
            yield f"data: {json.dumps({'type': 'success', 'generation_id': result.generation_id, 'stdout': result.stdout})}\n\n"
        except SandboxError as e:
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
    except Exception:
        pass  # Don't fail the request if Firestore is down
