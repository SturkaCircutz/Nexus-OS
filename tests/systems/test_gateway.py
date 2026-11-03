"""Gateway idempotency, receipt, and approval-binding tests (doc 04 phase 1)."""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest

from agent.tools.registry import ToolRegistry
from config.engine_settings import EngineSettings
from schemas.contracts import (
    AgentRole,
    ApprovalRequest,
    ApprovalStatus,
    ExecutionRequest,
    RequestEnvelope,
    ReceiptStatus,
    ErrorCode,
    TaskPacket,
    ToolProposal,
    utc_now_iso,
)

REQUEST = "22222222-2222-2222-2222-222222222222"
SESSION = "11111111-1111-1111-1111-111111111111"
TASK = "task:g"
PROPOSAL = "proposal:g"


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def seeded_envelope(engine, user_input: str) -> RequestEnvelope:
    envelope = RequestEnvelope.from_raw({
        "user_input": user_input, "request_id": REQUEST,
        "session_id": SESSION, "submitted_at": utc_now_iso(),
    })
    engine.repos.requests.create(envelope)
    return envelope


@pytest.fixture()
def env(tmp_path):
    settings = EngineSettings.for_test(tmp_path)
    from agent.core import CoreEngine

    engine = CoreEngine(settings)
    try:
        yield engine
    finally:
        engine.close()


def sysdiagnostics_packet() -> TaskPacket:
    return TaskPacket(
        task_id=TASK, request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Run local system diagnostics",
        allowed_capabilities=["system_diagnostics"],
        idempotency_key="key:g:diag",
    )


def sysdiagnostics_proposal(pk: TaskPacket) -> ToolProposal:
    from agent.execution.policy import proposal_fingerprint as fp

    return ToolProposal(
        proposal_id=PROPOSAL, task_id=pk.task_id,
        tool_id="system_diagnostics", tool_version="1", args={},
        target_refs=["engine:local"], reason="diagnostics",
        risk="read_only", side_effect=False,
        proposal_fingerprint=fp("system_diagnostics", "1", {}, ["engine:local"], pk),
    )


def openapp_packet() -> TaskPacket:
    return TaskPacket(
        task_id=TASK, request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Open application browser",
        allowed_capabilities=["open_application"],
        idempotency_key="key:g:open",
    )


def openapp_proposal(pk: TaskPacket) -> ToolProposal:
    from agent.execution.policy import proposal_fingerprint as fp

    return ToolProposal(
        proposal_id=PROPOSAL, task_id=pk.task_id,
        tool_id="open_application", tool_version="1",
        args={"application_id": "browser"}, target_refs=["app:browser"],
        reason="open_application", risk="reversible_write", side_effect=True,
        proposal_fingerprint=fp("open_application", "1", {"application_id": "browser"},
                                ["app:browser"], pk),
    )


def _execution(engine, prop: ToolProposal, key: str, approval_id=None) -> ExecutionRequest:
    return ExecutionRequest(
        execution_id=f"exec:{uuid4().hex[:8]}", proposal_id=prop.proposal_id,
        proposal_fingerprint=prop.proposal_fingerprint,
        idempotency_key=key, approval_id=approval_id,
        granted_capability_refs=[prop.tool_id],
    )


def test_read_only_execution_succeeds_with_receipt(env):
    pk = sysdiagnostics_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "diagnostics")
    prop = sysdiagnostics_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    receipt = run(env.gateway.execute(_execution(env, prop, "key:g:1"),
                                      env.adapter_context, approved_session_id=SESSION))
    assert receipt.status == ReceiptStatus.succeeded
    assert receipt.error is None
    assert receipt.output_ref and receipt.output_ref.startswith("audit:")
    assert receipt.finished_at is not None


def test_idempotent_key_returns_same_receipt_without_rerun(env):
    pk = sysdiagnostics_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "diagnostics")
    prop = sysdiagnostics_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    gateway = env.gateway

    first = run(gateway.execute(_execution(env, prop, "key:g:2"),
                                env.adapter_context, approved_session_id=SESSION))
    retry = _execution(env, prop, "key:g:2")  # same idempotency key, new request id
    second = run(gateway.execute(retry, env.adapter_context, approved_session_id=SESSION))
    assert second.model_dump(mode="json") == first.model_dump(mode="json")
    # Only one execution row: the retry never re-invoked the adapter.
    rows = env.repos.executions.find_by_idempotency_key("key:g:2")
    assert rows is not None and rows["execution_id"] == first.execution_id


def test_started_without_receipt_becomes_unknown_outcome(env):
    pk = sysdiagnostics_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "diagnostics")
    prop = sysdiagnostics_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    crashed = _execution(env, prop, "key:g:3")
    # Worker started the run, then the engine crashed before any receipt:
    # only a started row exists. The gateway must NOT re-run anything.
    env.repos.executions.start(crashed, prop.tool_id, fingerprint_verified=True)
    retry_execution = _execution(env, prop, "key:g:3")
    receipt = run(env.gateway.execute(retry_execution, env.adapter_context,
                                      approved_session_id=SESSION))
    assert receipt.status == ReceiptStatus.unknown_outcome
    assert receipt.error is not None and receipt.error.code == ErrorCode.UNKNOWN_OUTCOME


def test_side_effect_without_valid_approval_is_rejected(env):
    pk = openapp_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "open browser")
    prop = openapp_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    receipt = run(env.gateway.execute(_execution(env, prop, "key:g:4"),
                                      env.adapter_context, approved_session_id=SESSION))
    assert receipt.status == ReceiptStatus.failed
    assert receipt.error is not None and receipt.error.code == ErrorCode.POLICY_DENIED


def test_expired_approval_is_rejected(env):
    pk = openapp_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "open browser")
    prop = openapp_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    expired = ApprovalRequest(
        approval_id="approval:expired", proposal_id=prop.proposal_id,
        proposal_fingerprint=prop.proposal_fingerprint, summary="Expired",
        status=ApprovalStatus.approved, created_at="2020-01-01T00:00:00Z",
        expires_at="2020-01-01T00:05:00Z",
    )
    env.repos.approvals.create(expired, SESSION)
    receipt = run(env.gateway.execute(
        _execution(env, prop, "key:g:5", approval_id="approval:expired"),
        env.adapter_context, approved_session_id=SESSION))
    assert receipt.status == ReceiptStatus.failed
    assert receipt.error is not None and receipt.error.code == ErrorCode.POLICY_DENIED


def test_invalid_approval_fingerprint_is_rejected(env):
    """A stored approval bound to a DIFFERENT fingerprint cannot execute."""
    pk = openapp_packet()
    env.repos.tasks.create(pk)
    seeded_envelope(env, "open browser")
    prop = openapp_proposal(pk)
    env.repos.proposals.create(prop, REQUEST)
    approval = ApprovalRequest(
        approval_id="approval:other", proposal_id=prop.proposal_id,
        proposal_fingerprint="DIFFERENT_FINGERPRINT", summary="Wrong binding",
        status=ApprovalStatus.approved, created_at=utc_now_iso(),
        expires_at="2099-01-01T00:00:00Z",
    )
    env.repos.approvals.create(approval, SESSION)
    receipt = run(env.gateway.execute(
        _execution(env, prop, "key:g:6", approval_id="approval:other"),
        env.adapter_context, approved_session_id=SESSION))
    assert receipt.status == ReceiptStatus.failed
    assert receipt.error is not None and receipt.error.code == ErrorCode.POLICY_DENIED
