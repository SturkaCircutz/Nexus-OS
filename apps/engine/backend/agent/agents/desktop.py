"""Desktop Agent: desktop/system discovery and action proposals.

Doc 03 bounded subgraph: classify_desktop_intent -> resolve_target ->
choose_recipe_or_tool -> build_proposal -> inspect_receipt -> summarize.

Target resolution is registry-backed: application IDs, allowed roots, and
structured desktop observations - never guessed shell commands. It builds
C4 proposals; execution only flows through the trusted gateway.
"""

from __future__ import annotations

from typing import Any, Optional

from agent.execution.policy import proposal_fingerprint
from schemas.contracts import (
    AgentResult,
    AgentResultStatus,
    AgentRole,
    ReceiptStatus,
    TaskPacket,
    ToolProposal,
)


class DesktopAgent:
    def build_proposal(
        self, packet: TaskPacket, recipe: Any
    ) -> Optional[ToolProposal]:
        """Turn a resolved deterministic recipe into a C4 proposal."""
        if recipe is None:
            return None
        risk = "reversible_write" if recipe.tool_id == "open_application" else "read_only"
        return ToolProposal(
            proposal_id=f"proposal:{packet.task_id}",
            task_id=packet.task_id,
            tool_id=recipe.tool_id,
            tool_version="1",
            args=dict(recipe.args),
            target_refs=list(recipe.target_refs),
            reason=recipe.recipe_id.replace("_", " "),
            risk=risk,
            side_effect=recipe.tool_id == "open_application",
            proposal_fingerprint=proposal_fingerprint(
                recipe.tool_id, "1", dict(recipe.args), list(recipe.target_refs), packet
            ),
        )

    def summarize_receipt(
        self, packet: TaskPacket, receipt: Any, output: Optional[dict[str, Any]] = None
    ) -> AgentResult:
        """Summarize the observed receipt - never invent success. When the
        gateway observed structured output, the summary quotes it verbatim."""
        role = packet.assigned_to
        if receipt.status == ReceiptStatus.succeeded:
            detail = ""
            if output:
                observed = ", ".join(
                    f"{key}: {value}" for key, value in sorted(output.items())
                    if value is not None
                )
                if observed:
                    detail = " Observed: " + observed[:300]
            return AgentResult(
                task_id=packet.task_id,
                agent=role,
                status=AgentResultStatus.completed,
                summary=f"Completed {packet.objective[:160]}.{detail}",
                evidence_refs=[], proposal_refs=[],
                receipt_refs=[receipt.execution_id],
            )
        if receipt.status == ReceiptStatus.unknown_outcome:
            return AgentResult(
                task_id=packet.task_id,
                agent=role,
                status=AgentResultStatus.blocked,
                summary=str(receipt.error.message if receipt.error else "unclear outcome"),
                evidence_refs=[], proposal_refs=[],
                receipt_refs=[receipt.execution_id],
                error=receipt.error,
            )
        return AgentResult(
            task_id=packet.task_id,
            agent=role,
            status=AgentResultStatus.failed,
            summary=str(receipt.error.message if receipt.error else "desktop action failed"),
            evidence_refs=[], proposal_refs=[],
            receipt_refs=[receipt.execution_id],
            error=receipt.error,
        )
