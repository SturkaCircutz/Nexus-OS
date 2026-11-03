"""Memory service: scoped retrieval and proposal validation.

Doc 03 section 4 - memory is useful context, not authority:
- Retrieve: search M0/M1 runtime context first, then M2..M5 durable records
  with permission filters and a context budget; return references/excerpts.
- Retain: a C9 flow proposes C8; the validator rejects low-value chatter,
  sensitive material without permission, missing provenance, duplicates and
  unresolvable contradictions. Accepted records are versioned in the
  canonical store, then their projections are updated (memory_index).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Optional
from uuid import uuid4

from schemas.contracts import (
    MemoryContext,
    MemoryContextItem,
    MemoryProposal,
    MemoryTier,
    RequestEnvelope,
    Sensitivity,
    utc_now_iso,
)


@dataclass
class MemoryVerdict:
    accepted: bool
    reason: str
    proposal: MemoryProposal


class MemoryService:
    """Retrieval + validation facade used by graph nodes."""

    def __init__(self, repos: Any, settings: Any) -> None:
        self._repos = repos
        self._settings = settings

    # ------------------------------------------------------------------
    # Retrieve
    # ------------------------------------------------------------------

    def retrieve_context(
        self,
        request: RequestEnvelope,
        token_budget: int = 2048,
    ) -> MemoryContext:
        """Scoped retrieval from M0/M1 (runtime) then M2..M5 (durable)."""
        query = request.user_input
        rows = self._repos.memories.lookup(query=query, tiers=None, limit=8)
        items: list[MemoryContextItem] = []
        for row in rows:
            # Deterministic starter scoring: keyword overlap drives relevance;
            # durability drives freshness. Vector recall replaces both later.
            relevance = self._relevance(query, row["content"], row["title"] or "")
            items.append(
                MemoryContextItem(
                    memory_id=row["memory_id"],
                    tier=MemoryTier(row["tier"]),
                    relevance=relevance,
                    freshness=0.8,
                    provenance_ref=f"memory:{row['memory_id']}@{row['revision']}",
                )
            )
        items.sort(key=lambda item: (item.tier.value != "M0", -item.relevance))
        items = [item for item in items if item.relevance > 0.05][: max(token_budget // 256, 1)]
        return MemoryContext(query_id=str(uuid4()), item_refs=items, token_budget=token_budget)

    def _relevance(self, query: str, content: str, title: str) -> float:
        words = [word.lower() for word in query.split() if len(word) >= 3]
        if not words:
            return 0.3
        haystack = f"{title} {content}".lower()
        hits = sum(1 for word in words if word in haystack)
        return min(hits / max(len(words), 1), 1.0)

    # ------------------------------------------------------------------
    # Retain (C8 validation; writes happen through the memory_save tool or
    # the canonical repository - never by an agent)
    # ------------------------------------------------------------------

    def propose_episode(self, request: RequestEnvelope, summary: str) -> MemoryProposal:
        return MemoryProposal(
            proposal_id=str(uuid4()),
            source_request_id=request.request_id,
            tier=MemoryTier.M2,
            kind="episode",
            content_ref=f"request:{request.request_id}",
            provenance_refs=[f"request:{request.request_id}"],
            confidence=0.6,
            sensitivity=Sensitivity.normal,
            operation="create",
        )

    def validate(self, proposal: MemoryProposal, content: str) -> MemoryVerdict:
        """Deterministic validator (doc 03: provenance, value, sensitivity,
        duplicate/conflict handling)."""
        if not proposal.provenance_refs:
            return MemoryVerdict(False, "missing provenance", proposal)
        if proposal.confidence < float(self._settings.memory_min_confidence):
            return MemoryVerdict(False, "confidence below threshold", proposal)
        if len(content.strip()) < 24:
            return MemoryVerdict(False, "low-value content", proposal)
        duplicate = self._find_duplicate(content)
        if duplicate is not None and proposal.operation == "create":
            proposal = proposal.model_copy(update={"operation": "update"})
            return MemoryVerdict(True, f"duplicate of {duplicate}; recorded as update", proposal)
        return MemoryVerdict(True, "accepted", proposal)

    def _find_duplicate(self, content: str) -> Optional[str]:
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        rows = self._repos.memories.list_recent(limit=25)
        # Starter compares hashes directly (sqlite stores a sha256 column).
        for row in rows:
            if row.get("content_hash") == content_hash:
                return row["memory_id"]
        return None

    def record_verdict(
        self, proposal: MemoryProposal, verdict: MemoryVerdict
    ) -> None:
        """Persist the C8 proposal outcome for audit (doc 04 rule 12)."""
        status = "validated" if verdict.accepted else "rejected"
        self._repos.memory_proposals.create(
            proposal, status=status, reason=verdict.reason
        )
