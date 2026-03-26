"""POST /api/generate — main endpoint for plugin generation."""

import base64
import json
import logging
import uuid
from typing import Literal

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pathlib import Path

from app.core.llm import generate_code
from app.core.extractor import extract_code, ExtractionError
from app.core.sandbox import execute, SandboxError
from app.models import firestore

TEMPLATES_DIR = Path(__file__).parent.parent / "prompts" / "templates"

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_RETRIES = 2  # retry up to 2 times on sandbox failure


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str = "claude-sonnet-4-20250514"
    messages: list[Message] = []
    session_id: str | None = None
    template: str | None = None  # base device template name (e.g. "m4l_chorus")


@router.post("/generate")
async def generate(
    req: GenerateRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """Generate an M4L plugin from a natural language prompt.

    Streams the LLM response via SSE, then extracts code, executes it.
    If execution fails, sends the error back to the LLM for auto-retry.
    """
    generation_id = str(uuid.uuid4())

    # Build message list, optionally injecting template code
    user_content = req.prompt
    if req.template:
        template_path = TEMPLATES_DIR / f"{req.template}.py"
        if template_path.exists():
            template_code = template_path.read_text()
            user_content = (
                f"Here is an existing working device code. Modify it based on my request below.\n"
                f"Keep the same save pattern (save_amxd). Output the complete modified Python code.\n\n"
                f"```python\n{template_code}\n```\n\n"
                f"My modification request: {req.prompt}"
            )

    messages = [m.model_dump() for m in req.messages] + [
        {"role": "user", "content": user_content}
    ]

    async def event_stream():
        nonlocal messages, generation_id
        full_response = ""
        code = None

        for attempt in range(1 + MAX_RETRIES):
            full_response = ""

            if attempt > 0:
                yield f"data: {json.dumps({'type': 'status', 'content': f'Retrying (attempt {attempt + 1})...'})}\n\n"

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

            # Execute in sandbox
            try:
                yield f"data: {json.dumps({'type': 'status', 'content': 'Executing code...'})}\n\n"
                result = execute(code, generation_id=generation_id)
                _save(generation_id, req, full_response, code, "success",
                      amxd_path=str(result.files.get("amxd", "")))
                # Encode .amxd as base64 so frontend can download without a second request
                amxd_b64 = ""
                amxd_file = result.files.get("amxd")
                if amxd_file and amxd_file.exists():
                    amxd_b64 = base64.b64encode(amxd_file.read_bytes()).decode("ascii")
                yield f"data: {json.dumps({'type': 'success', 'generation_id': generation_id, 'stdout': result.stdout, 'amxd_b64': amxd_b64})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return  # success — stop retrying

            except SandboxError as e:
                error_msg = str(e)
                logger.warning("Sandbox error (attempt %d): %s", attempt + 1, error_msg)

                if attempt < MAX_RETRIES:
                    # Feed the error back to the LLM for auto-fix
                    messages = messages + [
                        {"role": "assistant", "content": full_response},
                        {"role": "user", "content": (
                            f"The code failed with this error:\n\n```\n{error_msg}\n```\n\n"
                            "Please fix the code. Common causes:\n"
                            "- IndexError on .ins[N] or .outs[N] means the object has fewer inlets/outlets than expected. "
                            "The object might not be recognized by maxpylang (gives 0 inlets). Use place_raw() for unknown objects.\n"
                            "- Use simple, well-known objects: lores~, *~, +~, -~, clip~, cycle~, noise~\n"
                            "- Avoid biquad~, filtercoeff~, and other complex objects that may not be in maxpylang's database.\n"
                            "Return the complete fixed script in a ```python code fence."
                        )},
                    ]
                    # Generate a new generation_id for the retry output directory
                    generation_id = str(uuid.uuid4())
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Code failed: {error_msg[:200]}. Asking LLM to fix it...'})}\n\n"
                else:
                    # Final attempt failed
                    _save(generation_id, req, full_response, code, "error", error_msg)
                    yield f"data: {json.dumps({'type': 'error', 'content': f'Execution failed after {MAX_RETRIES + 1} attempts: {error_msg}'})}\n\n"
                    return

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
