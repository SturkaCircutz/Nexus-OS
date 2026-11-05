"""UiCommandBridge: the desktop bridge that reaches the shell over the
session WebSocket.

The trusted gateway is still the only caller (``_execute_native``); this
class only changes *how* an authorized native command reaches the UI:

    gateway -> invoke_native_command -> WS ui.command -> shell applies it
            <- NativeObservation    <- WS ui.command.ack

Outcomes map onto the gateway's existing receipt rules:
- no socket for the session / no UI mapping -> fall back to the wrapped
  bridge (fails closed with TOOL_UNAVAILABLE: provably not started)
- ack ``ok: true``   -> succeeded receipt, observation carries ``wm_state``
- ack ``ok: false``  -> failed receipt (ADAPTER_FAILURE)
- no ack in time     -> ``unknown_outcome`` (the shell may have applied it)
"""

from __future__ import annotations

import asyncio
import contextvars
from typing import Any, Callable, Optional
from uuid import uuid4

from agent.execution.desktop_bridge import DesktopBridge, NativeObservation
from api.events import EventType, UiAction
from api.hub import SessionHub

# Set by RunManager for the duration of one run; LangGraph and asyncio copy
# the context into node tasks, so the gateway call sees the right session.
current_session_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "nexus_current_session_id", default=None
)
current_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "nexus_current_run_id", default=None
)

UiMapping = Callable[[dict[str, Any]], tuple[UiAction, dict[str, Any]]]

# native_command_id (tool registry) -> ui.command. To make another tool
# UI-backed: register it with a native_command_id in agent/tools/registry.py
# and add one line here.
NATIVE_TO_UI: dict[str, UiMapping] = {
    "desktop.open_application": lambda args: (
        UiAction.open_app, {"app_id": args["application_id"]}
    ),
}


class UiCommandRejected(RuntimeError):
    """The shell answered ``ok: false``; the command did not apply."""


class UiCommandBridge:
    def __init__(
        self,
        hub: SessionHub,
        ack_timeout_seconds: float,
        fallback: Optional[Any] = None,
    ) -> None:
        self._hub = hub
        self._ack_timeout = ack_timeout_seconds
        self._fallback = fallback or DesktopBridge(base_url=None)

    async def invoke_native_command(
        self, native_command_id: str, payload: dict[str, Any]
    ) -> NativeObservation:
        session_id = current_session_id.get()
        mapping = NATIVE_TO_UI.get(native_command_id)
        if session_id is None or mapping is None or not self._hub.is_connected(session_id):
            return await self._fallback.invoke_native_command(native_command_id, payload)

        action, data = mapping(payload)
        command_id = f"cmd_{uuid4().hex[:12]}"
        ack = self._hub.expect_ack(command_id)
        try:
            self._hub.publish(
                session_id,
                EventType.ui_command,
                {"command_id": command_id, "action": action.value, **data},
                run_id=current_run_id.get(),
            )
            reply = await asyncio.wait_for(ack, timeout=self._ack_timeout)
        finally:
            self._hub.drop_ack(command_id)

        if not reply.get("ok"):
            raise UiCommandRejected(str(reply.get("error") or "shell rejected the command"))
        return NativeObservation(
            native_command_id=native_command_id,
            payload={
                "transport": "ws",
                "command_id": command_id,
                "action": action.value,
                "wm_state": reply.get("wm_state"),
            },
        )
