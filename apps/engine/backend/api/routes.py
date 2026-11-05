"""``/api/v1`` routes: agent runs (REST) and the session WebSocket.

    POST /api/v1/agent/runs                    start a run          -> 202
    GET  /api/v1/agent/runs/{run_id}           run snapshot
    POST /api/v1/agent/runs/{run_id}/resume    answer an interrupt  -> 202
    POST /api/v1/agent/runs/{run_id}/cancel    stop a run
    GET  /api/v1/tools                         registered tool contracts
    GET  /api/v1/health
    WS   /api/v1/ws?session_id={uuid}          events, ui.command(.ack), wm.state

Errors always use ``{"error": {"code", "message", "details"}}``.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Callable, Optional, Union
from uuid import UUID

from fastapi import APIRouter, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from agent.core import CoreEngine
from api.events import CLIENT_EVENTS, EventType, Source, WsEnvelope, api_error
from api.hub import SessionHub
from api.runs import RunConflict, RunManager, RunNotFound
from api.ui_bridge import UiCommandBridge
from config.engine_settings import EngineSettings, load_settings

PREFIX = "/api/v1"


@dataclass
class ApiRuntime:
    """Everything the v1 surface needs, built once per process."""

    engine: CoreEngine
    hub: SessionHub
    runs: RunManager

    @classmethod
    def build(cls, settings: Optional[EngineSettings] = None) -> "ApiRuntime":
        settings = settings or load_settings()
        hub = SessionHub()
        bridge = UiCommandBridge(hub, ack_timeout_seconds=settings.ui_ack_timeout_seconds)
        engine = CoreEngine(settings, desktop_bridge=bridge)
        return cls(engine=engine, hub=hub, runs=RunManager(engine, hub))

    async def aclose(self) -> None:
        await self.engine.aclose()


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class CreateRunBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    text: str = Field(min_length=1, max_length=4000)
    source: Source = Source.text
    ui_context: Optional[dict[str, Any]] = None


class ResumeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume: Union[bool, str]


def _error(status: int, code: str, message: str,
           details: Optional[dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(status_code=status, content=api_error(code, message, details))


def _is_uuid(value: str) -> bool:
    try:
        UUID(str(value))
    except (ValueError, TypeError):
        return False
    return True


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def create_v1_router(get_runtime: Callable[[], ApiRuntime]) -> APIRouter:
    router = APIRouter(prefix=PREFIX)

    @router.get("/health")
    async def health() -> dict[str, Any]:
        runtime = get_runtime()
        return {"status": "ok", "service": "nexus-engine", "api_version": "v1",
                "model_provider": runtime.engine.settings.model_provider}

    @router.post("/agent/runs", status_code=202)
    async def create_run(body: CreateRunBody):
        if not _is_uuid(body.session_id):
            return _error(400, "INVALID_INPUT", "session_id must be a UUID")
        try:
            record = get_runtime().runs.start(
                body.text, body.session_id, body.source, body.ui_context
            )
        except (ValidationError, ValueError) as error:
            return _error(400, "INVALID_INPUT", str(error))
        return {"run_id": record.run_id, "session_id": record.session_id,
                "status": record.status}

    @router.get("/agent/runs/{run_id}")
    async def get_run(run_id: str):
        try:
            return get_runtime().runs.get(run_id).view()
        except RunNotFound:
            return _error(404, "NOT_FOUND", f"run {run_id} does not exist")

    @router.post("/agent/runs/{run_id}/resume", status_code=202)
    async def resume_run(run_id: str, body: ResumeBody):
        try:
            return get_runtime().runs.resume(run_id, body.resume).view()
        except RunNotFound:
            return _error(404, "NOT_FOUND", f"run {run_id} does not exist")
        except RunConflict as error:
            return _error(409, "CONFLICT", str(error))
        except (ValidationError, ValueError) as error:
            return _error(400, "INVALID_INPUT", str(error))

    @router.post("/agent/runs/{run_id}/cancel")
    async def cancel_run(run_id: str):
        try:
            return (await get_runtime().runs.cancel(run_id)).view()
        except RunNotFound:
            return _error(404, "NOT_FOUND", f"run {run_id} does not exist")
        except RunConflict as error:
            return _error(409, "CONFLICT", str(error))

    @router.get("/tools")
    async def list_tools() -> dict[str, Any]:
        entries = get_runtime().engine.registry.all_entries()
        return {"tools": [
            {
                "tool_id": entry.tool_id,
                "version": entry.version,
                "capability_group": entry.capability_group,
                "description": entry.description,
                "risk": entry.risk.value,
                "side_effect": entry.side_effect,
                "native": entry.native,
                "availability": entry.availability,
                "input_schema": entry.input_model.model_json_schema(),
            }
            for entry in entries
        ]}

    @router.websocket("/ws")
    async def session_socket(websocket: WebSocket, session_id: str = "") -> None:
        if not _is_uuid(session_id):
            await websocket.close(code=1008, reason="session_id must be a UUID")
            return
        runtime = get_runtime()
        await websocket.accept()
        queue = runtime.hub.subscribe(session_id)
        pump = asyncio.create_task(_pump(websocket, queue))
        try:
            while True:
                raw = await websocket.receive_text()
                reply = _handle_client_message(runtime.hub, session_id, raw)
                if reply is not None:
                    queue.put_nowait(reply)  # only this socket sees its own errors
        except WebSocketDisconnect:
            pass
        finally:
            runtime.hub.unsubscribe(session_id, queue)
            pump.cancel()

    return router


async def _pump(websocket: WebSocket, queue: "asyncio.Queue[dict[str, Any]]") -> None:
    while True:
        message = await queue.get()
        await websocket.send_json(message)


def _handle_client_message(hub: SessionHub, session_id: str, raw: str) -> Optional[dict[str, Any]]:
    """Apply one client -> server message. Returns an error envelope for
    this socket when the message is rejected, else None."""
    run_id = None
    try:
        message = WsEnvelope.model_validate(json.loads(raw))
        run_id = message.run_id
        if message.type not in CLIENT_EVENTS:
            raise ValueError(f"clients may only send {sorted(e.value for e in CLIENT_EVENTS)}")
        if message.session_id != session_id:
            raise ValueError("session_id does not match this socket")
        if message.type == EventType.wm_state:
            hub.set_wm_state(session_id, message.data)
        elif message.type == EventType.ui_command_ack:
            command_id = message.data.get("command_id")
            if not command_id or not hub.resolve_ack(str(command_id), message.data):
                raise ValueError(f"no pending ui.command with command_id {command_id!r}")
    except (ValueError, ValidationError) as error:  # JSONDecodeError is a ValueError
        return WsEnvelope(type=EventType.run_error, session_id=session_id, run_id=run_id,
                          data=api_error("INVALID_INPUT", str(error))).wire()
    return None


def install_error_handlers(app: FastAPI) -> None:
    """Give ``/api/v1`` body-validation failures the shared error shape;
    legacy routes keep FastAPI's default 422."""

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        if request.url.path.startswith(PREFIX):
            return _error(400, "INVALID_INPUT", "request body failed validation",
                          {"errors": jsonable_encoder(exc.errors())})
        return await request_validation_exception_handler(request, exc)
