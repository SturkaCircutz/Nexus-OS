"""In-process FastAPI test-client smoke tests."""

from fastapi.testclient import TestClient

from main import app


def test_health_endpoint_in_process() -> None:
    with TestClient(app) as client:
        runtime = app.state.retrieval_browser
        assert app.state.retrieval_tools is app.state.retrieval_registry.web
        assert not runtime.running
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "nexus-engine"}
    assert not runtime.running
    assert runtime.active_contexts == 0
