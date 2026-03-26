"""GET /api/templates — list and retrieve base device templates."""

from pathlib import Path

from fastapi import APIRouter, HTTPException

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
