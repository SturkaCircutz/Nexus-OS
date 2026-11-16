"""Shared fixtures for Search & Discover backend tests."""

from __future__ import annotations

import socket
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "apps" / "engine" / "backend"
FIXTURES_ROOT = REPO_ROOT / "tests" / "search" / "fixtures"


def pytest_addoption(parser):
    parser.addoption("--run-browser", action="store_true", help="Run offline Chromium integration tests")


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--run-browser"):
        for item in items:
            if "browser" in item.keywords:
                item.add_marker(pytest.mark.skip(reason="enable offline Chromium tests with --run-browser"))

sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def provider_fixtures() -> Path:
    return FIXTURES_ROOT / "provider"


@pytest.fixture
def html_fixtures() -> Path:
    return FIXTURES_ROOT / "html"


@pytest.fixture(autouse=True)
def deny_network(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> None:
    """Fail tests that attempt real network access unless explicitly opted in."""

    if request.node.get_closest_marker("allow_network"):
        return

    def blocked(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("network access is disabled in Search & Discover tests")

    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket.socket, "connect", blocked)
