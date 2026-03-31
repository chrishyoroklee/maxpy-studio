"""Templates API — list, retrieve, and build base device templates."""

import base64
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.core.sandbox import execute, SandboxError

logger = logging.getLogger(__name__)

router = APIRouter()

TEMPLATES_DIR = Path(__file__).parent.parent / "prompts" / "templates"

TEMPLATE_META = {
    "m4l_chorus": {"label": "Chorus", "description": "Stereo widening with rate & depth", "type": "audio_effect"},
    "m4l_tremolo": {"label": "Tremolo", "description": "Amplitude modulation with sync", "type": "audio_effect"},
    "m4l_eq": {"label": "3-Band EQ", "description": "Shape lows, mids & highs", "type": "audio_effect"},
    "m4l_reverb": {"label": "Reverb", "description": "Room simulation with decay", "type": "audio_effect"},
    "m4l_stereo_delay": {"label": "Stereo Delay", "description": "Echo with feedback", "type": "audio_effect"},
    "m4l_lofi": {"label": "Lo-Fi", "description": "Bit reduction & aliasing", "type": "audio_effect"},
    "m4l_mono_synth": {"label": "Mono Synth", "description": "Subtractive mono synthesizer", "type": "instrument"},
    "m4l_hihat": {"label": "Hi-Hat", "description": "Drum synthesis hi-hat", "type": "instrument"},
    "m4l_distortion": {"label": "Distortion", "description": "Tube screamer style overdrive", "type": "audio_effect"},
    "m4l_bass_synth": {"label": "Bass Synth", "description": "Moog-inspired subtractive bass", "type": "instrument"},
    "m4l_compressor": {"label": "Compressor", "description": "SSL-style bus compressor", "type": "audio_effect"},
}


@router.get("/templates")
async def list_templates():
    """List available base device templates."""
    return [
        {"name": name, **meta}
        for name, meta in TEMPLATE_META.items()
        if (TEMPLATES_DIR / f"{name}.py").exists()
    ]


@router.get("/templates/{name}")
async def get_template(name: str):
    """Get the Python source code for a template."""
    path = TEMPLATES_DIR / f"{name}.py"
    if not path.exists() or name not in TEMPLATE_META:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    return {"name": name, "code": path.read_text(), **TEMPLATE_META[name]}


@router.post("/templates/{name}/build")
async def build_template(name: str):
    """Execute a template directly and return the .amxd (no LLM)."""
    path = TEMPLATES_DIR / f"{name}.py"
    if not path.exists() or name not in TEMPLATE_META:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")

    code = path.read_text()
    try:
        result = execute(code)
        amxd_file = result.files.get("amxd")
        if not amxd_file or not amxd_file.exists():
            raise HTTPException(status_code=500, detail="No .amxd generated")
        amxd_b64 = base64.b64encode(amxd_file.read_bytes()).decode("ascii")
        return {
            "generation_id": result.generation_id,
            "amxd_b64": amxd_b64,
            "stdout": result.stdout,
        }
    except SandboxError as e:
        logger.error("Template build failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
