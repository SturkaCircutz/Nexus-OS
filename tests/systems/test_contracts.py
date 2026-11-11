"""Contract tests (doc 04: invalid authority-bearing envelopes never cross)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas.contracts import (
    AgentResult,
    ApprovalRequest,
    ExecutionReceipt,
    ExecutionRequest,
    LifecycleStatus,
    MainGraphState,
    RequestEnvelope,
    TaskPacket,
    ToolProposal,
    utc_now_iso,
)

SESSION = "11111111-1111-1111-1111-111111111111"
REQUEST = "22222222-2222-2222-2222-222222222222"
TASK = "task-1"
PROP = "proposal-1"


# ---------------------------------------------------------------------------
# C1 - RequestEnvelope
# ---------------------------------------------------------------------------


def test_c1_accepts_valid_envelope():
    envelope = RequestEnvelope(
        request_id=REQUEST, session_id=SESSION, user_input="hello",
        submitted_at=utc_now_iso(),
    )
    assert envelope.contract_version == "1"
    assert envelope.request_id == REQUEST


def test_c1_rejects_unknown_authority_fields():
    with pytest.raises(ValidationError):
        RequestEnvelope.model_validate({
            "request_id": REQUEST, "session_id": SESSION, "user_input": "hi",
            "submitted_at": utc_now_iso(),
            "policy_override": "allow_everything",  # unknown => rejected
        })


def test_c1_rejects_non_uuid_identity():
    with pytest.raises(ValidationError):
        RequestEnvelope.model_validate({
            "request_id": "not-a-uuid", "session_id": SESSION, "user_input": "hi",
            "submitted_at": utc_now_iso(),
        })


def test_c1_rejects_bad_timestamp_and_empty_input():
    with pytest.raises(ValidationError):
        RequestEnvelope.model_validate({
            "request_id": REQUEST, "session_id": SESSION, "user_input": "hi",
            "submitted_at": "yesterday",
        })
    with pytest.raises(ValidationError):
        RequestEnvelope.model_validate({
            "request_id": REQUEST, "session_id": SESSION, "user_input": "",
            "submitted_at": utc_now_iso(),
        })


def test_c1_from_raw_generates_ids_at_boundary():
    envelope = RequestEnvelope.from_raw({"user_input": "plan my day"})
    assert envelope.request_id and envelope.session_id
    assert envelope.submitted_at.endswith("Z")


# ---------------------------------------------------------------------------
# C2 - MainGraphState vocabulary
# ---------------------------------------------------------------------------


def test_c2_status_vocabulary_is_closed():
    with pytest.raises(ValidationError):
        MainGraphState.model_validate({
            "request": {"request_id": REQUEST, "session_id": SESSION,
                        "user_input": "hi", "submitted_at": utc_now_iso()},
            "status": "winging_it",
        })


def test_c2_uses_canonical_status():
    state = MainGraphState.model_validate({
        "request": {"request_id": REQUEST, "session_id": SESSION,
                    "user_input": "hi", "submitted_at": utc_now_iso()},
        "status": "awaiting_approval",
    })
    assert state.status == LifecycleStatus.awaiting_approval


# ---------------------------------------------------------------------------
# C3/C4/C6/C7/C9 shapes
# ---------------------------------------------------------------------------


def test_c3_rejects_unknown_capability_shape():
    packet = TaskPacket(
        task_id=TASK, request_id=REQUEST, assigned_to="knowledge",
        objective="answer", allowed_capabilities=["memory_lookup"],
        idempotency_key="k1",
    )
    assert packet.assigned_to.value == "knowledge"
    with pytest.raises(ValidationError):
        TaskPacket.model_validate({
            "task_id": TASK, "request_id": REQUEST, "assigned_to": "hacker",
            "objective": "take over", "idempotency_key": "k",
        })


def test_c4_risk_vocabulary_is_closed():
    with pytest.raises(ValidationError):
        ToolProposal.model_validate({
            "proposal_id": PROP, "task_id": TASK, "tool_id": "file_search",
            "tool_version": "1", "args": {}, "reason": "why", "risk": "armageddon",
            "side_effect": False, "proposal_fingerprint": "deadbeef",
        })


def test_c6_strict_fields():
    request = ExecutionRequest(
        execution_id="exec-1", proposal_id=PROP, proposal_fingerprint="f",
        idempotency_key="k1",
    )
    assert request.approval_id is None
    with pytest.raises(ValidationError):
        ExecutionRequest.model_validate({
            "execution_id": "exec-1", "proposal_id": PROP, "proposal_fingerprint": "f",
            "idempotency_key": "k1", "forged_grant": True,
        })


def test_c7_receipt_status_vocabulary():
    with pytest.raises(ValidationError):
        ExecutionReceipt.model_validate({
            "execution_id": "exec-1", "status": "probably_fine",
            "started_at": utc_now_iso(),
        })


def test_c9_agent_result_requires_known_status():
    result = AgentResult(
        task_id=TASK, agent="recipe", status="completed", summary="done",
    )
    assert result.agent.value == "recipe"
    with pytest.raises(ValidationError):
        AgentResult.model_validate({
            "task_id": TASK, "agent": "recipe", "status": "vibed", "summary": "?"
        })


def test_status_values_match_glossary():
    values = {status.value for status in LifecycleStatus}
    assert values == {
        "received", "planning", "running", "awaiting_approval",
        "reconciling", "completed", "failed", "cancelled",
    }
