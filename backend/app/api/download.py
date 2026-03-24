"""GET /api/download/{generation_id} — download generated .amxd file."""

import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.I,
)


@router.get("/download/{generation_id}")
async def download(generation_id: str):
    """Download the generated .amxd file for a given generation."""
    # Validate UUID format to prevent path traversal
    if not UUID_RE.match(generation_id):
        raise HTTPException(status_code=400, detail="Invalid generation ID")

    amxd_path = (settings.output_path / generation_id / "device.amxd").resolve()

    # Verify the resolved path is within the output directory
    if not str(amxd_path).startswith(str(settings.output_path.resolve())):
        raise HTTPException(status_code=400, detail="Invalid generation ID")

    if not amxd_path.exists():
        raise HTTPException(status_code=404, detail="Generation not found")

    return FileResponse(
        path=str(amxd_path),
        filename="device.amxd",
        media_type="application/octet-stream",
    )
