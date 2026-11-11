"""Trusted execution core (doc 04 Phase 1: registry/policy/gateway/bridge)."""

from agent.execution.adapters import ADAPTERS, AdapterContext, UnknownOutcomeError
from agent.execution.desktop_bridge import DesktopBridge, DesktopBridgeUnavailable
from agent.execution.gateway import ExecutionGateway, GatewayConfig, core_error
from agent.execution.policy import (
    ApprovalService,
    DecisionOutcome,
    Policy,
    PolicyDecision,
    TARGET_RULES,
    canonical_json,
    proposal_fingerprint,
)

__all__ = [
    "ADAPTERS",
    "AdapterContext",
    "UnknownOutcomeError",
    "DesktopBridge",
    "DesktopBridgeUnavailable",
    "ExecutionGateway",
    "GatewayConfig",
    "core_error",
    "ApprovalService",
    "DecisionOutcome",
    "Policy",
    "PolicyDecision",
    "TARGET_RULES",
    "canonical_json",
    "proposal_fingerprint",
]
