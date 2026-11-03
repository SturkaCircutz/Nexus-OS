"""Typed repositories over the AI Core canonical SQLite records.

Canonical ownership follows doc 01 (data ownership): SQLite keeps session,
request, task, proposal, approval, execution, receipt, memory/artifact
metadata, and audit events. Each row stores the canonical contract JSON in
``payload``; indexed columns exist only for the queries the engine needs.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import text

from schemas.contracts import (
    ApprovalRequest,
    ExecutionReceipt,
    ExecutionRequest,
    RequestEnvelope,
    TaskPacket,
    ToolProposal,
    utc_now_iso,
)


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _payload(model: Any) -> str:
    if hasattr(model, "model_dump"):
        return _json(model.model_dump(mode="json"))
    return _json(model)


class Repositories:
    """Aggregated repositories sharing one SQLAlchemy engine."""

    def __init__(self, session_manager: Any) -> None:
        sm = session_manager
        self.sessions = SessionRepository(sm)
        self.requests = RequestRepository(sm)
        self.tasks = TaskRepository(sm)
        self.agent_runs = AgentRunRepository(sm)
        self.proposals = ToolProposalRepository(sm)
        self.approvals = ApprovalRepository(sm)
        self.executions = ExecutionRepository(sm)
        self.memory_proposals = MemoryProposalRepository(sm)
        self.memories = MemoryRepository(sm)
        self.artifacts = ArtifactRepository(sm)
        self.audit = AuditRepository(sm)
        for repo in (self.sessions, self.requests, self.tasks, self.agent_runs,
                     self.proposals, self.approvals, self.executions,
                     self.memory_proposals, self.memories, self.artifacts,
                     self.audit):
            repo._repos = self

    def audit_event(
        self,
        event_type: str,
        request_id: Optional[str] = None,
        task_id: Optional[str] = None,
        detail: Optional[dict[str, Any]] = None,
    ) -> str:
        event_id = self.audit.append(event_type, request_id, task_id, detail)
        return event_id


class BaseRepository:
    def __init__(self, session_manager: Any) -> None:
        self._manager = session_manager
        self._repos: Optional["Repositories"] = None

    def _exec(self, sql: str, params: Optional[dict[str, Any]] = None) -> None:
        self._manager.ensure_initialized()
        with self._manager.engine.begin() as connection:
            connection.execute(text(sql), params or {})

    def _fetch_one(self, sql: str, params: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        self._manager.ensure_initialized()
        with self._manager.engine.connect() as connection:
            row = connection.execute(text(sql), params or {}).mappings().first()
        return dict(row) if row is not None else None

    def _fetch_all(self, sql: str, params: Optional[dict[str, Any]] = None) -> list[dict[str, Any]]:
        self._manager.ensure_initialized()
        with self._manager.engine.connect() as connection:
            rows = connection.execute(text(sql), params or {}).mappings().all()
        return [dict(row) for row in rows]


class SessionRepository(BaseRepository):
    def create(self, session_id: str) -> None:
        self._exec(
            "INSERT OR IGNORE INTO sessions (session_id, created_at) VALUES (:sid, :ts)",
            {"sid": session_id, "ts": utc_now_iso()},
        )


class RequestRepository(BaseRepository):
    def create(self, envelope: RequestEnvelope, status: str = "received", route: Optional[str] = None) -> None:
        self._repos.sessions.create(envelope.session_id)
        now = utc_now_iso()
        self._exec(
            """
            INSERT OR REPLACE INTO requests
              (request_id, session_id, parent_request_id, user_input, status, route, response_text, payload, created_at, updated_at)
            VALUES
              (:rid, :sid, :prid, :ui, :status, :route, :response, :payload, :ts, :ts)
            """,
            {
                "rid": envelope.request_id,
                "sid": envelope.session_id,
                "prid": envelope.parent_request_id,
                "ui": envelope.user_input,
                "status": status,
                "route": route,
                "response": None,
                "payload": _payload(envelope),
                "ts": now,
            },
        )

    def get(self, request_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one("SELECT * FROM requests WHERE request_id = :rid", {"rid": request_id})

    def set_status(self, request_id: str, status: str, route: Optional[str] = None) -> None:
        self._exec(
            "UPDATE requests SET status = :status, route = COALESCE(:route, route), updated_at = :ts WHERE request_id = :rid",
            {"status": status, "route": route, "ts": utc_now_iso(), "rid": request_id},
        )

    def set_response(
        self, request_id: str, status: str, route: Optional[str], response_text: str
    ) -> None:
        self._exec(
            """
            UPDATE requests SET status = :status, route = COALESCE(:route, route),
                                response_text = :response, updated_at = :ts
            WHERE request_id = :rid
            """,
            {"status": status, "route": route, "response": response_text, "ts": utc_now_iso(), "rid": request_id},
        )


class TaskRepository(BaseRepository):
    def create(self, packet: TaskPacket, status: str = "created") -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO tasks
              (task_id, request_id, parent_task_id, assigned_to, objective, status, attempt, payload, created_at)
            VALUES
              (:tid, :rid, :ptid, :agent, :obj, :status, :attempt, :payload, :ts)
            """,
            {
                "tid": packet.task_id,
                "rid": packet.request_id,
                "ptid": packet.parent_task_id,
                "agent": packet.assigned_to.value,
                "obj": packet.objective,
                "status": status,
                "attempt": packet.attempt,
                "payload": _payload(packet),
                "ts": utc_now_iso(),
            },
        )

    def get(self, task_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one("SELECT * FROM tasks WHERE task_id = :tid", {"tid": task_id})

    def list_for_request(self, request_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM tasks WHERE request_id = :rid ORDER BY created_at, rowid",
            {"rid": request_id},
        )

    def set_status(self, task_id: str, status: str) -> None:
        self._exec(
            "UPDATE tasks SET status = :status WHERE task_id = :tid",
            {"status": status, "tid": task_id},
        )


class AgentRunRepository(BaseRepository):
    def start(self, task_id: str, agent: str) -> str:
        run_id = str(uuid4())
        self._exec(
            """
            INSERT OR REPLACE INTO agent_runs (run_id, task_id, agent, status, started_at)
            VALUES (:run_id, :tid, :agent, :status, :ts)
            """,
            {"run_id": run_id, "tid": task_id, "agent": agent, "status": "running", "ts": utc_now_iso()},
        )
        return run_id

    def finish(self, run_id: str, status: str) -> None:
        self._exec(
            "UPDATE agent_runs SET status = :status, finished_at = :ts WHERE run_id = :run_id",
            {"status": status, "ts": utc_now_iso(), "run_id": run_id},
        )


class ToolProposalRepository(BaseRepository):
    def create(
        self, proposal: ToolProposal, request_id: str, status: str = "proposed"
    ) -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO tool_proposals
              (proposal_id, task_id, request_id, tool_id, tool_version, risk, side_effect,
               proposal_fingerprint, status, payload, created_at)
            VALUES
              (:pid, :tid, :rid, :tool_id, :tv, :risk, :se, :fp, :status, :payload, :ts)
            """,
            {
                "pid": proposal.proposal_id,
                "tid": proposal.task_id,
                "rid": request_id,
                "tool_id": proposal.tool_id,
                "tv": proposal.tool_version,
                "risk": proposal.risk.value,
                "se": 1 if proposal.side_effect else 0,
                "fp": proposal.proposal_fingerprint,
                "status": status,
                "payload": _payload(proposal),
                "ts": utc_now_iso(),
            },
        )

    def get(self, proposal_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM tool_proposals WHERE proposal_id = :pid", {"pid": proposal_id}
        )

    def list_for_request(self, request_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM tool_proposals WHERE request_id = :rid ORDER BY created_at, rowid",
            {"rid": request_id},
        )

    def set_status(self, proposal_id: str, status: str) -> None:
        self._exec(
            "UPDATE tool_proposals SET status = :status WHERE proposal_id = :pid",
            {"status": status, "pid": proposal_id},
        )


class ApprovalRepository(BaseRepository):
    def create(self, approval: ApprovalRequest, session_id: str) -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO approval_requests
              (approval_id, proposal_id, proposal_fingerprint, summary, status,
               session_id, created_at, expires_at, decided_at)
            VALUES
              (:aid, :pid, :fp, :summary, :status, :sid, :created, :expires, NULL)
            """,
            {
                "aid": approval.approval_id,
                "pid": approval.proposal_id,
                "fp": approval.proposal_fingerprint,
                "summary": approval.summary,
                "status": approval.status.value,
                "sid": session_id,
                "created": approval.created_at,
                "expires": approval.expires_at,
            },
        )

    def get(self, approval_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM approval_requests WHERE approval_id = :aid", {"aid": approval_id}
        )

    def list_pending_for_session(self, session_id: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT * FROM approval_requests
             WHERE session_id = :sid AND status = 'pending' ORDER BY created_at
            """,
            {"sid": session_id},
        )

    def list_for_session(self, session_id: str, status: str) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT * FROM approval_requests
             WHERE session_id = :sid AND status = :status ORDER BY created_at
            """,
            {"sid": session_id, "status": status},
        )

    def decide(self, approval_id: str, status: str) -> None:
        self._exec(
            """
            UPDATE approval_requests SET status = :status, decided_at = :ts
            WHERE approval_id = :aid
            """,
            {"status": status, "ts": utc_now_iso(), "aid": approval_id},
        )


