"""Canonical AI Core contracts C1-C9.

Source of truth: docs/AI-Core/02-api-and-contracts.md.
Vocabulary: docs/AI-Core/05-reference-glossary.md (do not rename names,
statuses, tools, or memory tiers without updating that glossary).

Every cross-module message is JSON-serializable, versioned, and attributable
to a request. Unknown fields are rejected at authority boundaries; forward
compatible fields belong inside an explicit ``extensions`` object.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTRACT_VERSION = "1"


def utc_now_iso() -> str:
    """Canonical timestamp format: ISO-8601 UTC with second precision."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_uuid(value: str) -> bool:
    try:
        UUID(str(value))
    except (ValueError, AttributeError):
        return False
    return True


class _Strict(BaseModel):
    """Authority boundaries reject unknown fields (rule from doc 02)."""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Enumerations (canonical vocabulary)
# ---------------------------------------------------------------------------


class LifecycleStatus(str, Enum):
    """Canonical request lifecycle statuses (doc 02). Only the gateway may
    emit ``unknown_outcome`` for an external side effect (receipt-level)."""

    received = "received"
    planning = "planning"
    running = "running"
    awaiting_approval = "awaiting_approval"
    reconciling = "reconciling"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ReceiptStatus(str, Enum):
    """Outcome of an execution. Emitted by the trusted gateway only."""

    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    unknown_outcome = "unknown_outcome"


class RiskClass(str, Enum):
    read_only = "read_only"
    reversible_write = "reversible_write"
    sensitive = "sensitive"
    destructive = "destructive"


RISK_SEVERITY: dict[str, int] = {
    RiskClass.read_only: 0,
    RiskClass.reversible_write: 1,
    RiskClass.sensitive: 2,
    RiskClass.destructive: 3,
}


class Route(str, Enum):
    clarify = "clarify"
    fast_direct = "fast_direct"
    supervised = "supervised"


class MemoryTier(str, Enum):
    M0 = "M0"
    M1 = "M1"
    M2 = "M2"
    M3 = "M3"
    M4 = "M4"
    M5 = "M5"


class AgentRole(str, Enum):
    supervisor = "supervisor"
    desktop = "desktop"
    discovery = "discovery"
    knowledge = "knowledge"
    recipe = "recipe"


class AgentResultStatus(str, Enum):
    completed = "completed"
    needs_input = "needs_input"
    blocked = "blocked"
    failed = "failed"


class ErrorCode(str, Enum):
    INVALID_INPUT = "INVALID_INPUT"
    POLICY_DENIED = "POLICY_DENIED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    APPROVAL_EXPIRED = "APPROVAL_EXPIRED"
    TOOL_UNAVAILABLE = "TOOL_UNAVAILABLE"
    TARGET_NOT_FOUND = "TARGET_NOT_FOUND"
    ADAPTER_FAILURE = "ADAPTER_FAILURE"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    TIMEOUT = "TIMEOUT"
    UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME"
    CANCELLED = "CANCELLED"


class MemoryKind(str, Enum):
    episode = "episode"
    fact = "fact"
    procedure = "procedure"
    artifact = "artifact"


class Sensitivity(str, Enum):
    normal = "normal"
    sensitive = "sensitive"


class MemoryOperation(str, Enum):
    create = "create"
    update = "update"
    retire = "retire"


class IdempotencyPolicy(str, Enum):
    """Declared per registry entry (doc 06 registry template)."""

    not_required = "not_required"
    idempotent = "idempotent"
    key_required = "key_required"


# ---------------------------------------------------------------------------
# CoreError
# ---------------------------------------------------------------------------


class CoreError(_Strict):
    """Typed error contract; ``message`` is safe to show to users."""

    code: ErrorCode
    message: str = Field(min_length=1)
    retryable: bool = False
    detail_ref: Optional[str] = None


# ---------------------------------------------------------------------------
# C4 - ToolProposal
# ---------------------------------------------------------------------------


class ToolProposal(_Strict):
    """Proposed operation without authority. Produced by an agent or a
    deterministic recipe; only the trusted gateway may act on it."""

    proposal_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    tool_id: str = Field(min_length=1)
    tool_version: str = Field(min_length=1)
    args: dict[str, Any] = Field(default_factory=dict)
    target_refs: list[str] = Field(default_factory=list)
    reason: str = Field(min_length=1)
    risk: RiskClass
    side_effect: bool
    proposal_fingerprint: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# C5 - ApprovalRequest
