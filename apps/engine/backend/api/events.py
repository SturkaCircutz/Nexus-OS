"""Wire vocabulary for the API flow (docs/AI-Core/07-api-flow.md).

Every WebSocket message, in both directions, is one ``WsEnvelope``:

    {"type": "agent.state", "session_id": "...", "run_id": "..." | null,
     "ts": "2026-11-04T18:49:00Z", "data": {...}}

Names here are the contract shared with the shell
(``apps/shell/frontend/src/types/agentEvents.ts``). Change both together.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from schemas.contracts import utc_now_iso


class EventType(str, Enum):
    # server -> client
    agent_state = "agent.state"
    task_progress = "task.progress"
    ui_command = "ui.command"
    run_interrupt = "run.interrupt"
    run_response = "run.response"
    run_completed = "run.completed"
    run_error = "run.error"
    # client -> server
    ui_command_ack = "ui.command.ack"
    wm_state = "wm.state"


SERVER_EVENTS = frozenset({
    EventType.agent_state, EventType.task_progress, EventType.ui_command,
    EventType.run_interrupt, EventType.run_response, EventType.run_completed,
    EventType.run_error,
})
CLIENT_EVENTS = frozenset({EventType.ui_command_ack, EventType.wm_state})


class AgentState(str, Enum):
    """What the avatar should show. The shell's avatar art currently has
    idle/listening/thinking/speaking/error; it should render ``acting`` and
    ``waiting`` as ``thinking`` until dedicated frames exist."""

    idle = "idle"
    listening = "listening"  # set by the shell itself while the mic is open
    thinking = "thinking"
    acting = "acting"
    waiting = "waiting"  # an interrupt is pending (confirm / clarify)
    speaking = "speaking"
    error = "error"


class Source(str, Enum):
    voice = "voice"
    text = "text"
    ui = "ui"


class InterruptKind(str, Enum):
    confirm = "confirm"
    clarify = "clarify"


class UiAction(str, Enum):
    """``ui.command`` actions (agent-langgraph diagram, FIXED VALUES)."""

    open_app = "open_app"
    close_app = "close_app"
    focus = "focus"
    move = "move"
    resize = "resize"
    minimize = "minimize"
    maximize = "maximize"
    restore = "restore"
    snap = "snap"
    set_avatar_position = "set_avatar_position"


class TaskStatus(str, Enum):
    """``task.progress`` status (agent-langgraph diagram, FIXED VALUES)."""

    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"
    skipped = "skipped"


class RunOutcome(str, Enum):
    """``run.completed`` status."""

    ok = "ok"
    failed = "failed"
    cancelled = "cancelled"


AVATAR_POSITIONS = (
    "top_left", "top_center", "top_right", "center",
    "bottom_left", "bottom_center", "bottom_right",
)

# C9 AgentResult.status -> task.progress status. ``needs_input`` is not a
# progress event: the run.interrupt that follows it carries the pause.
RESULT_TASK_STATUS: dict[str, TaskStatus] = {
    "completed": TaskStatus.done,
    "failed": TaskStatus.failed,
    "blocked": TaskStatus.skipped,
}


class WsEnvelope(BaseModel):
    """One WebSocket message (both directions)."""

    model_config = ConfigDict(extra="forbid")

    type: EventType
    session_id: str
    run_id: Optional[str] = None
    ts: str = Field(default_factory=utc_now_iso)
    data: dict[str, Any] = Field(default_factory=dict)

    def wire(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


# Main-graph node -> avatar state while that node runs (diagram "Avatar
# mapping": ingest -> listening, route/plan -> thinking, execute -> acting).
# Nodes not listed keep the current state. Node names are the canonical
# vocabulary in agent/graphs/main_graph.py.
NODE_AGENT_STATE: dict[str, AgentState] = {
    "ingest_build_context": AgentState.listening,
    "choose_route": AgentState.thinking,
    "clarify": AgentState.thinking,
    "supervisor_plan": AgentState.thinking,
    "validate_plan": AgentState.thinking,
    "bounded_replan": AgentState.thinking,
    "fast_direct_task": AgentState.acting,
    "dispatch_ready_tasks": AgentState.acting,
    "synthesize_outcome": AgentState.thinking,
}

# Nodes whose update carries C9 AgentResults -> one task.progress each.
RESULT_NODES = frozenset({"fast_direct_task", "dispatch_ready_tasks"})


def api_error(code: str, message: str, details: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """The one error shape used by REST bodies and ``run.error`` data."""
    return {"error": {"code": code, "message": message, "details": details or {}}}
