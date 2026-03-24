"""GET /api/download/{generation_id} — download generated .amxd file."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()


@router.get("/download/{generation_id}")
async def download(generation_id: str):
    """Download the generated .amxd file for a given generation."""
    amxd_path = settings.output_path / generation_id / "device.amxd"

    if not amxd_path.exists():
        raise HTTPException(status_code=404, detail="Generation not found")

    return FileResponse(
        path=str(amxd_path),
        filename="device.amxd",
        media_type="application/octet-stream",
    )
