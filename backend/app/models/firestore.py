"""Firestore client for persisting generations and chat history.

Falls back to local-only mode if Firebase credentials aren't configured.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

_db = None
_storage_bucket = None
_firebase_available = False


def _init_firebase():
    """Lazy-initialize Firebase. Only called on first DB access."""
    global _db, _storage_bucket, _firebase_available
    if _db is not None or not _firebase_available:
        return

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, storage

        if not firebase_admin._apps:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, {
                    "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", ""),
                })
            else:
                # No credentials — run in local-only mode
                return

        _db = firestore.client()
        try:
            _storage_bucket = storage.bucket()
        except Exception:
            _storage_bucket = None
        _firebase_available = True
    except Exception:
        pass


def is_available() -> bool:
    """Check if Firestore is configured and accessible."""
    _init_firebase()
    return _firebase_available


def save_generation(
    generation_id: str,
    prompt: str,
    model: str,
    llm_response: str,
    generated_code: Optional[str],
    status: str,
    error_message: Optional[str] = None,
    amxd_path: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Save a generation record to Firestore (or return dict for local mode)."""
    doc = {
        "prompt": prompt,
        "model": model,
        "llm_response": llm_response,
        "generated_code": generated_code,
        "status": status,
        "error_message": error_message,
        "amxd_path": amxd_path,
        "session_id": session_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    _init_firebase()
    if _db:
        _db.collection("generations").document(generation_id).set(doc)

    return {"id": generation_id, **doc}


def get_generation(generation_id: str) -> Optional[dict]:
    """Fetch a generation by ID."""
    _init_firebase()
    if not _db:
        return None
    doc = _db.collection("generations").document(generation_id).get()
    if doc.exists:
        return {"id": doc.id, **doc.to_dict()}
    return None


def list_generations(session_id: str, limit: int = 50) -> list[dict]:
    """List generations for a session, newest first."""
    _init_firebase()
    if not _db:
        return []
    query = (
        _db.collection("generations")
        .where("session_id", "==", session_id)
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def upload_amxd(generation_id: str, local_path: str) -> Optional[str]:
    """Upload .amxd to Firebase Storage and return the public URL."""
    _init_firebase()
    if not _storage_bucket:
        return None

    blob = _storage_bucket.blob(f"generations/{generation_id}/device.amxd")
    blob.upload_from_filename(local_path, content_type="application/octet-stream")
    blob.make_public()
    return blob.public_url
