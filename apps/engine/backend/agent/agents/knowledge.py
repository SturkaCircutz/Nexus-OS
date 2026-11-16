"""Knowledge Agent: scope retrieval, rank memory, propose durable retention.

Doc 03 bounded subgraph: choose_memory_scope -> hybrid_retrieve ->
rank_and_deduplicate -> build_context_or_proposal -> validate_conflict_notes
-> return.

It reads only permitted tiers, proposes durable changes through C8, and never
commits them itself.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from agent.execution.policy import proposal_fingerprint
from schemas.contracts import (
    AgentResult,
    AgentResultStatus,
    AgentRole,
    MemoryContext,
    ReceiptStatus,
    RiskClass,
    TaskPacket,
    ToolProposal,
)


class KnowledgeAgent:
    """The knowledge packet proposes memory_lookup (read-only) and answers
    from the observed, verified output - not from model claims."""

    def build_proposal(self, packet: TaskPacket) -> ToolProposal:
        args = {
            "query": packet.objective.split(":", 1)[-1].strip() or packet.objective,
            "tiers": ["M2", "M3", "M4", "M5"],
            "limit": 5,
        }
        return ToolProposal(
            proposal_id=f"proposal:{packet.task_id}",
            task_id=packet.task_id,
            tool_id="memory_lookup",
            tool_version="1",
            args=args,
            target_refs=["memory:store"],
            reason="rank relevant durable memories for the request",
            risk="read_only",
            side_effect=False,
            proposal_fingerprint=proposal_fingerprint(
                "memory_lookup", "1", args, ["memory:store"], packet
            ),
        )

    def respond(
        self,
        packet: TaskPacket,
        memory_context: Optional[MemoryContext],
        lookup_output: Any,
        proposal_id: str,
        receipt_ref: str,
    ) -> AgentResult:
        """Deterministic synthesis with provenance from verified output."""
        evidence: list[str] = []
        lines: list[str] = []
        if lookup_output is not None:
            matches = lookup_output.get("matches", [])
            if matches:
                for match in matches:
                    lines.append(
                        f"[{match.get('tier')}] {match.get('title')}: "
                        f"{str(match.get('content_excerpt'))[:140]}"
                    )
                    evidence.append(f"memory:{match.get('memory_id')}")
            else:
                lines.append("I could not find durable knowledge about that yet.")
        return AgentResult(
            task_id=packet.task_id,
            agent=AgentRole.knowledge,
            status=AgentResultStatus.completed,
            summary=" ".join(lines) if lines else "Knowledge lookup returned no matches.",
            evidence_refs=evidence,
            proposal_refs=[proposal_id],
            receipt_refs=[receipt_ref] if receipt_ref else [],
        )

    # ------------------------------------------------------------------
    # Trace B (doc 03 §6): the report packet stores a durable document.
    # ------------------------------------------------------------------

    def build_report_proposal(self, packet: TaskPacket, material: dict[str, Any]) -> ToolProposal:
        """C4 for the report packet: document_create is reversible but
        side-effecting, so policy keeps it approval-bound. Args come only
        from verified material (completed dependency summaries); the model
        is never in this path."""
        title = str(material.get("title") or "research report").strip() or "research report"
        content = str(material.get("content") or "")
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "report"
        target_refs = [f"workspace:{slug}"]
        args = {
            "title": title[:80],
            "content": content[:20_000],
            "destination_root": "approved_workspace",
        }
        return ToolProposal(
            proposal_id=f"proposal:{packet.task_id}",
            task_id=packet.task_id,
            tool_id="document_create",
            tool_version="1",
            args=args,
            target_refs=target_refs,
            reason="create a durable report from task-verified evidence only",
            risk=RiskClass.reversible_write,
            side_effect=True,
            proposal_fingerprint=proposal_fingerprint(
                "document_create", "1", args, target_refs, packet
            ),
        )

    def respond_report(
        self,
        packet: TaskPacket,
        receipt: Any,
        output: Optional[dict[str, Any]],
    ) -> AgentResult:
        """Reconcile a report-creation receipt; only a C7 may claim success."""
        artifact_id = (output or {}).get("artifact_id")
        if receipt.status == ReceiptStatus.succeeded:
            path = str((output or {}).get("path") or "(no path observed)")
            return AgentResult(
                task_id=packet.task_id,
                agent=packet.assigned_to,
                status=AgentResultStatus.completed,
                summary=f"Report stored at {path}",
                evidence_refs=[str(artifact_id)] if artifact_id else [],
                proposal_refs=[f"proposal:{packet.task_id}"],
                receipt_refs=[receipt.execution_id],
            )
        if receipt.status == ReceiptStatus.unknown_outcome:
            return AgentResult(
                task_id=packet.task_id,
                agent=packet.assigned_to,
                status=AgentResultStatus.blocked,
                summary=str(receipt.error.message if receipt.error else "unclear outcome"),
                evidence_refs=[],
                proposal_refs=[f"proposal:{packet.task_id}"],
                receipt_refs=[receipt.execution_id],
                error=receipt.error,
            )
        return AgentResult(
            task_id=packet.task_id,
            agent=packet.assigned_to,
            status=AgentResultStatus.failed,
            summary=str(receipt.error.message if receipt.error else "report creation failed"),
            evidence_refs=[],
            proposal_refs=[f"proposal:{packet.task_id}"],
            receipt_refs=[receipt.execution_id],
            error=receipt.error,
        )
