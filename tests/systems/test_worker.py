"""Worker scope enforcement tests (doc 04: a worker cannot widen its packet)."""

from __future__ import annotations

import asyncio

import pytest

from config.engine_settings import EngineSettings
from schemas.contracts import (
    AgentResultStatus,
    AgentRole,
    ApprovalStatus,
    ErrorCode,
    ReceiptStatus,
    TaskPacket,
    TaskScope,
    utc_now_iso,
)

REQUEST = "22222222-2222-2222-2222-222222222222"
SESSION = "11111111-1111-1111-1111-111111111111"


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


@pytest.fixture()
def env(tmp_path):
    from agent.core import CoreEngine

    engine = CoreEngine(EngineSettings.for_test(tmp_path))
    try:
        yield engine
    finally:
        engine.close()


def _seed(engine, user_input: str) -> None:
    from schemas.contracts import RequestEnvelope

    envelope = RequestEnvelope.from_raw({
        "user_input": user_input, "request_id": REQUEST,
        "session_id": SESSION, "submitted_at": utc_now_iso(),
    })
    engine.repos.requests.create(envelope)


def test_worker_rejects_unknown_capability(env):
    _seed(env, "hello there")
    packet = TaskPacket(
        task_id="task:w1", request_id=REQUEST, assigned_to=AgentRole.desktop,
        objective="do something", allowed_capabilities=["rm_dash_rf"],
        idempotency_key="w1",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    assert worker_run.result.status == AgentResultStatus.failed
    assert worker_run.result.error.code == ErrorCode.POLICY_DENIED
    assert worker_run.receipt is None
    assert worker_run.proposal is None


def test_worker_rejects_unassignable_role(env):
    _seed(env, "hello there")
    packet = TaskPacket(
        task_id="task:w2", request_id=REQUEST, assigned_to=AgentRole.supervisor,
        objective="supervise myself into a tool call",
        allowed_capabilities=["system_diagnostics"], idempotency_key="w2",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    assert worker_run.result.status == AgentResultStatus.failed
    assert worker_run.result.error.code == ErrorCode.POLICY_DENIED


def test_worker_rejects_missing_capability_allowlist(env):
    _seed(env, "hello there")
    packet = TaskPacket(
        task_id="task:w3", request_id=REQUEST, assigned_to=AgentRole.knowledge,
        objective="Answer from durable knowledge: nothing",
        allowed_capabilities=[], idempotency_key="w3",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    assert worker_run.result.status == AgentResultStatus.failed
    assert worker_run.result.error.code == ErrorCode.POLICY_DENIED


def test_worker_diagnostics_recipe_completes_with_receipt(env):
    _seed(env, "run system diagnostics")
    packet = TaskPacket(
        task_id="task:w4", request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Run local system diagnostics and record observations",
        allowed_capabilities=["system_diagnostics"], idempotency_key="w4",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    result = worker_run.result
    assert result.status == AgentResultStatus.completed
    assert result.receipt_refs != []
    assert result.agent == AgentRole.recipe


def test_worker_open_browser_waits_for_exact_approval(env):
    """reversible_write -> policy creates a pending C5 bound to the proposal."""
    _seed(env, "open browser")
    packet = TaskPacket(
        task_id="task:w5", request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Open application browser",
        allowed_capabilities=["open_application"], idempotency_key="w5",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    assert worker_run.result.status == AgentResultStatus.needs_input
    assert worker_run.proposal is not None
    approvals = env.repos.approvals.list_for_session(SESSION, ApprovalStatus.pending.value)
    assert len(approvals) == 1
    row = approvals[0]
    assert row["proposal_fingerprint"] == worker_run.proposal.proposal_fingerprint
    assert row["summary"].startswith("Allow open_application")


def test_resume_after_approval_hits_typed_native_seam(env):
    """Approved work resumes through the SAME fingerprint; the unwired native
    transport fails closed with a typed TOOL_UNAVAILABLE receipt."""
    _seed(env, "open browser")
    packet = TaskPacket(
        task_id="task:w6", request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Open application browser",
        allowed_capabilities=["open_application"], idempotency_key="w6",
    )
    env.repos.tasks.create(packet)  # the main graph normally persists tasks
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    assert worker_run.result.status == AgentResultStatus.needs_input
    approval = env.repos.approvals.list_for_session(SESSION, ApprovalStatus.pending.value)[0]

    outcome = run(env.resume_after_decision(
        approval["approval_id"], "approved", SESSION))
    assert outcome.status == "completed"
    code = outcome.errors[0].code if outcome.errors else None
    assert code == ErrorCode.TOOL_UNAVAILABLE
    assert outcome.receipt_refs != []
    receipt_row = env.repos.executions.find_by_idempotency_key("w6")
    assert receipt_row["receipt_status"] == ReceiptStatus.failed.value


def test_worker_cannot_dial_targets_outside_packet_scope(env):
    _seed(env, "open calculator")
    packet = TaskPacket(
        task_id="task:w7", request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Open application calculator",
        allowed_capabilities=["open_application"],
        scope=TaskScope(allowed_targets=["app:browser"]),  # request targets calculator
        idempotency_key="w7",
    )
    worker_run = run(env.worker.run(packet, REQUEST, SESSION))
    result = worker_run.result
    assert result.status == AgentResultStatus.failed
    assert result.error is not None
    assert result.error.code == ErrorCode.TARGET_NOT_FOUND
