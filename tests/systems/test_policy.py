"""Policy, fingerprint, and approval tests (doc 04 phase 1 done criteria)."""

from __future__ import annotations

import pytest

from agent.execution.policy import (
    DecisionOutcome,
    Policy,
    proposal_fingerprint,
)
from agent.tools.registry import ToolRegistry
from config.engine_settings import EngineSettings
from schemas.contracts import (
    AgentRole,
    ApprovalStatus,
    ExecutionRequest,
    RiskClass,
    TaskPacket,
    TaskScope,
    ToolProposal,
)

REQUEST = "22222222-2222-2222-2222-222222222222"
TASK = "task:direct"
PROPOSAL = "proposal:direct"


def make_packet() -> TaskPacket:
    return TaskPacket(
        task_id=TASK, request_id=REQUEST, assigned_to=AgentRole.recipe,
        objective="Open application browser",
        allowed_capabilities=["open_application", "system_diagnostics"],
        idempotency_key="fast_direct:" + REQUEST,
    )


def make_proposal(packet: TaskPacket, **overrides) -> ToolProposal:
    values = dict(
        proposal_id=PROPOSAL, task_id=packet.task_id, tool_id="open_application",
        tool_version="1", args={"application_id": "browser"},
        target_refs=["app:browser"], reason="open_application",
        risk="reversible_write", side_effect=True,
    )
    values.update(overrides)
    fingerprint = proposal_fingerprint(
        values["tool_id"], values["tool_version"], values["args"],
        values["target_refs"], packet,
    )
    return ToolProposal.model_validate({**values, "proposal_fingerprint": fingerprint})


@pytest.fixture()
def policy(tmp_path) -> Policy:
    settings = EngineSettings.for_test(tmp_path)
    return Policy(ToolRegistry(), settings, approval_service=None)


def test_fingerprint_mutation_invalidates(policy: Policy):
    packet = make_packet()
    proposal = make_proposal(packet)
    same = make_proposal(packet)
    assert proposal.proposal_fingerprint == same.proposal_fingerprint
    mutated_args = make_proposal(packet, args={"application_id": "calculator"})
    assert mutated_args.proposal_fingerprint != proposal.proposal_fingerprint
    mutated_target = make_proposal(packet, target_refs=["app:calculator"])
    assert mutated_target.proposal_fingerprint != proposal.proposal_fingerprint
    mutated_version = make_proposal(packet, tool_version="2")
    assert mutated_version.proposal_fingerprint != proposal.proposal_fingerprint


def test_policy_denies_unregistered_tool(policy: Policy):
    packet = make_packet()
    illegal = ToolProposal.model_validate({
        "proposal_id": "proposal:rogue", "task_id": packet.task_id,
        "tool_id": "delete_everything", "tool_version": "1", "args": {},
        "target_refs": [], "reason": "clean up", "risk": "destructive",
        "side_effect": True, "proposal_fingerprint": "x",
    })
    assert policy.validate_proposal_binding(illegal, packet) == "TOOL_UNAVAILABLE"
    decision = policy.evaluate(illegal, packet, session_id="s")
    assert decision.outcome == DecisionOutcome.denied


def test_policy_denies_capability_outside_packet(policy: Policy):
    packet = make_packet().model_copy(update={"allowed_capabilities": ["file_search"]})
    proposal = make_proposal(packet)
    assert policy.validate_proposal_binding(proposal, packet) == "POLICY_DENIED"


def test_policy_denies_target_outside_scope(policy: Policy):
    packet = make_packet().model_copy(update={
        "scope": TaskScope(allowed_targets=["app:calculator"]),
    })
    proposal = make_proposal(packet)
    binding = policy.validate_proposal_binding(proposal, packet)
    assert binding == "TARGET_NOT_FOUND"


def test_policy_denies_lowered_risk_claim(policy: Policy):
    packet = make_packet()
    proposal = make_proposal(packet, risk="read_only", side_effect=False)
    # fingerprint still consistent, but claimed risk drops below registry
    binding = policy.validate_proposal_binding(proposal, packet)
    assert binding == "POLICY_DENIED"


def test_policy_denies_unknown_targets(policy: Policy):
    packet = make_packet()
    proposal = make_proposal(packet, target_refs=["shell:rm -rf /"])
    assert policy.validate_proposal_binding(proposal, packet) == "TARGET_NOT_FOUND"


def test_policy_read_only_runs_without_dialog(policy: Policy):
    packet = make_packet()
    proposal = ToolProposal.model_validate({
        "proposal_id": PROPOSAL, "task_id": packet.task_id,
        "tool_id": "system_diagnostics", "tool_version": "1", "args": {},
        "target_refs": ["engine:local"], "reason": "diagnostics",
        "risk": "read_only", "side_effect": False,
        "proposal_fingerprint": proposal_fingerprint(
            "system_diagnostics", "1", {}, ["engine:local"], packet),
    })
    decision = policy.evaluate(proposal, packet, session_id="session")
    assert decision.outcome == DecisionOutcome.auto_approve


def test_policy_destructive_requires_approval(policy: Policy):
    packet = make_packet()
    proposal = ToolProposal.model_validate({
        "proposal_id": PROPOSAL, "task_id": packet.task_id,
        "tool_id": "system_diagnostics", "tool_version": "1", "args": {},
        "target_refs": ["engine:local"], "reason": "diagnostics",
        "risk": "destructive", "side_effect": True,
        "proposal_fingerprint": proposal_fingerprint(
            "system_diagnostics", "1", {}, ["engine:local"], packet),
    })
    decision = policy.evaluate(proposal, packet, session_id="session")
    assert decision.outcome == DecisionOutcome.approval_required
    assert decision.approval is not None
    assert decision.approval.status == ApprovalStatus.pending
    assert decision.approval.expires_at