class ExecutionRepository(BaseRepository):
    def start(self, execution: ExecutionRequest, tool_id: str, fingerprint_verified: bool) -> str:
        started_at = utc_now_iso()
        self._exec(
            """
            INSERT OR REPLACE INTO tool_executions
              (execution_id, proposal_id, idempotency_key, approval_id, tool_id,
               fingerprint_verified, started_at)
            VALUES
              (:eid, :pid, :ikey, :approval_id, :tool_id, :fp_ok, :ts)
            """,
            {
                "eid": execution.execution_id,
                "pid": execution.proposal_id,
                "ikey": execution.idempotency_key,
                "approval_id": execution.approval_id,
                "tool_id": tool_id,
                "fp_ok": 1 if fingerprint_verified else 0,
                "ts": started_at,
            },
        )
        return started_at

    def record_receipt(self, receipt: ExecutionReceipt) -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO execution_receipts
              (execution_id, status, started_at, finished_at, output_ref, error, payload)
            VALUES
              (:eid, :status, :started, :finished, :output, :error, :payload)
            """,
            {
                "eid": receipt.execution_id,
                "status": receipt.status.value,
                "started": receipt.started_at,
                "finished": receipt.finished_at,
                "output": receipt.output_ref,
                "error": _json(receipt.error.model_dump(mode="json")) if receipt.error else None,
                "payload": _payload(receipt),
            },
        )

    def find_by_idempotency_key(self, idempotency_key: str) -> Optional[dict[str, Any]]:
        """Latest recorded execution for a key (receipt joined if present)."""
        return self._fetch_one(
            """
            SELECT t.execution_id, t.idempotency_key, t.proposal_id,
                   r.status AS receipt_status, r.payload AS receipt_payload
              FROM tool_executions t
              LEFT JOIN execution_receipts r ON r.execution_id = t.execution_id
             WHERE t.idempotency_key = :ikey
             ORDER BY t.started_at DESC
            """,
            {"ikey": idempotency_key},
        )

    def get(self, execution_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM tool_executions WHERE execution_id = :eid", {"eid": execution_id}
        )


class MemoryProposalRepository(BaseRepository):
    def create(
        self,
        proposal: Any,
        status: str,
        reason: Optional[str] = None,
    ) -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO memory_proposals
              (proposal_id, source_request_id, tier, kind, content_ref, confidence,
               sensitivity, operation, status, reason, payload, created_at)
            VALUES
              (:pid, :rid, :tier, :kind, :content_ref, :conf, :sens, :op, :status, :reason, :payload, :ts)
            """,
            {
                "pid": proposal.proposal_id,
                "rid": proposal.source_request_id,
                "tier": proposal.tier.value,
                "kind": proposal.kind.value,
                "content_ref": proposal.content_ref,
                "conf": proposal.confidence,
                "sens": proposal.sensitivity.value,
                "op": proposal.operation.value,
                "status": status,
                "reason": reason,
                "payload": _payload(proposal),
                "ts": utc_now_iso(),
            },
        )


    def get(self, proposal_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM memory_proposals WHERE proposal_id = :pid", {"pid": proposal_id}
        )


