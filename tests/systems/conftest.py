"""Shared pytest setup for AI Core systems tests (backend import path)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "apps" / "engine" / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from agent.core import CoreEngine  # noqa: E402
from config.engine_settings import EngineSettings  # noqa: E402
from database.repositories import Repositories  # noqa: E402
from database.session import SessionManager  # noqa: E402
from schemas.contracts import RequestEnvelope, utc_now_iso  # noqa: E402


@pytest.fixture()
def engine(tmp_path: Path) -> CoreEngine:
    """ isolated engine: own database, artifacts, and checkpoints per test."""
    settings = EngineSettings.for_test(tmp_path)
    core = CoreEngine(settings)
    try:
        yield core
    finally:
        core.close()


@pytest.fixture()
def repos(engine: CoreEngine) -> Repositories:
    return engine.repos


import uuid


def make_envelope(user_input: str, session_id: str = "11111111-1111-1111-1111-111111111111",
                  parent_request_id: str | None = None) -> RequestEnvelope:
    return RequestEnvelope(
        request_id=str(uuid.uuid4()),
        session_id=session_id,
        parent_request_id=parent_request_id,
        user_input=user_input,
        submitted_at=utc_now_iso(),
    )


def seeded_memory(engine: CoreEngine, content: str, title: str = "decision note",
                  memory_id: str = "memory:seeded") -> None:
    engine.repos.memories.create(
        memory_id=memory_id,
        tier="M3",
        kind="fact",
        content=content,
        title=title,
        provenance_refs=["seed:test"],
        confidence=0.95,
        sensitivity="normal",
    )
