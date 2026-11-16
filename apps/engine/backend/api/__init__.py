"""API flow layer: the ``/api/v1`` surface between the shell and the engine.

    shell --REST--> /api/v1/agent/runs ----> RunManager --> CoreEngine (LangGraph)
    shell <==WS==== /api/v1/ws  <--------- SessionHub <-- run events / ui.command
    shell ==WS====> ui.command.ack, wm.state

Full reference: ``docs/AI-Core/07-api-flow.md``.
"""

from api.events import AgentState, EventType, WsEnvelope
from api.hub import SessionHub
from api.routes import ApiRuntime, create_v1_router, install_error_handlers
from api.runs import RunManager
from api.ui_bridge import UiCommandBridge

__all__ = [
    "AgentState",
    "ApiRuntime",
    "EventType",
    "RunManager",
    "SessionHub",
    "UiCommandBridge",
    "WsEnvelope",
    "create_v1_router",
    "install_error_handlers",
]