class MemoryRepository(BaseRepository):
    def create(
        self,
        memory_id: str,
        tier: str,
        kind: str,
        content: str,
        title: str,
        provenance_refs: list[str],
        confidence: float,
        sensitivity: str,
    ) -> None:
        now = utc_now_iso()
        provenance_json = _json(provenance_refs)
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        self._exec(
            """
            INSERT OR REPLACE INTO memories
              (memory_id, tier, kind, content, title, provenance_refs, confidence,
               sensitivity, revision, status, content_hash, created_at, updated_at)
            VALUES
              (:mid, :tier, :kind, :content, :title, :prov, :conf, :sens, 1, 'active',
               :hash, :ts, :ts)
            """,
            {
                "mid": memory_id,
                "tier": tier,
                "kind": kind,
                "content": content,
                "title": title,
                "prov": provenance_json,
                "conf": confidence,
                "sens": sensitivity,
                "hash": content_hash,
                "ts": now,
            },
        )
        for ref in provenance_refs:
            self._exec(
                "INSERT OR IGNORE INTO memory_sources (memory_id, source_ref) VALUES (:mid, :ref)",
                {"mid": memory_id, "ref": ref},
            )
        # Keep the rebuildable retrieval projection in step with the record.
        self._exec(
            "DELETE FROM memory_index WHERE memory_id = :mid",
            {"mid": memory_id},
        )
        self._exec(
            """
            INSERT INTO memory_index (memory_id, revision, body)
            VALUES (:mid, 1, :body)
            """,
            {"mid": memory_id, "body": f"{title} {content}".strip()},
        )

    def get(self, memory_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one("SELECT * FROM memories WHERE memory_id = :mid", {"mid": memory_id})

    def lookup(self, query: str, tiers: Optional[list[str]], limit: int) -> list[dict[str, Any]]:
        """Keyword recall over the rebuildable projection (starter tier).
        Semantic/vector recall is a later index concern (doc 01 storage)."""
        base = (
            "SELECT m.* FROM memory_index i JOIN memories m ON m.memory_id = i.memory_id"
        )
        where: list[str] = ["m.status = 'active'"]
        params: dict[str, Any] = {"limit": limit}
        if tiers:
            where.append("m.tier IN (" + ",".join(f":t{idx}" for idx in range(len(tiers))) + ")")
            for idx, tier in enumerate(tiers):
                params[f"t{idx}"] = tier
        if query.strip():
            words = [word for word in query.split() if len(word) >= 3][:8]
            if words:
                clauses = [f"i.body LIKE :w{idx}" for idx in range(len(words))]
                where.append("(" + " OR ".join(clauses) + ")")
                for idx, word in enumerate(words):
                    params[f"w{idx}"] = f"%{word}%"
        params["limit"] = limit
        sql = base + " WHERE " + " AND ".join(where)
        sql += " ORDER BY updated_at DESC LIMIT :limit"
        return self._fetch_all(sql, params)

    def list_recent(self, limit: int) -> list[dict[str, Any]]:
        return self._fetch_all(
            "SELECT * FROM memories ORDER BY updated_at DESC LIMIT :limit", {"limit": limit}
        )

    def retire(self, memory_id: str) -> None:
        self._exec(
            "UPDATE memories SET status = 'retired', updated_at = :ts WHERE memory_id = :mid",
            {"ts": utc_now_iso(), "mid": memory_id},
        )


class ArtifactRepository(BaseRepository):
    def register(
        self, artifact_id: str, path: str, media_type: str, title: str, request_id: Optional[str]
    ) -> None:
        self._exec(
            """
            INSERT OR REPLACE INTO knowledge_artifacts
              (artifact_id, path, media_type, title, request_id, created_at)
            VALUES (:aid, :path, :media_type, :title, :rid, :ts)
            """,
            {"aid": artifact_id, "path": path, "media_type": media_type, "title": title, "rid": request_id, "ts": utc_now_iso()},
        )

    def get(self, artifact_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM knowledge_artifacts WHERE artifact_id = :aid", {"aid": artifact_id}
        )


class AuditRepository(BaseRepository):
    def append(
        self,
        event_type: str,
        request_id: Optional[str],
        task_id: Optional[str],
        detail: Optional[dict[str, Any]],
    ) -> str:
        event_id = str(uuid4())
        self._exec(
            """
            INSERT INTO audit_events (event_id, request_id, task_id, event_type, detail, created_at)
            VALUES (:eid, :rid, :tid, :etype, :detail, :ts)
            """,
            {
                "eid": event_id,
                "rid": request_id,
                "tid": task_id,
                "etype": event_type,
                "detail": _json(detail or {}),
                "ts": utc_now_iso(),
            },
        )
        return event_id

    def get(self, event_id: str) -> Optional[dict[str, Any]]:
        return self._fetch_one(
            "SELECT * FROM audit_events WHERE event_id = :eid", {"eid": event_id}
        )

    def list_for_request(self, request_id: str) -> list[dict[str, Any]]:
        # (created_at, rowid) keeps same-second rows in insertion order, which
        # keeps audit-derived material (e.g. report content) stable across
        # worker passes and approval resumes.
        return self._fetch_all(
            "SELECT * FROM audit_events WHERE request_id = :rid ORDER BY created_at, rowid",
            {"rid": request_id},
        )
