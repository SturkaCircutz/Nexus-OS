"""NEXUS OS Agent Engine - FastAPI entry point.

Legacy endpoints (``/health``, ``/desktop/state``, ``/agent/invoke``) keep the
pre-AI-Core contract working for the Tauri sidecar. The AI-Core surface is:

- ``POST /agent/requests``   - validate a C1 RequestEnvelope, run the main graph
- ``POST /agent/approvals/{approval_id}/decision`` - decide a pending C5 and
  resume the bounded work it was blocking

The API-flow surface (``/api/v1``: runs, WebSocket events, ui.command) is
mounted from ``api/`` - see docs/AI-Core/07-api-flow.md. All three surfaces
share one engine instance.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from agent.core import CoreEngine, CoreRequestResult
from api import ApiRuntime, create_v1_router, install_error_handlers
from schemas.contracts import RequestEnvelope

app = FastAPI(title="NEXUS OS Agent Brain", version="0.3.0")

runtime: ApiRuntime | None = None
_react_loop = None


def _legacy_loop():
    """Legacy ReAct loop, imported lazily: ``agent/loop.py`` still imports the
    removed ``OllamaProvider`` (renamed in ec39430), and importing it at
    module load stopped the whole server from starting."""
    global _react_loop
    if _react_loop is None:
        try:
            from agent.loop import ReActLoop
        except ImportError as error:
            raise HTTPException(status_code=503,
                                detail=f"legacy ReAct loop unavailable: {error}") from error
        _react_loop = ReActLoop()
    return _react_loop


def _runtime() -> ApiRuntime:
    global runtime
    if runtime is None:
        runtime = ApiRuntime.build()
    return runtime


def _core() -> CoreEngine:
    return _runtime().engine


app.include_router(create_v1_router(_runtime))
install_error_handlers(app)


@app.on_event("shutdown")
async def shutdown_engine() -> None:
    global runtime
    if runtime is not None:
        await runtime.aclose()
        runtime = None


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "nexus-engine"}


# ---------------------------------------------------------------------------
# Legacy surface (pre-AI-Core, used by the existing Tauri sidecar flow)
# ---------------------------------------------------------------------------


@app.post("/desktop/state")
async def get_desktop_state() -> dict:
    return await _legacy_loop().get_desktop_state()


@app.post("/agent/invoke")
async def agent_invoke(payload: dict) -> dict:
    intent = payload.get("intent", "")
    return await _legacy_loop().run(intent)


# ---------------------------------------------------------------------------
# AI-Core surface (contracts C1 and C5 decisions)
# ---------------------------------------------------------------------------


@app.post("/agent/requests")
async def agent_requests(payload: Any) -> dict:
    """Validate C1 at the Python boundary, persist it, run the main graph."""
    try:
        envelope = RequestEnvelope.from_raw(payload)
    except (ValidationError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    result = await _core().handle_request(envelope)
    return result.as_dict()


@app.post("/agent/approvals/{approval_id}/decision")
async def approval_decision(approval_id: str, payload: Any) -> dict:
    """Apply a session-verified decision to a pending C5 and resume work."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be a JSON object")
    decision = payload.get("decision", "")
    session_id = payload.get("session_id", "")
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be approved or rejected")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    try:
        result = await _core().resume_after_decision(approval_id, decision, session_id)
    except Exception as error:  # engine failure stays an operator-safe 500
        raise HTTPException(status_code=500, detail=f"engine failure: {error}") from error
    return result.as_dict()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
