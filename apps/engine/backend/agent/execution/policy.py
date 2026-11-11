"""Policy evaluation and the approval service (Phase 1 trusted execution core).

Doc 04 non-negotiables anchored here:
- rule 2: deterministic first - risk, fingerprints, expiry, and scope are
  typed Python code, never prompt text (rule 9: no policy in prompts).
- rule 4: approve exact work - approval is bound to the proposal fingerprint
  (canonical tool, version, args, targets, scope); any material change
  produces a new proposal and invalidates the old approval.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional, Protocol

from schemas.contracts import (
    ApprovalRequest,
    ApprovalStatus,
    RISK_SEVERITY,
    RiskClass,
    TaskPacket,
    ToolProposal,
    utc_now_iso,
)

class DecisionOutcome(str, Enum):
    auto_approve = "auto_approve"
    approval_required = "approval_required"
    denied = "denied"


@dataclass(frozen=True)
class PolicyTargetRule:
    """Deterministic target rule: proposal target_refs must fit within an
    approved rule family (doc 06 "allowed target rules")."""

    rule_id: str
    prefixes: tuple[str, ...]

    def accepts(self, target_ref: str) -> bool:
        return any(target_ref.startswith(prefix) for prefix in self.prefixes)


# Starter target families; extend deliberately (doc 06 stop-and-ask).
TARGET_RULES: tuple[PolicyTargetRule, ...] = (
    PolicyTargetRule(rule_id="app_registry", prefixes=("app:",)),
    PolicyTargetRule(rule_id="approved_workspace", prefixes=("workspace:", "artifact:", "file:")),
    PolicyTargetRule(rule_id="local_engine", prefixes=("engine:",)),
    PolicyTargetRule(rule_id="memory_store", prefixes=("memory:",)),
)


@dataclass(frozen=True)
class PolicyDecision:
    outcome: DecisionOutcome
    reason: str
    approval: Optional[ApprovalRequest] = None


class ApprovalStore(Protocol):
    def create(self, approval: ApprovalRequest, session_id: str) -> None: ...


def canonical_json(value: Any) -> str:
    """Canonical serialization for fingerprinting (sorted keys, compact)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def proposal_fingerprint(
    tool_id: str,
    tool_version: str,
    args: dict[str, Any],
    target_refs: list[str],
    scope: Optional[TaskPacket] = None,
) -> str:
    """Hash of canonical tool, version, args, targets, and scope (doc 02 C4).
    Changing one argument, target, tool version, or risk classification
    produces a new fingerprint."""
    payload = {
        "tool_id": tool_id,
        "tool_version": tool_version,
        "args": args,
        "target_refs": sorted(target_refs),
        "scope": {
            "allowed_targets": (
                sorted(TaskScope_default().allowed_targets)
                if scope is None or getattr(scope, "scope", None) is None
                else sorted(scope.scope.allowed_targets)
            ),
        },
    }
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def TaskScope_default() -> Any:
    from schemas.contracts import TaskScope

    return TaskScope()


