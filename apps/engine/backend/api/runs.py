"""RunManager: one *run* per user interaction, executed in the background
and narrated over the session WebSocket.

A run wraps one or more engine requests (C1). It starts with
``POST /api/v1/agent/runs``; if the graph stops for a human (approval or
clarification) the run pauses with an ``interrupt`` and the same ``run_id``
continues on ``POST .../resume``. ``run_id`` is the first request's
``request_id``, so audit rows stay linked.

Run statuses (API-level, see docs/AI-Core/07-api-flow.md):
    received -> running -> (awaiting_input -> running)* -> completed | failed | cancelled
Engine request statuses (doc 02 vocabulary) are unchanged underneath.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Optional

from agent.core import CoreEngine, CoreRequestResult
from api.events import (
    NODE_AGENT_STATE,
    RESULT_NODES,
    AgentState,
    EventType,
    InterruptKind,
    Source,
    api_error,
)
from api.hub import SessionHub
from api.ui_bridge import current_run_id, current_session_id
from schemas.contracts import RequestEnvelope, utc_now_iso

TERMINAL = frozenset({"completed", "failed", "cancelled"})
_YES = {"yes", "y", "approve", "approved", "confirm", "ok", "true"}
_NO = {"no", "n", "reject", "rejected", "deny", "cancel", "false"}
_MAX_FINISHED_RUNS = 200


class RunNotFound(KeyError):
    pass


class RunConflict(RuntimeError):
    """The run is not in a state that allows this action."""


@dataclass
class RunRecord:
    run_id: str
    session_id: str
    source: str
    status: str = "received"
    agent_state: str = AgentState.idle.value
    route: Optional[str] = None
    request_ids: list[str] = field(default_factory=list)
    response: Optional[dict[str, Any]] = None
    interrupt: Optional[dict[str, Any]] = None
    errors: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)
    task: Optional[asyncio.Task[None]] = field(default=None, repr=False)

    def view(self) -> dict[str, Any]:
        """REST shape for ``GET /api/v1/agent/runs/{run_id}``."""
        return {
            "run_id": self.run_id,
            "session_id": self.session_id,
            "source": self.source,
            "status": self.status,
            "agent_state": self.agent_state,
            "route": self.route,
            "request_ids": list(self.request_ids),
            "response": self.response,
            "interrupt": self.interrupt,
            "errors": list(self.errors),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class RunManager:
    def __init__(self, engine: CoreEngine, hub: SessionHub) -> None:
        self._engine = engine
        self._hub = hub
        self._runs: OrderedDict[str, RunRecord] = OrderedDict()
        self._graph_lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Public actions (called by the REST routes)
    # ------------------------------------------------------------------

    def get(self, run_id: str) -> RunRecord:
        record = self._runs.get(run_id)
        if record is None:
            raise RunNotFound(run_id)
        return record

    def start(
        self,
        text: str,
        session_id: str,
        source: Source,
        ui_context: Optional[dict[str, Any]] = None,
    ) -> RunRecord:
        """Validate the request (raises ValueError) and run it in the background."""
        envelope = RequestEnvelope.from_raw({
            "session_id": session_id,
            "user_input": text,
            "ui_context": ui_context or self._ui_context_from_wm(session_id),
        })
        record = RunRecord(run_id=envelope.request_id, session_id=session_id,
                           source=source.value)
        self._runs[record.run_id] = record
        self._prune()
        self._spawn(record, self._execute_request(record, envelope))
        return record

    def resume(self, run_id: str, answer: Any) -> RunRecord:
        """Answer the pending interrupt and continue the same run."""
        record = self.get(run_id)
        if record.status != "awaiting_input" or record.interrupt is None:
            raise RunConflict(f"run {run_id} is {record.status}, nothing to resume")
        interrupt = record.interrupt
        if interrupt["kind"] == InterruptKind.confirm.value:
            decision = _decision(answer)
            work = self._execute_confirm(record, interrupt["approval_id"], decision)
        else:
            text = str(answer or "").strip()
            if not text:
                raise ValueError("a clarify answer must be non-empty text")
            envelope = RequestEnvelope.from_raw({
                "session_id": record.session_id,
                "parent_request_id": record.request_ids[-1],
                "user_input": text,
                "ui_context": self._ui_context_from_wm(record.session_id),
            })
            work = self._execute_request(record, envelope)
        record.interrupt = None
        self._touch(record, status="running")
        self._spawn(record, work)
        return record

    async def cancel(self, run_id: str) -> RunRecord:
        record = self.get(run_id)
        if record.status in TERMINAL:
            raise RunConflict(f"run {run_id} is already {record.status}")
        task = record.task
        if task is not None and not task.done():
            task.cancel()
            await asyncio.wait({task}, timeout=5)
            return record
        # Paused on an interrupt: close the pending approval so it cannot be
        # approved later from another surface.
        interrupt = record.interrupt or {}
        if interrupt.get("approval_id"):
            self._engine.approver.decide(interrupt["approval_id"], "rejected",
                                         record.session_id)
        self._finish_cancelled(record)
        return record

    # ------------------------------------------------------------------
    # Background execution
    # ------------------------------------------------------------------

    def _spawn(self, record: RunRecord, work: Any) -> None:
        record.task = asyncio.create_task(self._guard(record, work))

    async def _guard(self, record: RunRecord, work: Any) -> None:
        current_session_id.set(record.session_id)  # task-local copy
        current_run_id.set(record.run_id)
        try:
            await work
        except asyncio.CancelledError:
            self._finish_cancelled(record)
        except Exception as error:  # engine bug: surface it, keep the server up
            self._fail(record, "ENGINE_FAILURE", f"engine failure: {error}")

    async def _execute_request(self, record: RunRecord, envelope: RequestEnvelope) -> None:
        async with self._graph_lock:
            await self._engine.ensure_main_graph()
        record.request_ids.append(envelope.request_id)
        self._touch(record, status="running")
        self._set_state(record, AgentState.thinking, node="received")
        result = await self._engine.handle_request(
            envelope, on_graph_event=self._graph_observer(record)
        )
        self._settle(record, result)

    async def _execute_confirm(self, record: RunRecord, approval_id: str, decision: str) -> None:
        self._set_state(record, AgentState.acting if decision == "approved"
                        else AgentState.thinking, decision=decision)
        result = await self._engine.resume_after_decision(
            approval_id, decision, record.session_id
        )
        record.request_ids.append(result.request_id)
        self._settle(record, result)

    def _graph_observer(self, record: RunRecord):
        async def observe(kind: str, node: str, update: Optional[dict[str, Any]]) -> None:
            if kind == "node_started":
                state = NODE_AGENT_STATE.get(node)
                if state is not None:
                    self._set_state(record, state, node=node)
            elif kind == "node_finished" and node in RESULT_NODES:
                for result in (update or {}).get("results") or []:
                    self._publish(record, EventType.task_progress, _task_progress(result))
        return observe

    # ------------------------------------------------------------------
    # Outcomes
    # ------------------------------------------------------------------

    def _settle(self, record: RunRecord, result: CoreRequestResult) -> None:
        record.route = result.route or record.route
        record.errors = [error.model_dump(mode="json") for error in result.errors]
        if result.pending_approval is not None:
            approval = result.pending_approval
            self._pause(record, {
                "kind": InterruptKind.confirm.value,
                "message": approval["summary"],
                "options": ["yes", "no"],
                "approval_id": approval["approval_id"],
                "expires_at": approval["expires_at"],
            })
        elif result.route == "clarify" and result.status == "completed":
            self._pause(record, {
                "kind": InterruptKind.clarify.value,
                "message": result.response_text,
                "options": [],
            })
        elif result.status == "failed":
            first = result.errors[0] if result.errors else None
            self._fail(record, first.code.value if first else "ENGINE_FAILURE",
                       first.message if first else (result.response_text or "request failed"))
        else:
            self._complete(record, result)

    def _pause(self, record: RunRecord, interrupt: dict[str, Any]) -> None:
        record.interrupt = interrupt
        self._touch(record, status="awaiting_input")
        self._set_state(record, AgentState.waiting, kind=interrupt["kind"])
        self._publish(record, EventType.run_interrupt, interrupt)

    def _complete(self, record: RunRecord, result: CoreRequestResult) -> None:
        record.response = {"text": result.response_text,
                           "evidence_refs": list(result.evidence_refs)}
        self._touch(record, status="completed")
        self._publish(record, EventType.run_response,
                      {**record.response, "route": record.route})
        # The shell plays the speech and returns the avatar to idle itself.
        self._set_state(record, AgentState.speaking if result.response_text
                        else AgentState.idle)
        self._publish(record, EventType.run_completed,
                      {"status": "completed", "errors": record.errors})

    def _fail(self, record: RunRecord, code: str, message: str) -> None:
        self._touch(record, status="failed")
        self._publish(record, EventType.run_error, api_error(code, message))
        self._set_state(record, AgentState.error)
        self._publish(record, EventType.run_completed,
                      {"status": "failed", "errors": record.errors
                       or [api_error(code, message)["error"]]})

    def _finish_cancelled(self, record: RunRecord) -> None:
        if record.status in TERMINAL:
            return
        record.interrupt = None
        self._touch(record, status="cancelled")
        if record.request_ids:
            self._engine.repos.requests.set_status(record.request_ids[-1], "cancelled")
        self._set_state(record, AgentState.idle)
        self._publish(record, EventType.run_completed, {"status": "cancelled", "errors": []})

    # ------------------------------------------------------------------
    # Small helpers
    # ------------------------------------------------------------------

    def _publish(self, record: RunRecord, event_type: EventType, data: dict[str, Any]) -> None:
        self._hub.publish(record.session_id, event_type, data, run_id=record.run_id)

    def _set_state(self, record: RunRecord, state: AgentState, **data: Any) -> None:
        if record.agent_state == state.value:
            return
        record.agent_state = state.value
        self._publish(record, EventType.agent_state, {"state": state.value, **data})

    @staticmethod
    def _touch(record: RunRecord, status: str) -> None:
        record.status = status
        record.updated_at = utc_now_iso()

    def _ui_context_from_wm(self, session_id: str) -> dict[str, Any]:
        """Default C1 ui_context from the shell's latest ``wm.state``."""
        wm = self._hub.wm_state(session_id) or {}
        focused = wm.get("focused_app_id")
        return {"active_surface": focused} if isinstance(focused, str) and focused else {}

    def _prune(self) -> None:
        finished = [run_id for run_id, record in self._runs.items() if record.status in TERMINAL]
        for run_id in finished[: max(0, len(finished) - _MAX_FINISHED_RUNS)]:
            del self._runs[run_id]


def _decision(answer: Any) -> str:
    if isinstance(answer, bool):
        return "approved" if answer else "rejected"
    lowered = str(answer or "").strip().lower()
    if lowered in _YES:
        return "approved"
    if lowered in _NO:
        return "rejected"
    raise ValueError("a confirm answer must be yes or no")


def _task_progress(result: Any) -> dict[str, Any]:
    data = result.model_dump(mode="json") if hasattr(result, "model_dump") else dict(result)
    return {
        "task_id": data.get("task_id"),
        "agent": data.get("agent"),
        "status": data.get("status"),
        "summary": data.get("summary"),
        "error": data.get("error"),
    }
