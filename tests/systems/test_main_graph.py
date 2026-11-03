"""Main graph lifecycle tests (doc 04 phase 2 done criteria)."""

from __future__ import annotations

import asyncio

import pytest

from config.engine_settings import EngineSettings

SESSION = "11111111-1111-1111-1111-111111111111"
MEMORY_SEED = ("NEXUS desktop architecture decision: Python owns backend "
               "authority while Rust stays a typed native window executor.")


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def env(tmp_path):
    from agent.core import CoreEngine

    engine = CoreEngine(EngineSettings.for_test(tmp_path))
    try:
        yield engine
    finally:
        engine.close()


def test_fast_diagnostics_runs_full_lifecycle(env):
    result = run(env.handle_request(_envelope("run system diagnostics")))
    assert result.route == "fast_direct"
    assert result.status == "completed"
    assert result.receipt_refs != []
    assert "diagnostics" in result.response_text.lower()
    # Every response is linked to its request (audit reconstruction, doc 04 r12)
    events = env.repos.audit.list_for_request(result.request_id)
    types = {row["event_type"] for row in events}
    assert {"request_received", "node_choose_route", "receipt_recorded",
            "request_completed"} <= types


def test_unknown_open_target_stops_for_clarification(env):
    result = run(env.handle_request(_envelope("open time machine")))
    assert result.route == "clarify"
    assert result.status == "completed"
    assert "Which application" in result.response_text
    assert result.pending_approval is None


def test_ambiguous_short_input_clarifies(env):
    result = run(env.handle_request(_envelope("hi there")))
    assert result.route == "clarify"
    assert result.response_text.startswith("What exactly")


def test_supervised_knowledge_answers_with_evidence(env):
    _seed_memory(env)
    result = run(env.handle_request(_envelope(
        "What desktop architecture decision did we make?")))
    assert result.route == "supervised"
    assert result.status == "completed"
    assert "Python owns backend authority" in result.response_text
    assert result.evidence_refs and result.evidence_refs[0].startswith("memory:")
    # No execution occurred: no receipt needed for a knowledge-only answer.
    assert result.receipt_refs != []  # memory_lookup is still receipt-backed


def test_graph_writes_memory_after_completion(env):
    result = run(env.handle_request(_envelope("What did we decide about desktop "
                                              "architecture and windows?")))
    memories = env.repos.memories.list_recent(limit=5)
    assert memories, "an accepted C8 proposal should have become durable"
    seeded_row = memories[0]
    assert seeded_row["status"] == "active"
    assert result.request_id


def _seed_memory(env) -> None:
    env.repos.memories.create(
        memory_id="memory:seed", tier="M3", kind="fact",
        content=MEMORY_SEED, title="architecture decision",
        provenance_refs=["seed:test"], confidence=0.95, sensitivity="normal",
    )


def _envelope(user_input: str):
    from schemas.contracts import RequestEnvelope, utc_now_iso

    return RequestEnvelope.from_raw({
        "user_input": user_input, "session_id": SESSION,
        "submitted_at": utc_now_iso(),
    })
