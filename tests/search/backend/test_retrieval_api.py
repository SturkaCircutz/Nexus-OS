"""Authenticated HTTP contracts, limits, errors, and the runnable fixture flow."""

import pytest
from fastapi.testclient import TestClient

from main import app
from search.errors import RetrievalError
from search.models import SearchErrorCode

TOKEN = "test-only-retrieval-token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("NEXUS_API_TOKEN", TOKEN)
    monkeypatch.setenv("NEXUS_RETRIEVAL_MODE", "live")
    monkeypatch.delenv("NEXUS_GOOGLE_SEARCH_ENABLED", raising=False)
    with TestClient(app) as client:
        yield client


def test_health_docs_and_discovery(client):
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/docs").status_code == 200
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/api/v1/web/search"]["post"]["security"] == [{"HTTPBearer": []}]
    assert "422" in schema["paths"]["/api/v1/web/browse"]["post"]["responses"]
    result = client.get("/api/v1/tools", headers=HEADERS)
    assert result.status_code == 200
    assert result.json()["mode"] == "live"
    assert not result.json()["google_live_enabled"]
    assert len(result.json()["tools"]) == 2
    assert TOKEN not in result.text


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Basic wrong"}])
def test_authentication_is_required(client, headers):
    result = client.post("/api/v1/web/search", json={"query": "news"}, headers=headers)
    assert result.status_code == 401
    assert result.headers["www-authenticate"] == "Bearer"
    assert result.json()["error"]["code"] == "authentication_failed"
    assert result.json()["request_id"] == result.headers["x-request-id"]
    assert not app.state.retrieval_browser.running


def test_api_is_disabled_without_token(monkeypatch):
    monkeypatch.delenv("NEXUS_API_TOKEN", raising=False)
    with TestClient(app) as client:
        result = client.get("/api/v1/tools", headers=HEADERS)
    assert result.status_code == 503


@pytest.mark.parametrize("body", [{"query": " "}, {"query": "news", "limit": 11},
                                  {"query": "news", "limit": True}, {"query": "news", "extra": "secret"}])
def test_validation_is_structured_without_echoing_input(client, body):
    result = client.post("/api/v1/web/search", json=body, headers=HEADERS)
    assert result.status_code == 422
    assert result.json()["error"]["code"] == "invalid_request"
    assert "secret" not in result.text
    assert result.json()["request_id"] == result.headers["x-request-id"]


def test_malformed_json_and_large_body(client):
    result = client.post("/api/v1/web/search", content=b'{"query":', headers=HEADERS | {"Content-Type": "application/json"})
    assert result.status_code == 422
    result = client.post("/api/v1/web/search", content=b"x" * 17000, headers=HEADERS)
    assert result.status_code == 413
    assert result.json()["error"]["code"] == "content_too_large"


def test_live_search_disabled_and_private_fetch_rejected(client):
    search = client.post("/api/v1/web/search", json={"query": "news"}, headers=HEADERS)
    assert search.status_code == 403
    assert search.json()["error"]["code"] == "search_blocked"
    page = client.post("/api/v1/web/browse", json={"url": "http://127.0.0.1/"}, headers=HEADERS)
    assert page.status_code == 403
    assert page.json()["error"]["code"] == "unsafe_url"
    assert not app.state.retrieval_browser.running


def test_domain_timeout_maps_to_gateway_timeout(client, monkeypatch):
    async def fail(*args):
        return RetrievalError(SearchErrorCode.FETCH_TIMEOUT, "Page retrieval timed out.", retryable=True).response()
    monkeypatch.setattr(app.state.retrieval_tools, "fetch_page", fail)
    result = client.post("/api/v1/web/browse", json={"url": "https://example.org/"}, headers=HEADERS)
    assert result.status_code == 504
    assert result.json()["error"]["retryable"]


@pytest.mark.browser
def test_fixture_api_search_to_rendered_page(monkeypatch):
    monkeypatch.setenv("NEXUS_API_TOKEN", TOKEN)
    monkeypatch.setenv("NEXUS_RETRIEVAL_MODE", "fixtures")
    with TestClient(app) as client:
        result = client.post("/api/v1/web/search", json={"query": "desktop retrieval", "limit": 2}, headers=HEADERS)
        assert result.status_code == 200, result.text
        data = result.json()
        assert len(data["results"]) == 2
        assert data["warnings"][0]["code"] == "fixture_data"
        assert result.headers["x-nexus-retrieval-mode"] == "fixtures"
        page = client.post("/api/v1/web/browse", json={"url": data["results"][0]["url"]}, headers=HEADERS)
        assert page.status_code == 200, page.text
        assert "JavaScript can populate" in page.json()["article"]["text"]
        assert page.json()["warnings"][0]["code"] == "fixture_data"
        assert app.state.retrieval_browser.active_contexts == 0
        unavailable = client.post("/api/v1/web/browse", json={"url": "https://www.python.org/"}, headers=HEADERS)
        assert unavailable.status_code == 415
    assert not app.state.retrieval_browser.running


def test_invalid_mode_fails_startup(monkeypatch):
    monkeypatch.setenv("NEXUS_RETRIEVAL_MODE", "typo")
    with pytest.raises(ValueError, match="live or fixtures"):
        with TestClient(app): pass
