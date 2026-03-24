"""GET /api/history — list past generations for a session."""

from fastapi import APIRouter, Query

from app.models import firestore

router = APIRouter()


@router.get("/history")
async def list_history(session_id: str = Query(...)):
    """List past generations for a browser session."""
    if not firestore.is_available():
        return {"generations": [], "firebase_configured": False}

    generations = firestore.list_generations(session_id)
    return {"generations": generations, "firebase_configured": True}


@router.get("/history/{generation_id}")
async def get_history(generation_id: str):
    """Get a specific generation by ID."""
    if not firestore.is_available():
        return {"generation": None, "firebase_configured": False}

    generation = firestore.get_generation(generation_id)
    return {"generation": generation, "firebase_configured": True}