# ---------------------------------------------------------------------------


class ApprovalStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"
    cancelled = "cancelled"


class ApprovalRequest(_Strict):
    """A human decision bound to exactly one proposal fingerprint."""

    approval_id: str = Field(min_length=1)
    proposal_id: str = Field(min_length=1)
    proposal_fingerprint: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    status: ApprovalStatus = ApprovalStatus.pending
    created_at: str = Field(default_factory=utc_now_iso)
    expires_at: str


# ---------------------------------------------------------------------------
# C6 - ExecutionRequest
# ---------------------------------------------------------------------------


class ExecutionRequest(_Strict):
    """Authorized, idempotent operation. Created by the worker only after
    schema validation, target resolution, policy evaluation, and any
    required approval; consumed only by the trusted gateway."""

    execution_id: str = Field(min_length=1)
    proposal_id: str = Field(min_length=1)
    proposal_fingerprint: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1)
    approval_id: Optional[str] = None
    granted_capability_refs: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# C7 - ExecutionReceipt
# ---------------------------------------------------------------------------


class ExecutionReceipt(_Strict):
    """Observed result or uncertainty. 'The model said it worked' is never
    a result type: the graph trusts a receipt or ``unknown_outcome``."""

    execution_id: str = Field(min_length=1)
    status: ReceiptStatus
    started_at: str
    finished_at: Optional[str] = None
    output_ref: Optional[str] = None
    error: Optional[CoreError] = None
    adapter_observation_ref: Optional[str] = None


# ---------------------------------------------------------------------------
# C1 - RequestEnvelope
# ---------------------------------------------------------------------------


class AttachmentRef(_Strict):
    artifact_id: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    display_name: str = Field(min_length=1)


class UIContext(_Strict):
    active_surface: Optional[str] = None
    selected_refs: list[str] = Field(default_factory=list)


class RequestEnvelope(_Strict):
    """C1 - stable user request and session boundary."""

    contract_version: Literal["1"] = CONTRACT_VERSION  # type: ignore[assignment]
    request_id: str
    session_id: str
    parent_request_id: Optional[str] = None
    user_input: str = Field(min_length=1)
    attachments: list[AttachmentRef] = Field(default_factory=list)
    ui_context: UIContext = Field(default_factory=UIContext)
    submitted_at: str

    @field_validator("request_id", "session_id", "parent_request_id")
    @classmethod
    def _uuid_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not _is_uuid(value):
            raise ValueError("must be a non-empty UUID")
        return str(value)

    @field_validator("submitted_at")
    @classmethod
    def _iso_timestamp(cls, value: str) -> str:
        try:
            parsed = value.replace("Z", "+00:00")
            if not parsed.endswith("Z"):
                datetime.fromisoformat(parsed)  # validate shape
            else:
                datetime.fromisoformat(parsed[:-1] + "+00:00")
        except ValueError as exc:  # noqa: PERF203
            raise ValueError("submitted_at must be ISO-8601") from exc
        return value

    @classmethod
    def from_raw(cls, payload: dict[str, Any]) -> "RequestEnvelope":
        """Validate payload at the Python boundary. ``request_id`` and
        ``session_id`` are generated here (the Python backend boundary)
        when the shell omits them."""
        if not isinstance(payload, dict):
            raise ValueError("request payload must be a JSON object")
        data = dict(payload)
        data.setdefault("request_id", str(uuid4()))
        data.setdefault("session_id", str(uuid4()))
        data.setdefault("submitted_at", utc_now_iso())
        return cls.model_validate(data)


# ---------------------------------------------------------------------------
# C3 - TaskPacket
# ---------------------------------------------------------------------------


class TaskScope(_Strict):
    allowed_targets: list[str] = Field(default_factory=list)
    max_steps: int = Field(default=3, ge=1)
    deadline_at: Optional[str] = None


class TaskPacket(_Strict):
    """C3 - bounded unit of work. The supervisor may create it; a worker
    rejects it when the task is outside its capability group, exceeds
    ``max_steps``, has an unknown capability, or needs a target outside
    scope."""

    task_id: str = Field(min_length=1)
    request_id: str = Field(min_length=1)
    parent_task_id: Optional[str] = None
    assigned_to: AgentRole
    objective: str = Field(min_length=1)
    input_refs: list[str] = Field(default_factory=list)
    allowed_capabilities: list[str] = Field(default_factory=list)
    scope: TaskScope = Field(default_factory=TaskScope)
    idempotency_key: str = Field(min_length=1)
    attempt: int = Field(default=0, ge=0)


