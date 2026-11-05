"""SessionHub: per-session WebSocket fan-out plus the little state the
engine needs from the shell (latest ``wm.state``, pending ``ui.command``
acks).

One hub per process. Everything runs on the server's event loop, so plain
dicts are enough - no locks.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from api.events import EventType, WsEnvelope


class SessionHub:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._wm_state: dict[str, dict[str, Any]] = {}
        self._acks: dict[str, asyncio.Future[dict[str, Any]]] = {}

    # ------------------------------------------------------------------
    # Subscribers (one queue per open socket)
    # ------------------------------------------------------------------

    def subscribe(self, session_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers.setdefault(session_id, set()).add(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        queues = self._subscribers.get(session_id)
        if not queues:
            return
        queues.discard(queue)
        if not queues:
            del self._subscribers[session_id]

    def is_connected(self, session_id: str) -> bool:
        return bool(self._subscribers.get(session_id))

    def publish(
        self,
        session_id: str,
        event_type: EventType,
        data: dict[str, Any],
        run_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Send one envelope to every socket of the session. Events for a
        session with no open socket are dropped; ``GET /agent/runs/{id}``
        is the catch-up path."""
        message = WsEnvelope(type=event_type, session_id=session_id,
                             run_id=run_id, data=data).wire()
        for queue in self._subscribers.get(session_id, ()):
            queue.put_nowait(message)
        return message

    # ------------------------------------------------------------------
    # wm.state (client -> server)
    # ------------------------------------------------------------------

    def set_wm_state(self, session_id: str, state: dict[str, Any]) -> None:
        self._wm_state[session_id] = state

    def wm_state(self, session_id: str) -> Optional[dict[str, Any]]:
        return self._wm_state.get(session_id)

    # ------------------------------------------------------------------
    # ui.command.ack (client -> server)
    # ------------------------------------------------------------------

    def expect_ack(self, command_id: str) -> asyncio.Future[dict[str, Any]]:
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._acks[command_id] = future
        return future

    def resolve_ack(self, command_id: str, data: dict[str, Any]) -> bool:
        """Return False for an unknown or already-answered command id."""
        future = self._acks.get(command_id)
        if future is None or future.done():
            return False
        future.set_result(data)
        return True

    def drop_ack(self, command_id: str) -> None:
        self._acks.pop(command_id, None)
