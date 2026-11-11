"""The bounded task worker (doc 03 section 3, contracts C3..C9).

Every task, including a direct task, uses the same worker controls:

 1. receive C3 and load only its scoped inputs
 2. check assignment, capability allow-list, step limit, idempotency key
 3. select a domain subgraph or a deterministic recipe
 4. resolve a target into stable references
 5. build C4 (reason, args, risk, target refs, fingerprint)
 6. validate the tool schema and registry version
 7. evaluate policy: deny, auto-approve, or create C5
 8. if approval is required, stop at awaiting_approval (checkpointer saves)
 9. create C6 only when all policy/approval predicates still match
10. call the trusted gateway and observe C7
11. reconcile using the receipt/idempotency key, including unknown_outcome
12. return C9 with evidence and receipt references

The worker cannot add a capability, alter an approved target, or execute an
unregistered tool. Any change requires a new proposal and possibly a new
approval. Execution is one pass; retries arrive through bounded_replan.
"""

from __future__ import annotations

from typing import Annotated, Any, Optional
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from agent.execution.gateway import core_error
from agent.agents.desktop import DesktopAgent
from agent.agents.discovery import DiscoveryAgent
from agent.agents.knowledge import KnowledgeAgent
from schemas.contracts import (
    AgentResult,
    AgentResultStatus,
    AgentRole,
    ApprovalRequest,
    CoreError,
    ErrorCode,
    ExecutionReceipt,
    ExecutionRequest,
    ReceiptStatus,
    TaskPacket,
    ToolProposal,
)


def _append_notes(current: Any, update: Any) -> str:
    merge = (str(current) if current else "") + str(update or "")
    return merge[-4000:]  # state stays small and serializable


class WorkerState(BaseModel):
    """Bounded worker state; JSON serializable; request/task-scoped."""

    model_config = ConfigDict(extra="forbid")

    packet: TaskPacket
    request_id: str = ""
    session_id: str = ""
    proposal: Optional[ToolProposal] = None
    approval: Optional[ApprovalRequest] = None
    execution: Optional[ExecutionRequest] = None
    receipt: Optional[ExecutionReceipt] = None
    result: Optional[AgentResult] = None
    audit_notes: Annotated[str, _append_notes] = Field(default="")


def _val(state: Any, name: str, default: Any = None) -> Any:
    if isinstance(state, dict):
        return state.get(name, default)
    return getattr(state, name, default)