# ---------------------------------------------------------------------------
# C9 - AgentResult  (defined before C2 so MainGraphState can reference it)
# ---------------------------------------------------------------------------


class AgentResult(_Strict):
    """C9 - typed completion, evidence, or failure from a worker."""

    task_id: str = Field(min_length=1)
    agent: AgentRole
    status: AgentResultStatus
    summary: str = Field(min_length=1)
    evidence_refs: list[str] = Field(default_factory=list)
    proposal_refs: list[str] = Field(default_factory=list)
    receipt_refs: list[str] = Field(default_factory=list)
    error: Optional[CoreError] = None


# ---------------------------------------------------------------------------
# C8 - MemoryProposal
# ---------------------------------------------------------------------------


class MemoryProposal(_Strict):
    """C8 - candidate durable memory with provenance. Not a memory record
    until the memory validator accepts it. M0/M1 are runtime context and
    are never written through C8."""

    proposal_id: str = Field(min_length=1)
    source_request_id: str = Field(min_length=1)
    tier: Literal[MemoryTier.M2, MemoryTier.M3, MemoryTier.M4, MemoryTier.M5]
    kind: MemoryKind
    content_ref: str = Field(min_length=1)
    provenance_refs: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    sensitivity: Sensitivity = Sensitivity.normal
    operation: MemoryOperation = MemoryOperation.create


# ---------------------------------------------------------------------------
# C2 - MainGraphState
# ---------------------------------------------------------------------------


class MemoryContextItem(_Strict):
    memory_id: str = Field(min_length=1)
    tier: MemoryTier
    relevance: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    provenance_ref: str = Field(min_length=1)


class MemoryContext(_Strict):
    """Scoped retrieval result; references and excerpts only."""

    query_id: str = Field(min_length=1)
    item_refs: list[MemoryContextItem] = Field(default_factory=list)
    token_budget: int = Field(default=2048, ge=1)


class PlanSummary(_Strict):
    revision: int = Field(default=0, ge=0)
    goal: str = Field(min_length=1)
    task_ids: list[str] = Field(default_factory=list)


def _append_lists(current: Any, update: Any) -> list:
    """Reducer for clearly named collections such as ``results``/``errors``:
    updates append to the existing list (doc 02)."""
    base = list(current) if current else []
    return base + list(update or [])


class FinalResponse(_Strict):
    text: str = Field(min_length=1)
    evidence_refs: list[str] = Field(default_factory=list)


class MainGraphState(_Strict):
    """C2 - recoverable orchestration state. The graph node that owns a
    field is the only writer for it; reducers append/merge ``results`` and
    ``errors``. Carries identifiers and compact structured data only."""

    request: RequestEnvelope
    route: Optional[Route] = None
    status: LifecycleStatus = LifecycleStatus.received
    task_ids: list[str] = Field(default_factory=list)
    ready_task_ids: list[str] = Field(default_factory=list)
    results: Annotated["list[AgentResult]", _append_lists] = Field(default_factory=list)
    memory_context: Optional[MemoryContext] = None
    plan: Optional[PlanSummary] = None
    replan_count: int = Field(default=0, ge=0)
    checkpoint_ref: Optional[str] = None
    final_response: Optional[FinalResponse] = None
    errors: Annotated[list[CoreError], _append_lists] = Field(default_factory=list)


__all__ = [
    "CONTRACT_VERSION",
    "AgentResult",
    "AgentResultStatus",
    "AgentRole",
    "ApprovalRequest",
    "ApprovalStatus",
    "AttachmentRef",
    "CoreError",
    "ErrorCode",
    "ExecutionReceipt",
    "ExecutionRequest",
    "FinalResponse",
    "IdempotencyPolicy",
    "LifecycleStatus",
    "MainGraphState",
    "MemoryContext",
    "MemoryContextItem",
    "MemoryKind",
    "MemoryOperation",
    "MemoryProposal",
    "MemoryTier",
    "PlanSummary",
    "ReceiptStatus",
    "RequestEnvelope",
    "RiskClass",
    "Route",
    "Sensitivity",
    "TaskPacket",
    "TaskScope",
    "ToolProposal",
    "UIContext",
    "utc_now_iso",
]
