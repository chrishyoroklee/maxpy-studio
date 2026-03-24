"""Tests for API endpoints."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestDownloadEndpoint:
    def test_missing_generation_returns_404(self):
        response = client.get("/api/download/nonexistent-id")
        assert response.status_code == 404

    def test_download_requires_valid_id(self):
        response = client.get("/api/download/../../../etc/passwd")
        assert response.status_code == 404


class TestGenerateEndpoint:
    def test_missing_api_key_returns_422(self):
        response = client.post(
            "/api/generate",
            json={"prompt": "make a tremolo"},
        )
        assert response.status_code == 422

    def test_with_api_key_header_accepted(self):
        """The request format is accepted (actual LLM call will fail with fake key)."""
        response = client.post(
            "/api/generate",
            json={"prompt": "make a tremolo"},
            headers={"X-API-Key": "fake-key-for-testing"},
        )
        # Should return 200 (SSE stream), even if the LLM call inside fails
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"


class TestHistoryEndpoint:
    def test_history_without_firebase(self):
        response = client.get("/api/history?session_id=test-session")
        assert response.status_code == 200
        data = response.json()
        assert "generations" in data
        assert data["firebase_configured"] is False
