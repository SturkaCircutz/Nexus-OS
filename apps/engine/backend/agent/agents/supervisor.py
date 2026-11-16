"""Supervisor: decompose a request into bounded C3 packets with dependencies.

Bounded subgraph (doc 03 section 2):
    interpret_intent -> select_capability_group -> decompose -> map_dependencies
    -> issue_task_packets (merge_results / decide_finish_or_replan for the graph)

Visibility rule: the supervisor only ever sees registry metadata and result
summaries. It does not receive raw native capability tokens, cannot execute
tools, and cannot grant access.

Plan shapes (deterministic intent interpretation; a configured model may only
*offer* the discovery query list, which is validated before use):

- ``knowledge_answer``: one knowledge-ground packet (trace C).
- ``research``: one knowledge-ground packet + one discovery packet per query.
- ``research_report``: research shape + a final knowledge packet that creates
  a report document (trace B) and depends on all packets it needs.

Dependencies are encoded inside C3: a packet's ``input_refs`` may contain
``task:<task_id>`` references; ``validate_plan``/``evaluate_progress`` gate
dispatch until each has reached a terminal successful state. No contract
change (doc 02) - references carry through C3 input refs and parent lineage.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from agent.providers.structured import DiscoveryQueryPlan, parse_offer
from schemas.contracts import (
    AgentRole,
    MemoryContext,
    RequestEnvelope,
    TaskPacket,
)

_REPORT_VERB = re.compile(r"\b(report|summary|write-up|writeup|document)\b", re.IGNORECASE)
_RESEARCH_VERB = re.compile(r"\b(research|investigate|find out|compare)\b", re.IGNORECASE)
_QUESTIONISH = re.compile(r"^(what|where|why|how|who|can|is|does)\b|\?\s*$", re.IGNORECASE)

_STOPWORDS = {
    "research", "and", "the", "a", "an", "about", "with", "create", "report",
    "summary", "document", "make", "write", "for", "on", "in", "to", "what",
    "how", "why", "please", "us", "our", "we", "i", "of", "compare", "find",
    "investigate", "tell", "did", "make", "using", "use",
}

_MAX_QUERIES = 3  # bounded plan width (doc 04 rule 7)


@dataclass(frozen=True)
class PlanIntent:
    """Interpreted request shape (data, not prompt text)."""

    kind: str  # knowledge_answer | research | research_report
    objective: str
    topic: str
    queries: list[str] = field(default_factory=list)


class Supervisor:
    """Coordinator of bounded work. It never executes or grants access."""

    def __init__(self, registry: Any, settings: Any, model: Any = None) -> None:
        self._registry = registry
        self._settings = settings
        self._model = model  # Optional ModelClient; None keeps all-deterministic

    # ------------------------------------------------------------------
    # 1. interpret_intent
    # ------------------------------------------------------------------

    @staticmethod
    def interpret_intent(user_input: str) -> PlanIntent:
        objective = user_input.strip()
        wants_report = bool(_REPORT_VERB.search(objective))
        wants_research = bool(_RESEARCH_VERB.search(objective))
        if wants_research and wants_report:
            kind = "research_report"
        elif wants_research:
            kind = "research"
        elif _QUESTIONISH.search(objective):
            kind = "knowledge_answer"
        else:
            kind = "knowledge_answer"
        topic = _topic_of(objective)
        intent = PlanIntent(kind=kind, objective=objective, topic=topic)
        return intent

    # ------------------------------------------------------------------
    # 2. select_capability_group + 3. decompose (query width)
    # ------------------------------------------------------------------

    def _deterministic_queries(self, intent: PlanIntent) -> list[str]:
        """Split the topic into up to three sub-queries (stopword-light)."""
        words = [word for word in intent.topic.split() if word.lower() not in _STOPWORDS]
        if not words:
            return [intent.topic[:80]] if intent.topic.strip() else []
        # chunked triplets keep queries independent yet focused
        chunks = [" ".join(words[i:i + 3]) for i in range(0, len(words), 3)]
        return chunks[:_MAX_QUERIES]

    async def _offer_queries(self, intent: PlanIntent) -> list[str]:
        """Model touchpoint #1: a DiscoveryQueryPlan offer (validated).

        A configured model may propose the query list; anything unusable or
        unavailable keeps the deterministic split (doc 04 rule 2/9)."""
        if self._model is None:
            return self._deterministic_queries(intent)
        from agent.providers.structured import schema_instruction

        try:
            raw = await self._model.complete_json(
                schema_instruction("DiscoveryQueryPlan")
                + " Never include tool names, policies, or execution instructions.",
                f"Objective: {intent.objective[:400]}",
                "DiscoveryQueryPlan",
            )
        except Exception:
            return self._deterministic_queries(intent)
        offer = parse_offer(raw, "DiscoveryQueryPlan")
        if not isinstance(offer, DiscoveryQueryPlan):
            return self._deterministic_queries(intent)
        return list(offer.queries)[:_MAX_QUERIES]

    # ------------------------------------------------------------------
    # 3. decompose -> 4. map_dependencies -> 5. issue_task_packets
    # ------------------------------------------------------------------

    def plan(
        self,
        request: RequestEnvelope,
        memory_context: Optional[MemoryContext],
        revision: int = 0,
        parent_task_ids: Optional[list[str]] = None,
        queries: Optional[list[str]] = None,
    ) -> list[TaskPacket]:
        """Issue the bounded packet set for this intent and revision.

        Synchronous by design (model queries are resolved by the caller via
        :meth:`plan_with_queries` when a provider is configured)."""
        intent = self.interpret_intent(request.user_input)
        if queries is None:
            queries = self._deterministic_queries(intent)
        parent = parent_task_ids[0] if parent_task_ids else None

        def key(step: str) -> str:
            # Revision-scoped idempotency: restart replays stay safe; a
            # replanned attempt is a new execution (new key), doc 03 §7.
            return f"supervised:{request.request_id}:{step}:r{revision}"

        packets: list[TaskPacket] = []

        ground_id = f"task:{request.request_id}:ground:r{revision}"
        packets.append(TaskPacket(
            task_id=ground_id,
            request_id=request.request_id,
            parent_task_id=parent,
            assigned_to=AgentRole.knowledge,
            objective=f"Answer from durable knowledge: {intent.topic[:160]}",
            input_refs=[
                f"memory:{item.memory_id}"
                for item in (memory_context.item_refs if memory_context else [])
            ],
            allowed_capabilities=["memory_lookup"],
            scope=self._scope(),
            idempotency_key=key("ground"),
            attempt=revision,
        ))
        if not queries or intent.kind == "knowledge_answer":
            # Deterministic plan width 1; nothing depends on it yet.
            return packets

        # research / research_report: one discovery packet per query, each
        # a bounded single-tool worker pass (one C4 per pass, doc 03 §3).
        discovery_ids: list[str] = []
        for index, query in enumerate(queries[:_MAX_QUERIES]):
            step = f"discovery-{index}"
            discovery_ids.append(f"task:{request.request_id}:{step}:r{revision}")
            packets.append(TaskPacket(
                task_id=discovery_ids[index],
                request_id=request.request_id,
                parent_task_id=parent,
                assigned_to=AgentRole.discovery,
                objective=f"Find evidence about: {intent.topic[:120]} [{query[:120]}]",
                input_refs=[],  # independent of the ground packet (parallel fan-out)
                allowed_capabilities=["memory_lookup", "document_read"],
                scope=self._scope(),
                idempotency_key=key(step),
                attempt=revision,
            ))

        if intent.kind != "research_report":
            return packets

        # trace B: after evidence merges, one synthesis packet creates a
        # report through document_create (approval-bound, reversible_write).
        # It depends on ALL packets whose verified output it may quote.
        report_id = f"task:{request.request_id}:report:r{revision}"
        packets.append(TaskPacket(
            task_id=report_id,
            request_id=request.request_id,
            parent_task_id=parent,
            assigned_to=AgentRole.knowledge,
            objective=f"Create report: {intent.topic[:160]}",
            input_refs=[ground_id] + list(discovery_ids),
            allowed_capabilities=["document_create"],
            scope=self._scope(),
            idempotency_key=key("report"),
            attempt=revision,
        ))
        return packets

    async def plan_with_queries(
        self,
        request: RequestEnvelope,
        memory_context: Optional[MemoryContext],
        revision: int = 0,
        parent_task_ids: Optional[list[str]] = None,
    ) -> tuple[list[TaskPacket], list[str]]:
        """Graph entry used by the main graph: resolves query offers from a
        configured model first (validated), else deterministic split."""
        intent = self.interpret_intent(request.user_input)
        if intent.kind == "knowledge_answer":
            # A knowledge answer needs no discovery queries: skip the model
            # entirely (deterministic-first; also keeps offer queues aligned).
            queries = self._deterministic_queries(intent)
        else:
            queries = await self._offer_queries(intent)
        if not queries:
            packets = self.plan(request, memory_context, revision, parent_task_ids, [])
        else:
            packets = self.plan(request, memory_context, revision, parent_task_ids, queries)
        return packets, queries

    # ------------------------------------------------------------------
    # 6./7. merge_results + decide_finish_or_replan (graph helpers)
    # ------------------------------------------------------------------

    @staticmethod
    def merge_results(results: Any) -> dict[str, Any]:
        """Compact coordinator view: summaries + evidence per task."""
        merged: dict[str, Any] = {
            "completed": [],
            "failed": [],
            "waiting": [],
            "evidence_refs": [],
        }
        for result in results or []:
            if result.status.value == "completed":
                merged["completed"].append(result)
            elif result.status == "needs_input":
                merged["waiting"].append(result)
            else:
                merged["failed"].append(result)
            merged["evidence_refs"].extend(result.evidence_refs)
        return merged

    def decide_finish_or_replan(self, merged: dict[str, Any], replan_count: int) -> str:
        if merged["waiting"]:
            return "wait"  # approval-bound work; the graph stops at C5
        if merged["failed"] and replan_count < int(self._settings.max_replan_count):
            return "replan"
        return "finish"

    # ------------------------------------------------------------------

    def _scope(self) -> Any:
        from schemas.contracts import TaskScope

        return TaskScope(max_steps=max(int(self._settings.max_replan_count) + 1, 1))


def _topic_of(objective: str) -> str:
    """Strip the request-shape words; keep user language for targeting."""
    lowered = objective.lower()
    for lead in ("please ", "can you ", "could you "):
        if lowered.startswith(lead):
            objective = objective[len(lead):]
    # trace B phrasing keeps the full objective as topic for citations
    return objective.strip()[:240]