class TaskWorker:
    """Wires the worker graph around engine services; state stays small."""

    def __init__(self, engine: Any) -> None:  # agent.core.CoreEngine
        self._engine = engine
        self._knowledge = KnowledgeAgent()
        self._discovery = DiscoveryAgent()
        self._desktop = DesktopAgent()
        self._graph = self._build_graph()

    # ------------------------------------------------------------------
    # Public entry
    # ------------------------------------------------------------------

    async def run(
        self, packet: TaskPacket, request_id: str, session_id: str
    ) -> WorkerRun:
        state = await self._graph.ainvoke(
            WorkerState(packet=packet, request_id=request_id, session_id=session_id)
        )
        return WorkerRun(
            result=_val(state, "result"),
            proposal=_val(state, "proposal"),
            approval=_val(state, "approval"),
            receipt=_val(state, "receipt"),
        )

    # ------------------------------------------------------------------
    # Worker nodes (closures over engine services)
    # ------------------------------------------------------------------

    def _build_graph(self):
        engine = self._engine
        repos = engine.repos
        registry = engine.registry
        policy = engine.policy

        def receive_packet(state: WorkerState) -> dict[str, Any]:
            """Steps 1/2: scoped inputs and packet validity checks."""
            packet = state.packet
            known_tools = {entry.tool_id for entry in registry.all_entries()}
            missing = [cap for cap in packet.allowed_capabilities if cap not in known_tools]
            assignable = {
                AgentRole.recipe,
                AgentRole.desktop,
                AgentRole.knowledge,
                AgentRole.discovery,
            }
            if packet.assigned_to not in assignable:
                return self._fail(packet, core_error(
                    ErrorCode.POLICY_DENIED,
                    f"agent role {packet.assigned_to.value} is not assignable"))
            if missing:
                return self._fail(packet, core_error(
                    ErrorCode.POLICY_DENIED,
                    f"packet needs unknown capabilities: {missing}"))
            if not packet.allowed_capabilities and packet.assigned_to in (AgentRole.recipe,
                                                                          AgentRole.knowledge):
                return self._fail(packet, core_error(
                    ErrorCode.POLICY_DENIED, "packet carries an empty capability allow-list"))
            if packet.attempt > packet.scope.max_steps:
                return self._fail(packet, core_error(
                    ErrorCode.POLICY_DENIED,
                    f"attempt {packet.attempt} exceeds packet step limit {packet.scope.max_steps}"))
            repos.agent_runs.start(packet.task_id, packet.assigned_to.value)
            return {}

        def resolve_target(state: WorkerState) -> dict[str, Any]:
            """Steps 3/4: select executor and resolve stable target refs."""
            packet = state.packet
            if packet.assigned_to == AgentRole.recipe:
                proposal = self._desktop.build_proposal(
                    packet, engine.recipe_for_packet(packet))
                if proposal is None:
                    return self._fail(packet, core_error(
                        ErrorCode.TARGET_NOT_FOUND, "no resolved target for direct task"))
                return {"proposal": proposal}
            if packet.assigned_to == AgentRole.knowledge:
                if "document_create" in packet.allowed_capabilities:
                    # Trace B: report packet -> document_create proposal
                    # bounded to the workspace destination family.
                    material = engine.report_material(packet)
                    return {"proposal": self._knowledge.build_report_proposal(packet, material)}
                return {"proposal": self._knowledge.build_proposal(packet)}
            if packet.assigned_to == AgentRole.discovery:
                # Evidence gathering: one C4 per pass, read-only targets
                # resolved deterministically (never from packet text).
                target = engine.discovery_target(packet)
                return {"proposal": self._discovery.build_proposal(packet, target)}
            return self._fail(packet, core_error(
                ErrorCode.POLICY_DENIED,
                f"no executor for assigned role {packet.assigned_to.value}"))

        def validate_registry(state: WorkerState) -> dict[str, Any]:
            """Steps 5/6: persist the C4, then schema + registry validation."""
            packet = state.packet
            proposal = state.proposal
            if proposal is None:
                return self._fail(packet, core_error(
                    ErrorCode.INVALID_INPUT, "worker produced no proposal"))
            repos.proposals.create(proposal, packet.request_id)
            reason = registry.validate_proposal(proposal)
            if reason is not None:
                repos.proposals.set_status(proposal.proposal_id, "invalid")
                code = (ErrorCode.TOOL_UNAVAILABLE if reason.startswith("TOOL_UNAVAILABLE")
                        else ErrorCode.INVALID_INPUT)
                return self._fail(packet, core_error(code, reason))
            expected = engine.fingerprint(proposal, packet)
            if expected != proposal.proposal_fingerprint:
                repos.proposals.set_status(proposal.proposal_id, "invalid")
                return self._fail(packet, core_error(
                    ErrorCode.INVALID_INPUT, "proposal fingerprint mismatch"))
            return {}

        def evaluate_policy(state: WorkerState) -> dict[str, Any]:
            """Step 7/8: deny, auto-approve, or create a C5 approval."""
            packet = state.packet
            proposal = state.proposal
            decision = policy.evaluate(proposal, packet, state.session_id or None)
            if decision.outcome == "denied":
                repos.proposals.set_status(proposal.proposal_id, "denied")
                code = {
                    "POLICY_DENIED": ErrorCode.POLICY_DENIED,
                    "TARGET_NOT_FOUND": ErrorCode.TARGET_NOT_FOUND,
                    "TOOL_UNAVAILABLE": ErrorCode.TOOL_UNAVAILABLE,
                    "INVALID_INPUT": ErrorCode.INVALID_INPUT,
                }.get(decision.reason, ErrorCode.POLICY_DENIED)
                return self._fail(packet, core_error(code, decision.reason))
            if decision.outcome == "approval_required":
                repos.proposals.set_status(proposal.proposal_id, "awaiting_approval")
                approval = decision.approval
                return {
                    "approval": approval,
                    "result": AgentResult(
                        task_id=packet.task_id,
                        agent=packet.assigned_to,
                        status=AgentResultStatus.needs_input,
                        summary=approval.summary if approval else "approval required",
                        proposal_refs=[proposal.proposal_id],
                    ),
                }
            return {}  # auto_approve -> straight to C6

        def request_execution(state: WorkerState) -> dict[str, Any]:
            """Step 9: build C6; tool_executions rows belong to the gateway."""
            packet = state.packet
            proposal = state.proposal
            execution = ExecutionRequest(
                execution_id=str(uuid4()),
                proposal_id=proposal.proposal_id,
                proposal_fingerprint=proposal.proposal_fingerprint,
                idempotency_key=packet.idempotency_key,
                approval_id=(state.approval.approval_id if state.approval else None),
                granted_capability_refs=list(packet.allowed_capabilities),
            )
            repos.audit.append(
                "execution_requested", request_id=packet.request_id, task_id=packet.task_id,
                detail={"execution_id": execution.execution_id,
                        "idempotency_key": execution.idempotency_key},
            )
            return {"execution": execution}

        async def execute_gateway(state: WorkerState) -> dict[str, Any]:
            """Step 10: the single call to the trusted execution gateway."""
            receipt = await engine.gateway.execute(
                state.execution,
                engine.adapter_context,
                approved_session_id=state.session_id or None,
            )
            return {"receipt": receipt}

        def reconcile(state: WorkerState) -> dict[str, Any]:
            """Steps 11/12: C7 -> typed C9; unknown_outcome stops retrying."""
            packet = state.packet
            proposal = state.proposal
            receipt = state.receipt
            repos.proposals.set_status(proposal.proposal_id, "executed")
            repos.tasks.set_status(packet.task_id, "running")
            if packet.assigned_to == AgentRole.knowledge:
                if "document_create" in packet.allowed_capabilities:
                    result = self._knowledge.respond_report(
                        packet, receipt, engine.receipt_output(receipt)
                    )
                else:
                    result = self._knowledge.respond(
                        packet,
                        engine.memory_context_for(packet),
                        engine.receipt_output(receipt),
                        proposal.proposal_id,
                        receipt.execution_id,
                    )
            elif packet.assigned_to == AgentRole.discovery:
                result = self._discovery.respond(
                    packet, receipt, engine.receipt_output(receipt), proposal.proposal_id
                )
            else:
                result = self._desktop.summarize_receipt(
                    packet, receipt, engine.receipt_output(receipt)
                )
            if receipt.status == ReceiptStatus.unknown_outcome:
                repos.tasks.set_status(packet.task_id, "unknown_outcome")
            elif receipt.status == ReceiptStatus.succeeded:
                repos.tasks.set_status(packet.task_id, "executed")
            else:
                repos.tasks.set_status(packet.task_id, receipt.status.value)
            return {"result": result}

        def respond(state: WorkerState) -> dict[str, Any]:
            packet = state.packet
            result = state.result
            if result is None:
                result = AgentResult(
                    task_id=packet.task_id,
                    agent=packet.assigned_to,
                    status=AgentResultStatus.failed,
                    summary="worker produced no result",
                    error=core_error(ErrorCode.ADAPTER_FAILURE, "worker produced no result"),
                )
            # Audit anchor (doc 04 rule 12): every C9 is reconstructable from
            # the audit trail; report material later reads these rows back.
            repos.audit.append(
                "task_completed", request_id=packet.request_id, task_id=packet.task_id,
                detail={
                    "task_id": packet.task_id,
                    "agent": result.agent.value,
                    "status": result.status.value,
                    "summary": result.summary,
                    "evidence_refs": list(result.evidence_refs),
                    "proposal_refs": list(result.proposal_refs),
                    "receipt_refs": list(result.receipt_refs),
                },
            )
            return {"result": result}

        graph = StateGraph(WorkerState)
        graph.add_node("receive", receive_packet)
        graph.add_node("resolve", resolve_target)
        graph.add_node("validate", validate_registry)
        graph.add_node("policy", evaluate_policy)
        graph.add_node("request", request_execution)
        graph.add_node("execute", execute_gateway)
        graph.add_node("reconcile", reconcile)
        graph.add_node("respond", respond)

        def _skip_on_failure(state: WorkerState, next_node: str) -> str:
            # A rejected packet never advances to the next control: its typed
            # failure result flows straight out (doc 03: no bypass, no retry).
            if _val(state, "result") is not None:
                return "respond"
            return next_node

        graph.add_edge(START, "receive")
        graph.add_conditional_edges(
            "receive",
            lambda state: _skip_on_failure(state, "resolve"),
            {"resolve": "resolve", "respond": "respond"},
        )
        graph.add_conditional_edges(
            "resolve",
            lambda state: _skip_on_failure(state, "validate"),
            {"validate": "validate", "respond": "respond"},
        )
        graph.add_conditional_edges(
            "validate",
            lambda state: _skip_on_failure(state, "policy"),
            {"policy": "policy", "respond": "respond"},
        )
        graph.add_conditional_edges(
            "policy",
            lambda state: "request"
            if _val(state, "approval") is None and _val(state, "result") is None
            else "respond",
            {"request": "request", "respond": "respond"},
        )
        graph.add_edge("request", "execute")
        graph.add_edge("execute", "reconcile")
        graph.add_edge("reconcile", "respond")
        graph.add_edge("respond", END)
        # checkpointer=False: the worker is a bounded single-pass tool; the
        # PARENT graph checkpoints at node boundaries and dispatch runs
        # several worker subgraphs concurrently inside one node. Explicitly
        # disabling the worker checkpointer prevents each pass from
        # inheriting the parent's saver into the same checkpoint namespace.
        return graph.compile(checkpointer=False)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    def _fail(self, packet: TaskPacket, error: CoreError) -> dict[str, Any]:
        return {
            "audit_notes": f"|fail:{error.code.value}",
            "result": AgentResult(
                task_id=packet.task_id,
                agent=packet.assigned_to,
                status=AgentResultStatus.failed,
                summary=error.message,
                error=error,
            ),
        }


class WorkerRun:
    def __init__(
        self,
        result: Optional[AgentResult],
        proposal: Optional[ToolProposal],
        approval: Optional[ApprovalRequest],
        receipt: Optional[ExecutionReceipt],
    ) -> None:
        self.result = result
        self.proposal = proposal
        self.approval = approval
        self.receipt = receipt
