"""CoreEngine facade: the backend entry object the FastAPI surface calls.

Owns request/session boundary, checkpointer, and the orchestration graphs:
React -> Tauri -> modules/ipc -> FastAPI endpoint -> CoreEngine -> LangGraph.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from uuid import uuid4

from agent.execution.adapters import ADAPTERS, AdapterContext
from agent.execution.desktop_bridge import DesktopBridge
from agent.execution.gateway import ExecutionGateway
from agent.execution.policy import ApprovalService, Policy, proposal_fingerprint
from agent.graphs import recipes as recipe_module
from agent.graphs.main_graph import CoreServices, build_main_graph
from agent.graphs.worker_graph import TaskWorker
from agent.memory.service import MemoryService
from agent.agents.discovery import DiscoveryAgent, EvidenceTarget, parse_discovery_query
from agent.agents.supervisor import Supervisor
from config.engine_settings import EngineSettings, load_settings
from database.repositories import Repositories
from database.session import SessionManager
from schemas.contracts import (
    AgentResult,
    AgentResultStatus,
    ApprovalStatus,
    CoreError,
    ErrorCode,
    LifecycleStatus,
    MainGraphState,
    RequestEnvelope,
    Route,
    TaskPacket,
    ToolProposal,
    utc_now_iso,
)


GraphEventCallback = Callable[[str, str, Optional[dict[str, Any]]], Awaitable[None]]
"""``(kind, node_name, update)`` - kind is ``node_started`` or ``node_finished``."""


@dataclass
class CoreRequestResult:
    """Typed response payload for one handled request (safe display text)."""

    request_id: str
    session_id: str
    status: str
    route: Optional[str]
    response_text: str
    task_ids: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)
    receipt_refs: list[str] = field(default_factory=list)
    proposal_refs: list[str] = field(default_factory=list)
    errors: list[CoreError] = field(default_factory=list)
    pending_approval: Optional[dict[str, Any]] = None
    checkpoints: Optional[str] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "session_id": self.session_id,
            "status": self.status,
            "route": self.route,
            "response": {"text": self.response_text, "evidence_refs": self.evidence_refs},
            "task_ids": self.task_ids,
            "receipt_refs": self.receipt_refs,
            "proposal_refs": self.proposal_refs,
            "errors": [error.model_dump(mode="json") for error in self.errors],
            "pending_approval": self.pending_approval,
        }


class CoreEngine:
    """Owns contracts, execution core, memory, and the main graph."""

    def __init__(
        self,
        settings: Optional[EngineSettings] = None,
        desktop_bridge: Optional[Any] = None,
    ) -> None:
        """``desktop_bridge`` lets the server inject the live UI transport
        (``api.ui_bridge.UiCommandBridge``). It must expose
        ``invoke_native_command``; the default fails closed."""
        self.settings = settings or load_settings()
        self.session_manager = SessionManager(
            self.settings.database_url, self.settings.storage_schema_path
        )
        self.session_manager.initialize()
        self.repos = Repositories(self.session_manager)
        self.registry = self._build_registry()
        self.approver = ApprovalService(self.repos, self.settings)
        self.policy = Policy(self.registry, self.settings, approval_service=self.approver)
        self.gateway = ExecutionGateway(
            self.registry, self.policy, self.repos, self.settings,
            desktop_bridge=desktop_bridge or DesktopBridge(base_url=None),
        )
        self.gateway.set_approval_service(self.approver)
        self.memory = MemoryService(self.repos, self.settings)
        # Model seam (Phase 3): provider "none" (the default) keeps every
        # flow deterministic. Model output is validated offer data only; a
        # broken/unavailable provider degrades to None (doc 04 rules 2/11).
        self.model = None
        try:
            from agent.providers.base import build_model_client

            self.model = build_model_client(self.settings)
        except Exception:
            self.model = None
        self.supervisor = Supervisor(self.registry, self.settings, self.model)
        self.discovery = DiscoveryAgent()
        self.adapter_context = AdapterContext(repos=self.repos, settings=self.settings)
        self.worker = TaskWorker(self)
        self.checkpointer = None
        self.main_graph = None  # built inside the event loop on first request

    # ------------------------------------------------------------------
    # Wiring helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_registry():
        from agent.tools.registry import ToolRegistry

        return ToolRegistry()

    async def ensure_main_graph(self) -> None:
        """Build the checkpointer inside the running event loop (aiosqlite is
        loop-bound) and compile the main graph once."""
        if self.main_graph is not None:
            return
        self.checkpointer = await self._build_checkpointer()
        self.main_graph = build_main_graph(CoreServices(self))

    async def _build_checkpointer(self):
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        path: Path = self.settings.checkpoint_db_path
        path.parent.mkdir(parents=True, exist_ok=True)
        import aiosqlite

        connection = aiosqlite.connect(str(path), check_same_thread=False)
        # aiosqlite.Connection subclasses Thread; daemonize BEFORE the await
        # starts the thread so interpreter exit is never blocked by the
        # checkpoint worker. Durable close happens in aclose(); abrupt exits
        # are safe thanks to SQLite journaling.
        connection.daemon = True
        self._checkpointer_connection = await connection
        return AsyncSqliteSaver(self._checkpointer_connection)

    async def aclose(self) -> None:
        connection = getattr(self, "_checkpointer_connection", None)
        if connection is not None:
            await connection.close()
            self._checkpointer_connection = None
        self.session_manager.close()

    def fingerprint(self, proposal: ToolProposal, packet: TaskPacket) -> str:
        return proposal_fingerprint(
            proposal.tool_id, proposal.tool_version, proposal.args,
            proposal.target_refs, packet,
        )

    def recipe_for_packet(self, packet: TaskPacket):
        envelope = self.envelope_for(packet.request_id)
        return recipe_module.match_recipe(envelope.user_input, self.settings)

    def memory_context_for(self, packet: TaskPacket):
        return self.memory.retrieve_context(self.envelope_for(packet.request_id))

    def discovery_target(self, packet: TaskPacket) -> EvidenceTarget:
        """Resolve a Discovery packet's evidence target deterministically.

        A registered ``artifact:`` input ref selects document_read on that
        artifact; otherwise the bracketed deterministic query from the
        objective selects memory_lookup. Discovery can never resolve a
        native/targeted write path from packet content (doc 03 §2)."""
        artifact_refs = [
            ref for ref in packet.input_refs if ref.startswith("artifact:")
        ]
        if artifact_refs and "document_read" in packet.allowed_capabilities:
            artifact_id = artifact_refs[0]
            return EvidenceTarget(
                kind="artifact",
                args={"artifact_id": artifact_id},
                target_refs=[artifact_id],
            )
        return EvidenceTarget(
            kind="memory",
            args={
                "query": parse_discovery_query(packet.objective),
                "tiers": ["M2", "M3", "M4", "M5"],
                "limit": 5,
            },
            target_refs=["memory:store"],
        )

    def report_material(self, packet: TaskPacket) -> dict[str, Any]:
        """Assemble verified report material from completed dependency tasks.

        Source of truth is the ``task_completed`` audit trail (doc 04 rule
        12) filtered to the packet's own ``task:`` dependencies, so content
        is deterministic and stable across worker passes: an approved C5
        stays bound to the exact report fingerprint on resume."""
        dep_task_ids = {
            ref for ref in packet.input_refs
            if ref.startswith("task:")
        }
        title = packet.objective
        for lead in ("Create report:", "Report:"):
            if title.startswith(lead):
                title = title[len(lead):]
        title = title.strip()[:120] or "Research report"

        sections: list[str] = []
        evidence: list[str] = []
        for row in self.repos.audit.list_for_request(packet.request_id):
            if row["event_type"] != "task_completed":
                continue
            if row["task_id"] not in dep_task_ids or row["task_id"] == packet.task_id:
                continue
            detail = json.loads(row["detail"])
            if detail.get("status") != "completed":
                continue
            refs = list(dict.fromkeys(detail.get("evidence_refs") or []))
            summary = str(detail.get("summary") or "").strip()
            sections.append(
                f"## {detail.get('agent', 'task')} -- {row['task_id']}\n\n"
                f"{summary}\n\nEvidence: {', '.join(refs) if refs else 'none'}"
            )
            evidence.extend(refs)
        content = "\n".join(
            [f"# {title}", "", f"Request: {packet.request_id}", ""]
            + sections
            + ["", "Sources are receipt-verified task summaries; no external claims."]
        )
        return {
            "title": title,
            "content": content,
            "evidence_refs": list(dict.fromkeys(evidence)),
        }

    def envelope_for(self, request_id: str) -> RequestEnvelope:
        row = self.repos.requests.get(request_id)
        if row is None:
            raise KeyError(f"request {request_id} was not persisted")
        return RequestEnvelope.model_validate(json.loads(row["payload"]))

    def receipt_output(self, receipt: Any) -> Optional[dict[str, Any]]:
        """Resolve C7 output via its audit observation reference."""
        reference = getattr(receipt, "output_ref", None)
        if not reference or not reference.startswith("audit:"):
            return None
        event_id = reference.removeprefix("audit:")
        row = self.repos.audit.get(event_id)
        if row is None:
            return None
        detail = json.loads(row["detail"])
        return detail.get("output")

    def close(self) -> None:
        self.session_manager.close()

    # ------------------------------------------------------------------
    # Request handling
    # ------------------------------------------------------------------

    async def handle_request(
        self,
        envelope: RequestEnvelope,
        on_graph_event: Optional[GraphEventCallback] = None,
    ) -> CoreRequestResult:
        """Run the main graph for one C1 envelope.

        ``on_graph_event(kind, node, update)`` is optional and observational
        only: it is called with ``("node_started", name, None)`` before a node
        runs and ``("node_finished", name, update)`` after it returns, so the
        API layer can stream progress (agent.state / task.progress). It never
        changes routing or state."""
        await self.ensure_main_graph()
        self.repos.requests.create(envelope)
        self.repos.audit.append("request_received", envelope.request_id, None,
                               {"session_id": envelope.session_id})
        initial = MainGraphState(request=envelope)
        config = {"configurable": {"thread_id": envelope.request_id}}
        if on_graph_event is None:
            raw_state = await self.main_graph.ainvoke(initial, config)
        else:
            async for event in self.main_graph.astream(initial, config, stream_mode="debug"):
                await _forward_graph_event(event, on_graph_event)
            raw_state = (await self.main_graph.aget_state(config)).values
        state = raw_state if isinstance(raw_state, MainGraphState) else MainGraphState.model_validate(raw_state)
        result = self._result_from_state(state)
        self.repos.audit.append("request_completed", envelope.request_id, None,
                               {"status": result.status})
        return result

    def _result_from_state(self, state: MainGraphState) -> CoreRequestResult:
        receipt_refs = [ref for result in state.results for ref in result.receipt_refs]
        proposal_refs = [ref for result in state.results for ref in result.proposal_refs]
        evidence_refs = [ref for result in state.results for ref in result.evidence_refs]
        response = state.final_response
        pending = self._pending_approval(proposal_refs, state.request.session_id)
        return CoreRequestResult(
            request_id=state.request.request_id,
            session_id=state.request.session_id,
            status=state.status.value,
            route=state.route.value if state.route is not None else None,
            response_text=response.text if response is not None else "",
            task_ids=list(state.task_ids),
            evidence_refs=list(dict.fromkeys(evidence_refs)),
            receipt_refs=list(dict.fromkeys(receipt_refs)),
            proposal_refs=list(dict.fromkeys(proposal_refs)),
            errors=list(state.errors),
            pending_approval=pending,
        )

    def _pending_approval(
        self, proposal_refs: list[str], session_id: str
    ) -> Optional[dict[str, Any]]:
        for proposal_id in proposal_refs:
            row = self.approver.pending_for_proposal(proposal_id, session_id)
            if row is not None:
                return {
                    "approval_id": row["approval_id"],
                    "proposal_id": row["proposal_id"],
                    "summary": row["summary"],
                    "expires_at": row["expires_at"],
                }
        return None

    # ------------------------------------------------------------------
    # Approval resume path (awaiting_approval -> decide -> continue)
    # ------------------------------------------------------------------

    async def resume_after_decision(
        self, approval_id: str, decision: str, session_id: str
    ) -> CoreRequestResult:
        """Continue bounded work after a human decision. The resumed run is a
        new request record (child of the original) with the same proposal
        fingerprint, so the approval stays bound to exact work."""
        ok, reason = self.approver.decide(approval_id, decision, session_id)
        approval_row = self.repos.approvals.get(approval_id)
        if approval_row is None:
            outcome = CoreRequestResult(
                request_id=str(uuid4()), session_id=session_id,
                status=LifecycleStatus.failed.value, route=None,
                response_text=reason,
                errors=[CoreError(code=ErrorCode.APPROVAL_REQUIRED, message=reason)],
            )
            return outcome
        return await self._run_resumed_task(approval_row, decision, ok, reason, session_id)

    async def _run_resumed_task(
        self, approval_row: dict[str, Any], decision: str, ok: bool, reason: str,
        session_id: str,
    ) -> CoreRequestResult:
        proposal_row = self.repos.proposals.get(approval_row["proposal_id"])
        if proposal_row is None:
            return CoreRequestResult(
                request_id=str(uuid4()), session_id=session_id,
                status=LifecycleStatus.failed.value, route=None,
                response_text="approval points at a missing proposal",
                errors=[CoreError(code=ErrorCode.INVALID_INPUT,
                                  message="approval target proposal vanished")],
            )
        packet_row = self.repos.tasks.get(proposal_row["task_id"])
        packet = TaskPacket.model_validate(json.loads(packet_row["payload"]))
        envelope = _child_envelope(packet.request_id, session_id,
                                   f"resume after {decision}: {approval_row['summary']}")
        self.repos.requests.create(envelope)
        self.repos.tasks.set_status(packet.task_id, "running")
        # Fresh worker pass over the SAME packet; policy sees the approved
        # approval through ApprovalService.approved_for().
        worker_run_task = await self._run_worker_now(envelope, packet, session_id)
        self.repos.tasks.set_status(packet.task_id, worker_run_task.result.status.value)
        if worker_run_task.result.status == AgentResultStatus.needs_input:
            pending = self._pending_approval(
                worker_run_task.result.proposal_refs, session_id
            )
            return CoreRequestResult(
                request_id=envelope.request_id, session_id=session_id,
                status=LifecycleStatus.awaiting_approval.value, route="fast_direct",
                response_text=reason if not ok else worker_run_task.result.summary,
                task_ids=[packet.task_id],
                proposal_refs=worker_run_task.result.proposal_refs,
                pending_approval=pending,
            )
        text = worker_run_task.result.summary
        self.repos.requests.set_response(envelope.request_id, "completed", "fast_direct", text)
        proposal = self.memory.propose_episode(envelope, text)
        verdict = self.memory.validate(proposal, content=text)
        self.memory.record_verdict(proposal, verdict)
        if verdict.accepted:
            self.repos.memories.create(
                memory_id=str(uuid4()),
                tier=proposal.tier.value, kind=proposal.kind.value, content=text,
                title=approval_row["summary"][:40],
                provenance_refs=proposal.provenance_refs,
                confidence=proposal.confidence,
                sensitivity=proposal.sensitivity.value,
            )
        self.repos.audit.append("request_completed", envelope.request_id, None,
                               {"resumed_from": approval_row["approval_id"],
                                "decision": decision})
        return CoreRequestResult(
            request_id=envelope.request_id, session_id=session_id,
            status=LifecycleStatus.completed.value, route="fast_direct",
            response_text=text, task_ids=[packet.task_id],
            evidence_refs=list(dict.fromkeys(worker_run_task.result.evidence_refs)),
            receipt_refs=worker_run_task.result.receipt_refs,
            proposal_refs=worker_run_task.result.proposal_refs,
            errors=[worker_run_task.result.error] if worker_run_task.result.error else [],
        )

    async def _run_worker_now(self, envelope: RequestEnvelope, packet: TaskPacket, session_id: str) -> Any:
        return await self.worker.run(packet, envelope.request_id, session_id)


async def _forward_graph_event(event: dict[str, Any], callback: GraphEventCallback) -> None:
    """Translate one LangGraph ``debug`` stream item into the engine's small
    observational vocabulary. Checkpoint items are ignored."""
    payload = event.get("payload") or {}
    name = payload.get("name")
    if not name:
        return
    if event.get("type") == "task":
        await callback("node_started", name, None)
    elif event.get("type") == "task_result":
        update = {channel: value for channel, value in payload.get("result") or []}
        await callback("node_finished", name, update)


def _child_envelope(parent_request_id: str, session_id: str, user_input: str) -> RequestEnvelope:
    return RequestEnvelope(
        request_id=str(uuid4()),
        session_id=session_id,
        parent_request_id=parent_request_id,
        user_input=user_input or "resume",
        submitted_at=utc_now_iso(),
    )