class Policy:
    """Executor-side policy evaluation (deny / auto-approve / approval C5)."""

    def __init__(
        self,
        registry: Any,
        settings: Any,
        approval_service: Optional["ApprovalService"] = None,
    ) -> None:
        self._registry = registry
        self._settings = settings
        self._approval_service = approval_service
        self.target_rules = TARGET_RULES

    # -- target rules ------------------------------------------------------

    def targets_allowed(self, tool_id: str, target_refs: list[str]) -> bool:
        try:
            entry = self._registry.get(tool_id)
        except KeyError:
            return False
        entry_rules = [
            rule for rule in self.target_rules if rule.rule_id in entry.allowed_targets
        ]
        if not entry_rules:
            return len(target_refs) == 0
        return all(
            any(rule.accepts(ref) for rule in entry_rules) for ref in target_refs
        )

    # -- proposal evaluation ------------------------------------------------

    def validate_proposal_binding(
        self,
        proposal: ToolProposal,
        packet: Optional[TaskPacket],
    ) -> Optional[str]:
        """Typed rejection reason when the proposal cannot proceed, or None."""
        try:
            entry = self._registry.get(proposal.tool_id, proposal.tool_version)
        except KeyError:
            return "TOOL_UNAVAILABLE"

        # An agent cannot reclassify risk below what the registry declares.
        # A claim ABOVE the registry (higher risk class or raising side_effect)
        # is honored on the safe side: policy escalates (see effective_risk
        # and effective side-effect in evaluate), it never grants it back.
        registered = RISK_SEVERITY[entry.risk]
        claimed = RISK_SEVERITY[proposal.risk]
        if claimed < registered:
            return "POLICY_DENIED"
        if not self.targets_allowed(proposal.tool_id, proposal.target_refs):
            return "TARGET_NOT_FOUND"
        if packet is not None:
            if proposal.tool_id not in packet.allowed_capabilities:
                return "POLICY_DENIED"
            scope_targets = packet.scope.allowed_targets
            if scope_targets:
                for ref in proposal.target_refs:
                    if not any(ref.startswith(allowed) for allowed in scope_targets):
                        return "TARGET_NOT_FOUND"
        expected = proposal_fingerprint(
            proposal.tool_id,
            proposal.tool_version,
            proposal.args,
            proposal.target_refs,
            packet,
        )
        if expected != proposal.proposal_fingerprint:
            return "INVALID_INPUT"
        return None

    def effective_risk(
        self, registry_risk: RiskClass, proposal_risk: RiskClass
    ) -> RiskClass:
        """The stricter of declared vs claimed risk (safe side)."""
        return (
            registry_risk
            if RISK_SEVERITY[registry_risk] >= RISK_SEVERITY[proposal_risk]
            else proposal_risk
        )

    def evaluate(
        self,
        proposal: ToolProposal,
        packet: Optional[TaskPacket] = None,
        session_id: Optional[str] = None,
    ) -> PolicyDecision:
        """Return the policy decision for a validated proposal."""
        binding_error = self.validate_proposal_binding(proposal, packet)
        if binding_error is not None:
            return PolicyDecision(outcome=DecisionOutcome.denied, reason=binding_error)

        entry = self._registry.get(proposal.tool_id)
        risk = self.effective_risk(entry.risk, proposal.risk)
        # Side-effect claims escalate; they are never dialed back down.
        side_effect = entry.side_effect or proposal.side_effect

        if risk == RiskClass.read_only and not side_effect:
            return PolicyDecision(
                outcome=DecisionOutcome.auto_approve,
                reason="read_only operations may run without a dialog",
            )
        if side_effect or risk in (
            RiskClass.sensitive, RiskClass.reversible_write, RiskClass.destructive
        ):
            # A prior approved approval for this exact fingerprint short-circuits
            # (this is the resume-after-approval path; still fingerprint-bound).
            valid = self._existing_approval(proposal.proposal_fingerprint, session_id)
            if valid is not None:
                return PolicyDecision(
                    outcome=DecisionOutcome.auto_approve,
                    reason="an unexpired approval for this exact fingerprint exists",
                )
            if risk in (RiskClass.sensitive, RiskClass.destructive):
                return PolicyDecision(
                    outcome=DecisionOutcome.approval_required,
                    reason=f"{risk.value} operations require explicit approval",
                    approval=self._create_approval(proposal, session_id),
                )
            # reversible_write: policy-dependent (doc 03); destination shown.
            if self._settings.auto_approve_reversible_write and not side_effect:
                return PolicyDecision(
                    outcome=DecisionOutcome.auto_approve,
                    reason="reversible_write auto-approval enabled by policy",
                )
            return PolicyDecision(
                outcome=DecisionOutcome.approval_required,
                reason="side-effecting operations require approval of their targets"
                if risk == RiskClass.read_only
                else "reversible_write requires approval of its destination",
                approval=self._create_approval(proposal, session_id),
            )
        return PolicyDecision(
            outcome=DecisionOutcome.denied,
            reason="POLICY_DENIED",
        )

    def _existing_approval(
        self, fingerprint: str, session_id: Optional[str]
    ) -> Optional[ApprovalRequest]:
        if self._approval_service is None or not session_id:
            return None
        return self._approval_service.approved_for(fingerprint, session_id)

    # -- approvals -----------------------------------------------------------

    def _create_approval(
        self, proposal: ToolProposal, session_id: Optional[str]
    ) -> ApprovalRequest:
        """Build the C5 object; persist it only when a store is wired (the
        decision itself always carries the approval so callers can show it)."""
        approval = ApprovalRequest(
            approval_id=str(secrets.token_hex(16)),
            proposal_id=proposal.proposal_id,
            proposal_fingerprint=proposal.proposal_fingerprint,
            summary=(
                f"Allow {proposal.tool_id} ({proposal.risk.value}) targeting "
                f"{', '.join(proposal.target_refs) or 'no targets'}"
            ),
            status=ApprovalStatus.pending,
            created_at=utc_now_iso(),
            expires_at=(
                datetime.now(timezone.utc)
                .replace(microsecond=0)
                + timedelta(seconds=self._settings.approval_ttl_seconds)
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        if self._approval_service is not None:
            self._approval_service.create(approval, session_id)
        return approval


class ApprovalService:
    """Pending-only, session-proof approval decisions (doc 02)."""

    def __init__(self, repos: Any, settings: Any) -> None:
        self._repos = repos
        self._settings = settings

    # -- store + lookup ----------------------------------------------------

    def create(self, approval: ApprovalRequest, session_id: Optional[str]) -> None:
        self._repos.approvals.create(approval, session_id or "")

    def approved_for(
        self, proposal_fingerprint: str, session_id: str
    ) -> Optional[dict[str, Any]]:
        """A still-valid APPROVED approval for an exact fingerprint (the
        resume-after-approval path the gateway trusts)."""
        if not session_id:
            return None
        self._expire_stale_all(session_id, ApprovalStatus.approved.value, ApprovalStatus.expired.value)
        for row in self._repos.approvals.list_for_session(
            session_id, ApprovalStatus.approved.value
        ):
            if row["expires_at"] > utc_now_iso() and row["proposal_fingerprint"] == proposal_fingerprint:
                return row
        return None

    def pending_for_proposal(
        self, proposal_id: str, session_id: str
    ) -> Optional[dict[str, Any]]:
        if not session_id:
            return None
        for row in self._repos.approvals.list_for_session(
            session_id, ApprovalStatus.pending.value
        ):
            self._expire_row(row)
            if row["status"] == ApprovalStatus.pending.value and row["proposal_id"] == proposal_id:
                return row
        return None

    # -- decisions ----------------------------------------------------------

    def decide(
        self, approval_id: str, decision: str, session_id: Optional[str]
    ) -> tuple[bool, str]:
        row = self._repos.approvals.get(approval_id)
        if row is None:
            return False, "APPROVAL_REQUIRED"
        if session_id is None or row["session_id"] != session_id:
            return False, "POLICY_DENIED"
        if row["status"] != ApprovalStatus.pending.value:
            return False, "APPROVAL_EXPIRED"
        self._expire_stale(row)
        if row["expires_at"] <= utc_now_iso():
            self._repos.approvals.decide(approval_id, ApprovalStatus.expired.value)
            return False, "APPROVAL_EXPIRED"
        if decision not in ("approved", "rejected"):
            return False, "INVALID_INPUT"
        self._repos.approvals.decide(approval_id, decision)
        return True, decision

    def decision_for(self, proposal_fingerprint: str, session_id: str) -> Optional[dict[str, Any]]:
        """Find a still-valid pending approval for an exact fingerprint."""
        for row in self._repos.approvals.list_pending_for_session(session_id):
            self._expire_stale(row)
            if row["status"] == ApprovalStatus.pending.value and row["expires_at"] > utc_now_iso():
                if row["proposal_fingerprint"] == proposal_fingerprint:
                    return row
        return None

    def _expire_stale(self, row: dict[str, Any]) -> None:
        self._expire_row(row)

    def _expire_stale_all(self, session_id: str, from_status: str, to_status: str) -> None:
        for row in self._repos.approvals.list_for_session(session_id, from_status):
            self._expire_row(row)

    def _expire_row(self, row: dict[str, Any]) -> None:
        if row["status"] == ApprovalStatus.pending.value and row["expires_at"] <= utc_now_iso():
            self._repos.approvals.decide(row["approval_id"], ApprovalStatus.expired.value)
            row["status"] = ApprovalStatus.expired.value


__all__ = [
    "DecisionOutcome",
    "Policy",
    "PolicyDecision",
    "PolicyTargetRule",
    "TARGET_RULES",
    "ApprovalService",
    "canonical_json",
    "proposal_fingerprint",
]
