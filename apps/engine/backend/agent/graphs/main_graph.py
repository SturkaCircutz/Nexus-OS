"""The main LangGraph: one recoverable request lifecycle (doc 03 section 1).

Canonical nodes (doc 05, D2; names are fixed vocabulary):

    ingest_build_context -> choose_route
    choose_route -> clarify | fast_direct_task | supervisor_plan
    fast_direct_task -> collect_merge
    supervisor_plan -> validate_plan -> dispatch_ready_tasks | clarify
    dispatch_ready_tasks -> collect_merge
    collect_merge -> evaluate_progress
    evaluate_progress -> dispatch_ready_tasks | bounded_replan | synthesize_outcome
    bounded_replan -> validate_plan (or clarify when the bound is spent)
    synthesize_outcome -> respond_propose_memory -> end

Both routes converge on the same policy/approval/execution/receipt machinery:
"fast" removes planning, never the trust boundary. The graph plans, queries,
and reconciles; it never silently grants authority.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from agent.graphs import recipes as recipe_module
from schemas.contracts import (
    AgentResult,
    AgentResultStatus,
    AgentRole,
    CoreError,
    ErrorCode,
    FinalResponse,
    LifecycleStatus,
    MainGraphState,
    PlanSummary,
    Route,
    TaskPacket,
)


def _val(state: Any, name: str, default: Any = None) -> Any:
    if isinstance(state, dict):
        return state.get(name, default)
    return getattr(state, name, default)


class CoreServices:
    """Bundle of engine collaborators shared by graph node closures."""

    def __init__(self, engine: Any) -> None:
        self.engine = engine
        self.settings = engine.settings
        self.repos = engine.repos
        self.registry = engine.registry
        self.policy = engine.policy
        self.gateway = engine.gateway
        self.memory = engine.memory
        self.approver = engine.approver
        self.worker: TaskWorker = engine.worker
        self.supervisor = engine.supervisor


def build_main_graph(services: CoreServices):
    """Compile the canonical main graph; the engine provides the checkpointer."""
    repos = services.repos
    settings = services.settings

    # ------------------------------------------------------------------
    # Nodes
    # ------------------------------------------------------------------

    async def node_ingest_build_context(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        repos.audit.append("node_ingest_build_context", envelope.request_id, None, {})
        repos.requests.set_status(envelope.request_id, "planning")
        context = services.memory.retrieve_context(envelope)
        return {"status": LifecycleStatus.planning.value, "memory_context": context}

    async def node_choose_route(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        route = _route_for(envelope.user_input, settings)
        repos.audit.append("node_choose_route", envelope.request_id, None, {"route": route.value})
        repos.requests.set_status(envelope.request_id, "running", route.value)
        return {"route": route, "status": LifecycleStatus.running.value}

    async def node_clarify(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        match = recipe_module.match_recipe(envelope.user_input, settings)
        if match is not None and match.clarify_question:
            question = match.clarify_question
        else:
            question = "What exactly should I do - and with which target?"
        repos.audit.append("node_clarify", envelope.request_id, None, {})
        repos.requests.set_response(envelope.request_id, "completed", "clarify", question)
        return {
            "status": LifecycleStatus.completed.value,
            "final_response": FinalResponse(text=question, evidence_refs=[]),
        }

    async def node_fast_direct_task(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        match = recipe_module.match_recipe(envelope.user_input, settings)
        if match is None:
            return await node_clarify(state)
        packet = _direct_packet(envelope, match)
        repos.tasks.create(packet)
        repos.audit.append("task_created", envelope.request_id, packet.task_id,
                           {"assigned_to": packet.assigned_to.value})
        worker_run = await services.worker.run(packet, envelope.request_id, envelope.session_id)
        return _worker_outcome(envelope, packet, worker_run)

    async def node_supervisor_plan(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        packets, _queries = await services.supervisor.plan_with_queries(
            envelope, _val(state, "memory_context"), revision=0
        )
        for packet in packets:
            deps = [ref for ref in packet.input_refs if ref.startswith("task:")]
            repos.tasks.create(packet)
            repos.audit.append(
                "task_created", envelope.request_id, packet.task_id,
                {"assigned_to": packet.assigned_to.value,
                 "depends_on": deps},
            )
        plan = PlanSummary(
            revision=0,
            goal=envelope.user_input.strip()[:200],
            task_ids=[packet.task_id for packet in packets],
        )
        return {
            "plan": plan,
            "task_ids": plan.task_ids,
            "ready_task_ids": plan.task_ids,
            "status": LifecycleStatus.planning.value,
        }

    async def node_validate_plan(state: MainGraphState) -> dict[str, Any]:
        """Scope/capability validation plus dependency gating (doc 03 §2:
        map_dependencies). A packet whose ``task:`` dependencies have not
        reached a successful terminal state is deferred, not dispatchable."""
        plan = _val(state, "plan")
        errors: list[CoreError] = []
        ready: list[str] = []
        valid_capabilities = {entry.tool_id for entry in services.registry.all_entries()}
        for task_id in plan.task_ids:
            row = repos.tasks.get(task_id)
            if row is None:
                errors.append(CoreError(code=ErrorCode.INVALID_INPUT,
                                        message=f"task {task_id} vanished from storage"))
                continue
            packet = TaskPacket.model_validate(json.loads(row["payload"]))
            unknown = [cap for cap in packet.allowed_capabilities if cap not in valid_capabilities]
            if unknown:
                errors.append(CoreError(code=ErrorCode.POLICY_DENIED,
                                        message=f"plan uses unknown capabilities {unknown}"))
                continue
            if task_id in {ref for ref in packet.input_refs if ref.startswith("task:")}:
                errors.append(CoreError(code=ErrorCode.INVALID_INPUT,
                                        message=f"task {task_id} depends on itself"))
                continue
            pending = [ref for ref in packet.input_refs
                       if ref.startswith("task:") and not _dep_satisfied(ref)]
            if pending:
                continue  # deferred until evaluate_progress observes the deps
            ready.append(task_id)
        update: dict[str, Any] = {"ready_task_ids": ready}
        if errors:
            update["errors"] = errors
        return update

    async def node_dispatch_ready_tasks(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        ready = list(_val(state, "ready_task_ids") or [])
        # Re-check persistence before fan-out (doc 03 §7: checkpoint before
        # dispatch; completed work is never re-run).
        dispatchable = []
        for task_id in ready:
            row = repos.tasks.get(task_id)
            if row is None:
                continue
            if row["status"] in ("executed", "succeeded", "completed",
                                 "failed", "blocked", "unknown_outcome",
                                 "needs_input"):
                continue
            dispatchable.append(task_id)
        limit = max(settings.max_parallel_tasks, 1)
        batch, deferred = dispatchable[:limit], dispatchable[limit:]

        async def _dispatch_one(task_id: str) -> dict[str, Any]:
            row = repos.tasks.get(task_id)
            packet = TaskPacket.model_validate(json.loads(row["payload"]))
            repos.tasks.set_status(task_id, "running")
            worker_run = await services.worker.run(
                packet, envelope.request_id, envelope.session_id
            )
            return _worker_outcome(envelope, packet, worker_run)

        outcomes = (
            await asyncio.gather(*[_dispatch_one(task_id) for task_id in batch])
            if batch else []
        )
        dispatched = [result for outcome in outcomes for result in outcome["results"]]
        waiting = any(result.status == AgentResultStatus.needs_input for result in dispatched)
        repos.audit.append(
            "node_dispatch_ready_tasks", envelope.request_id, None,
            {"parallel": len(batch), "deferred": deferred,
             "waiting": waiting},
        )
        return {
            "results": dispatched,
            "ready_task_ids": deferred,
            "status": LifecycleStatus.awaiting_approval.value if waiting
            else LifecycleStatus.reconciling.value,
        }

    async def node_collect_merge(state: MainGraphState) -> dict[str, Any]:
        results = _val(state, "results") or []
        blocking = any(result.status in (AgentResultStatus.blocked, AgentResultStatus.needs_input)
                       for result in results)
        update_status = "awaiting_approval" if blocking else "reconciling"
        repos.requests.set_status(_envelope(state).request_id, update_status)
        repos.audit.append("node_collect_merge", _envelope(state).request_id, None,
                           {"results": len(results), "blocking": blocking})
        return {"status": update_status}

    async def node_evaluate_progress(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        results = _val(state, "results") or []
        done = {result.task_id for result in results}
        ready = list(_val(state, "ready_task_ids") or [])
        plan = _val(state, "plan")
        # Promotion: as verified work lands, deferred packets whose ``task:``
        # dependencies are now satisfied become dispatchable (doc 03 §2).
        if plan is not None:
            for task_id in plan.task_ids:
                if task_id in done or task_id in ready:
                    continue
                row = repos.tasks.get(task_id)
                if row is None:
                    continue
                if row["status"] in ("executed", "succeeded", "completed",
                                     "failed", "blocked", "unknown_outcome",
                                     "needs_input"):
                    continue
                packet = TaskPacket.model_validate(json.loads(row["payload"]))
                pending = [ref for ref in packet.input_refs
                           if ref.startswith("task:") and not _dep_satisfied(ref)]
                if pending:
                    continue
                ready.append(task_id)
        nxt, status = _progress_decision(state, settings, ready)
        repos.requests.set_status(envelope.request_id, status.value)
        repos.audit.append(
            "node_evaluate_progress", envelope.request_id, None,
            {"next": nxt if isinstance(nxt, str) else "__end__",
             "status": status.value, "ready": ready},
        )
        return {"ready_task_ids": ready, "status": status.value}

    async def node_bounded_replan(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        if _val(state, "replan_count") >= settings.max_replan_count:
            return {"status": LifecycleStatus.reconciling.value}
        revision = _val(state, "replan_count") + 1
        parent_ids = [result.task_id for result in _val(state, "results")
                      if result.status != AgentResultStatus.completed]
        packets, _queries = await services.supervisor.plan_with_queries(
            envelope, _val(state, "memory_context"),
            revision=revision, parent_task_ids=parent_ids,
        )
        for packet in packets:
            deps = [ref for ref in packet.input_refs if ref.startswith("task:")]
            repos.tasks.create(packet, status="planned")
            repos.audit.append("task_replanned", envelope.request_id, packet.task_id,
                               {"revision": revision,
                                "parent_task_id": packet.parent_task_id,
                                "depends_on": deps})
        plan = PlanSummary(revision=revision,
                           goal=envelope.user_input.strip()[:200],
                           task_ids=[packet.task_id for packet in packets])
        return {
            "replan_count": revision,
            "plan": plan,
            "task_ids": plan.task_ids,
            "ready_task_ids": plan.task_ids,
            "status": LifecycleStatus.running.value,
        }

    async def node_synthesize_outcome(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        evidence: list[str] = []
        lines: list[str] = []
        for result in _val(state, "results"):
            evidence.extend(result.evidence_refs)
            lines.append(result.summary)
        if not lines:
            lines.append("No work was necessary to answer the request.")
        text = " ".join(lines)
        evidence = list(dict.fromkeys(evidence))
        model = services.engine.model
        note: Optional[CoreError] = None
        if model is not None:
            text, evidence, note = await _synthesis_offer(model, text, evidence, lines)
        route = _val(state, "route")
        repos.requests.set_response(envelope.request_id, "completed",
                                    route.value if route is not None else None, text)
        repos.audit.append("node_synthesize_outcome", envelope.request_id, None,
                           {"evidence_refs": evidence,
                            "model_note": note.code.value if note else None})
        update: dict[str, Any] = {
            "status": LifecycleStatus.completed.value,
            "final_response": FinalResponse(text=text, evidence_refs=evidence),
        }
        if note is not None:
            update["errors"] = [note]
        return update

    async def node_respond_propose_memory(state: MainGraphState) -> dict[str, Any]:
        envelope = _envelope(state)
        final = _val(state, "final_response")
        summary = (final.text[:400] if final is not None else envelope.user_input[:200])
        proposal = services.memory.propose_episode(envelope, summary)
        verdict = services.memory.validate(proposal, content=summary)
        services.memory.record_verdict(proposal, verdict)
        if verdict.accepted:
            repos.memories.create(
                memory_id=str(uuid4()),
                tier=proposal.tier.value,
                kind=proposal.kind.value,
                content=summary,
                title=summary.split(" ")[0][:40] or "episode",
                provenance_refs=proposal.provenance_refs,
                confidence=proposal.confidence,
                sensitivity=proposal.sensitivity.value,
            )
        repos.audit.append("memory_proposed", envelope.request_id, None,
                           {"proposal_id": proposal.proposal_id,
                            "accepted": verdict.accepted, "reason": verdict.reason})
        return {"status": LifecycleStatus.completed.value}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _envelope(state: Any):
        request = _val(state, "request")
        from schemas.contracts import RequestEnvelope

        if isinstance(request, RequestEnvelope):
            return request
        return RequestEnvelope.model_validate(request)

    def _dep_satisfied(dep_ref: str) -> bool:
        """A ``task:`` reference counts only from its persisted record (the
        ref is the task id verbatim: task ids carry the ``task:`` prefix in
        their own naming scheme). The worker or a resumed approval must have
        reached a successful terminal status (executed/succeeded receipt
        semantics or C9 completed)."""
        row = repos.tasks.get(dep_ref)
        if row is None:
            return False
        return row["status"] in ("executed", "succeeded", "completed")

    def _direct_packet(envelope: Any, match: Any) -> TaskPacket:
        return TaskPacket(
            task_id=f"task:{envelope.request_id}:direct",
            request_id=envelope.request_id,
            assigned_to=AgentRole.recipe,
            objective=match.objective,
            input_refs=[],
            allowed_capabilities=[match.tool_id],
            idempotency_key=f"fast_direct:{envelope.request_id}:{match.recipe_id}",
        )

    def _worker_outcome(envelope: Any, packet: TaskPacket, worker_run: Any) -> dict[str, Any]:
        result = worker_run.result
        repos.tasks.set_status(packet.task_id, result.status.value)
        status_update = (
            LifecycleStatus.awaiting_approval
            if result.status == AgentResultStatus.needs_input
            else LifecycleStatus.reconciling
        )
        if worker_run.approval is not None:
            repos.audit.append("approval_created", envelope.request_id, packet.task_id,
                               {"approval_id": worker_run.approval.approval_id})
        return {
            "results": [result],
            "task_ids": [packet.task_id],
            "status": status_update.value,
        }

    def _route_for(user_input: str, settings: Any) -> Route:
        match = recipe_module.match_recipe(user_input, settings)
        if match is not None and not match.clarify_question:
            return Route.fast_direct
        if match is not None and match.clarify_question:
            return Route.clarify
        lowered = user_input.strip().lower()
        questionish = lowered.startswith(("what", "where", "why", "how", "who", "can", "is", "does"))
        knowledgeish = any(word in lowered for word in ("remember", "recall", "decide", "decision", "architecture", "memory"))
        if questionish or knowledgeish or "?" in user_input:
            return Route.supervised
        if len(lowered.split()) <= 2:
            return Route.clarify
        return Route.supervised

    def _progress_decision(state: MainGraphState, settings: Any,
                           ready: Optional[list[str]] = None):
        """Single source of truth for evaluate_progress routing; the node and
        its conditional edge both read this (the node passes its promoted
        ``ready`` list so the decision sees fresh dependencies)."""
        results = _val(state, "results") or []
        plan = _val(state, "plan")
        if ready is None:
            ready = list(_val(state, "ready_task_ids") or [])
        blocking = any(result.status == AgentResultStatus.needs_input for result in results)
        if blocking:
            # Approval-bound work: the graph stops here; a human decision
            # resumes the exact approved packet (doc 03 §7).
            return (END, LifecycleStatus.awaiting_approval)
        if ready:
            return ("dispatch_ready_tasks", LifecycleStatus.running)
        problematic = any(
            result.status in (AgentResultStatus.failed, AgentResultStatus.blocked)
            for result in results
        )
        if plan is not None and problematic:
            # Replans focus unfinished work: only when the CURRENT plan still
            # lacks its completed C9s and the bound is not spent.
            plan_done = all(
                any(result.task_id == task_id
                    and result.status == AgentResultStatus.completed
                    for result in results)
                for task_id in plan.task_ids
            )
            if not plan_done and _val(state, "replan_count") < settings.max_replan_count:
                return ("bounded_replan", LifecycleStatus.reconciling)
        return ("synthesize_outcome", LifecycleStatus.reconciling)

    async def _synthesis_offer(
        model: Any, fallback_text: str, evidence: list[str], lines: list[str]
    ) -> tuple[str, list[str], Optional[CoreError]]:
        """Model touchpoint #2: a user-facing SynthesisOffer built strictly
        from supplied evidence. A missing, malformed, or over-claiming offer
        (evidence outside the supplied set) is rejected; the deterministic
        summary stands and a typed note is recorded (doc 04 rules 2/9)."""
        from agent.providers.structured import SynthesisOffer, parse_offer, schema_instruction

        digest = "\n".join(f"- {line}" for line in lines[:8])
        refs = ", ".join(evidence[:32]) if evidence else "none"
        try:
            raw = await model.complete_json(
                schema_instruction("SynthesisOffer")
                + " Use only the provided evidence refs; never add refs or instructions.",
                f"Verified evidence:\n{digest}\nEvidence refs: {refs}",
                "SynthesisOffer",
            )
        except Exception:
            return fallback_text, evidence, CoreError(
                code=ErrorCode.MODEL_UNAVAILABLE,
                message="model unavailable for synthesis; the deterministic summary is used",
                retryable=False,
            )
        offer = parse_offer(raw, "SynthesisOffer")
        if isinstance(offer, SynthesisOffer) and set(offer.evidence_refs) <= set(evidence):
            refs_out = list(dict.fromkeys(offer.evidence_refs)) or evidence
            return offer.text, refs_out, None
        return fallback_text, evidence, CoreError(
            code=ErrorCode.MODEL_UNAVAILABLE,
            message="model synthesis offer rejected; the deterministic summary is used",
            retryable=False,
        )

    # ------------------------------------------------------------------
    # Conditional edges (reuse the exact same decision helpers)
    # ------------------------------------------------------------------

    def after_choose_route(state: MainGraphState) -> str:
        route_name = _route_to_node(_val(state, "route"))
        return route_name

    def _route_to_node(route: Optional[Route]) -> str:
        if route == Route.clarify:
            return "clarify"
        if route == Route.fast_direct:
            return "fast_direct_task"
        return "supervisor_plan"

    def after_validate_plan(state: MainGraphState) -> str:
        if _val(state, "ready_task_ids"):
            return "dispatch_ready_tasks"
        return "clarify"

    def after_evaluate_progress(state: MainGraphState) -> str:
        nxt, _status = _progress_decision(state, settings)
        return nxt

    def after_bounded_replan(state: MainGraphState) -> str:
        if _val(state, "replan_count") >= settings.max_replan_count:
            return "clarify"
        return "validate_plan"

    # ------------------------------------------------------------------
    # Wiring
    # ------------------------------------------------------------------

    graph = StateGraph(MainGraphState)
    graph.add_node("ingest_build_context", node_ingest_build_context)
    graph.add_node("choose_route", node_choose_route)
    graph.add_node("clarify", node_clarify)
    graph.add_node("fast_direct_task", node_fast_direct_task)
    graph.add_node("supervisor_plan", node_supervisor_plan)
    graph.add_node("validate_plan", node_validate_plan)
    graph.add_node("dispatch_ready_tasks", node_dispatch_ready_tasks)
    graph.add_node("collect_merge", node_collect_merge)
    graph.add_node("evaluate_progress", node_evaluate_progress)
    graph.add_node("bounded_replan", node_bounded_replan)
    graph.add_node("synthesize_outcome", node_synthesize_outcome)
    graph.add_node("respond_propose_memory", node_respond_propose_memory)

    graph.add_edge(START, "ingest_build_context")
    graph.add_edge("ingest_build_context", "choose_route")
    graph.add_conditional_edges(
        "choose_route",
        after_choose_route,
        {"clarify": "clarify", "fast_direct_task": "fast_direct_task",
         "supervisor_plan": "supervisor_plan"},
    )
    graph.add_edge("clarify", END)
    graph.add_edge("fast_direct_task", "collect_merge")
    graph.add_edge("supervisor_plan", "validate_plan")
    graph.add_conditional_edges(
        "validate_plan",
        after_validate_plan,
        {"dispatch_ready_tasks": "dispatch_ready_tasks", "clarify": "clarify"},
    )
    graph.add_edge("dispatch_ready_tasks", "collect_merge")
    graph.add_edge("collect_merge", "evaluate_progress")
    graph.add_conditional_edges(
        "evaluate_progress",
        after_evaluate_progress,
        {"dispatch_ready_tasks": "dispatch_ready_tasks", "bounded_replan": "bounded_replan",
         "synthesize_outcome": "synthesize_outcome", END: END},
    )
    graph.add_conditional_edges(
        "bounded_replan",
        after_bounded_replan,
        {"validate_plan": "validate_plan", "clarify": "clarify"},
    )
    graph.add_edge("synthesize_outcome", "respond_propose_memory")
    graph.add_edge("respond_propose_memory", END)

    checkpointer = services.engine.checkpointer
    if checkpointer is not None:
        return graph.compile(checkpointer=checkpointer)
    return graph.compile()
