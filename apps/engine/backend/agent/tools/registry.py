"""Tool registry: capabilities are data, never agent prompts.

Doc 02: "Each registry entry includes tool_id, version, description,
capability group, JSON input/output schemas, risk class, side-effect flag,
allowed target rules, timeout, retry/idempotency policy, availability, and
adapter ID. The registry is data, not an agent prompt."

An agent may propose a registered tool (C4); only the trusted execution
gateway may invoke it. Registering a tool grants it to no agent: capability
groups are only reachable through a task packet's allow-list.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.contracts import (
    IdempotencyPolicy,
    RiskClass,
    ToolProposal,
)


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


_DIAGNOSTIC_CHECKS = ("platform", "python", "database", "engine")


# ---------------------------------------------------------------------------
# Per-tool typed input schemas (single source of truth for arg validation).
# The emitted JSON Schema (model_json_schema()) is the shared wire contract.
# ---------------------------------------------------------------------------


class SystemDiagnosticsInput(_Input):
    checks: list[str] = Field(default_factory=lambda: list(_DIAGNOSTIC_CHECKS))
    scope: str = "engine"


class FileSearchInput(_Input):
    roots: list[str] = Field(min_length=1)
    pattern: str = Field(min_length=1, default="*")
    limit: int = Field(default=20, ge=1, le=200)


class MemoryLookupInput(_Input):
    query: str = Field(min_length=1)
    tiers: list[str] = Field(default_factory=list)
    limit: int = Field(default=5, ge=1, le=20)


class MemorySaveInput(_Input):
    """Internal-only: takes a validated memory record reference, never
    unreviewed free-form agent text (doc 02 registry note)."""

    memory_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    tier: str = Field(default="M3")
    kind: str = Field(default="fact")
    content: str = Field(min_length=1)
    provenance_refs: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.9, ge=0, le=1)
    sensitivity: str = Field(default="normal")


class DocumentReadInput(_Input):
    artifact_id: str = Field(min_length=1)
    extraction_mode: str = Field(default="raw")


class DocumentCreateInput(_Input):
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    destination_root: str = Field(default="approved_workspace")


class OpenApplicationInput(_Input):
    application_id: str = Field(min_length=1)


@dataclass(frozen=True)
class ToolEntry:
    tool_id: str
    version: str
    capability_group: str
    description: str
    input_model: type[BaseModel]
    output_keys: tuple[str, ...]
    risk: RiskClass
    side_effect: bool
    allowed_targets: tuple[str, ...]
    timeout_ms: int
    idempotency: IdempotencyPolicy
    adapter_id: str
    native_command_id: Optional[str] = None
    availability: str = "enabled"

    @property
    def native(self) -> bool:
        return self.native_command_id is not None


_ENTRIES: tuple[ToolEntry, ...] = (
    ToolEntry(
        tool_id="system_diagnostics",
        version="1",
        capability_group="desktop.system",
        description="Return structured local health observations (platform, python, database, engine).",
        input_model=SystemDiagnosticsInput,
        output_keys=("engine", "platform", "python", "database", "generated_at"),
        risk=RiskClass.read_only,
        side_effect=False,
        allowed_targets=("local_engine",),
        timeout_ms=5_000,
        idempotency=IdempotencyPolicy.not_required,
        adapter_id="python.system_diagnostics",
    ),
    ToolEntry(
        tool_id="file_search",
        version="1",
        capability_group="desktop.files",
        description="Search approved roots for file-pattern matches and return metadata references.",
        input_model=FileSearchInput,
        output_keys=("matches", "roots", "truncated"),
        risk=RiskClass.read_only,
        side_effect=False,
        allowed_targets=("approved_workspace",),
        timeout_ms=10_000,
        idempotency=IdempotencyPolicy.not_required,
        adapter_id="python.file_search",
    ),
    ToolEntry(
        tool_id="memory_lookup",
        version="1",
        capability_group="knowledge.memory",
        description="Retrieve ranked memory references for a scoped query.",
        input_model=MemoryLookupInput,
        output_keys=("query", "matches"),
        risk=RiskClass.read_only,
        side_effect=False,
        allowed_targets=("memory_store",),
        timeout_ms=5_000,
        idempotency=IdempotencyPolicy.not_required,
        adapter_id="python.memory_lookup",
    ),
    ToolEntry(
        tool_id="memory_save",
        version="1",
        capability_group="knowledge.memory",
        description="Persist a validated memory record reference created by the memory validator.",
        input_model=MemorySaveInput,
        output_keys=("memory_id", "index_status"),
        risk=RiskClass.reversible_write,
        side_effect=True,
        allowed_targets=("memory_store",),
        timeout_ms=5_000,
        idempotency=IdempotencyPolicy.key_required,
        adapter_id="python.memory_save",
    ),
    ToolEntry(
        tool_id="document_read",
        version="1",
        capability_group="documents",
        description="Extract text/evidence references from a registered artifact.",
        input_model=DocumentReadInput,
        output_keys=("artifact_id", "extraction_mode", "text", "truncated"),
        risk=RiskClass.read_only,
        side_effect=False,
        allowed_targets=("approved_workspace",),
        timeout_ms=10_000,
        idempotency=IdempotencyPolicy.not_required,
        adapter_id="python.document_read",
    ),
    ToolEntry(
        tool_id="document_create",
        version="1",
        capability_group="documents",
        description="Create an artifact under an approved destination and return its reference.",
        input_model=DocumentCreateInput,
        output_keys=("artifact_id", "path", "receipt"),
        risk=RiskClass.reversible_write,
        side_effect=True,
        allowed_targets=("approved_workspace",),
        timeout_ms=10_000,
        idempotency=IdempotencyPolicy.key_required,
        adapter_id="python.document_create",
    ),
    # Native entry demonstrating the typed seam into Rust (doc 01 native layer).
    ToolEntry(
        tool_id="open_application",
        version="1",
        capability_group="desktop.system",
        description="Ask the desktop core to open a resolved application target.",
        input_model=OpenApplicationInput,
        output_keys=("application_id", "observation"),
        risk=RiskClass.reversible_write,
        side_effect=True,
        allowed_targets=("app_registry",),
        timeout_ms=10_000,
        idempotency=IdempotencyPolicy.idempotent,
        adapter_id="native.desktop_bridge",
        native_command_id="desktop.open_application",
    ),
)


class ToolRegistry:
    """Versioned registry lookup and proposal validation."""

    def __init__(self, entries: Optional[tuple[ToolEntry, ...]] = None) -> None:
        self._entries: dict[str, ToolEntry] = {
            entry.tool_id: entry for entry in (entries or _ENTRIES)
        }

    def get(self, tool_id: str, version: Optional[str] = None) -> ToolEntry:
        if tool_id not in self._entries:
            raise KeyError(tool_id)
        entry = self._entries[tool_id]
        if version is not None and entry.version != version:
            raise KeyError(tool_id)
        return entry

    def all_entries(self) -> list[ToolEntry]:
        return list(self._entries.values())

    def capability_groups(self) -> list[str]:
        return sorted({entry.capability_group for entry in self._entries.values()})

    def validate_args(self, tool_id: str, args: dict[str, Any]) -> BaseModel:
        """Validate args against the registered JSON schema (pydantic model).
        Malformed or unknown-argument proposals never reach policy."""
        entry = self.get(tool_id)
        return entry.input_model.model_validate(args or {})

    def validate_proposal(self, proposal: ToolProposal) -> Optional[str]:
        """Return a typed error reason when a proposal cannot be honored,
        or None when it is structurally valid against the registry."""
        try:
            entry = self.get(proposal.tool_id, proposal.tool_version)
        except KeyError:
            return "TOOL_UNAVAILABLE"
        if entry.availability != "enabled":
            return "TOOL_UNAVAILABLE"
        try:
            self.validate_args(proposal.tool_id, proposal.args)
        except Exception as exc:  # pydantic ValidationError and defensive
            return f"INVALID_INPUT: {exc}"
        return None


def file_matches(path: Any, pattern: str) -> bool:
    """Shared deterministic match helper used by the file_search adapter."""
    return fnmatch.fnmatch(getattr(path, "name", ""), pattern)
