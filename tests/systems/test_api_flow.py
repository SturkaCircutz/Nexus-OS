"""API flow tests: /api/v1 runs + the session WebSocket (docs/AI-Core/07).

Drives the real engine through FastAPI's TestClient. Each test owns its
database/checkpoints (tmp_path) and its own runtime.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api import ApiRuntime, create_v1_router, install_error_handlers
from config.engine_settings import EngineSettings

SESSION = "22222222-2222-2222-2222-222222222222"
ENVELOPE_KEYS = {"type", "session_id", "run_id", "ts", "data"}


@pytest.fixture()
def runtime(tmp_path):
    rt = ApiRuntime.build(EngineSettings.for_test(tmp_path, ui_ack_timeout_seconds=0.5))
    try:
        yield rt
    finally:
        rt.engine.close()


@pytest.fixture()
def client(runtime):
    app = FastAPI()
    app.include_router(create_v1_router(lambda: runtime))
    install_error_handlers(app)
    with TestClient(app) as test_client:
        yield test_client


def _socket(client: TestClient, session_id: str = SESSION):
    return client.websocket_connect(f"/api/v1/ws?session_id={session_id}")


def _start(client: TestClient, text: str, session_id: str = SESSION, **extra: Any) -> str:
    response = client.post("/api/v1/agent/runs",
                           json={"session_id": session_id, "text": text, **extra})
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["status"] == "received"
    return body["run_id"]


def _until(ws, done: Callable[[dict[str, Any]], bool], limit: int = 60) -> list[dict[str, Any]]:
    events = []
    for _ in range(limit):
        message = ws.receive_json()
        assert set(message) == ENVELOPE_KEYS, message
        events.append(message)
        if done(message):
            return events
    raise AssertionError(f"condition not met; got {[e['type'] for e in events]}")


def _is(event_type: str) -> Callable[[dict[str, Any]], bool]:
    return lambda message: message["type"] == event_type


def _poll(client: TestClient, run_id: str, statuses: set[str], seconds: float = 10) -> dict:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        view = client.get(f"/api/v1/agent/runs/{run_id}").json()
        if view["status"] in statuses:
            return view
        time.sleep(0.02)
    raise AssertionError(f"run {run_id} never reached {statuses}: {view}")


def _receipt_statuses(runtime: ApiRuntime, request_id: str) -> list[dict]:
    rows = runtime.engine.repos.audit.list_for_request(request_id)
    return [json.loads(row["detail"]) for row in rows if row["event_type"] == "receipt_recorded"]


def _observations(runtime: ApiRuntime, request_id: str) -> list[dict]:
    rows = runtime.engine.repos.audit.list_for_request(request_id)
    return [json.loads(row["detail"]) for row in rows if row["event_type"] == "execution_observed"]


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_fast_run_streams_full_lifecycle(client):
    with _socket(client) as ws:
        run_id = _start(client, "run system diagnostics", source="voice")
        events = _until(ws, _is("run.completed"))

    assert {event["run_id"] for event in events} == {run_id}
    assert {event["session_id"] for event in events} == {SESSION}
    types = [event["type"] for event in events]
    assert types[0] == "agent.state" and events[0]["data"] == {"state": "listening"}
    states = [e["data"]["state"] for e in events if e["type"] == "agent.state"]
    assert states[:2] == ["listening", "thinking"]
    assert "acting" in states and states[-2:] == ["speaking", "idle"]
    progress = [e["data"] for e in events if e["type"] == "task.progress"]
    assert progress and progress[0]["status"] == "done"
    assert set(progress[0]) == {"task_id", "tool_id", "status"}
    assert progress[0]["tool_id"] == "system_diagnostics"
    response = next(e["data"] for e in events if e["type"] == "run.response")
    assert set(response) == {"speech", "widgets"} and response["widgets"] == []
    assert "diagnostics" in response["speech"].lower()
    assert types.index("run.response") < types.index("run.completed")
    assert events[-1]["data"] == {"status": "ok"}

    view = client.get(f"/api/v1/agent/runs/{run_id}").json()
    assert view["status"] == "completed" and view["source"] == "voice"
    assert view["route"] == "fast_direct"
    assert view["request_ids"] == [run_id] and view["interrupt"] is None


def test_clarify_pauses_then_continues_the_same_run(client, runtime):
    with _socket(client) as ws:
        run_id = _start(client, "open time machine")
        events = _until(ws, _is("run.interrupt"))
        interrupt = events[-1]["data"]
        assert interrupt["kind"] == "clarify"
        assert "Which application" in interrupt["message"]
        assert set(interrupt) == {"kind", "message", "options"}
        assert events[-2]["data"] == {"state": "waiting"}
        assert client.get(f"/api/v1/agent/runs/{run_id}").json()["status"] == "awaiting_input"

        resumed = client.post(f"/api/v1/agent/runs/{run_id}/resume",
                              json={"resume": "run system diagnostics"})
        assert resumed.status_code == 202 and resumed.json()["status"] == "running"
        events = _until(ws, _is("run.completed"))

    assert {event["run_id"] for event in events} == {run_id}
    assert events[-1]["data"] == {"status": "ok"}
    view = client.get(f"/api/v1/agent/runs/{run_id}").json()
    assert len(view["request_ids"]) == 2
    child = runtime.engine.envelope_for(view["request_ids"][1])
    assert child.parent_request_id == run_id


def test_confirm_then_ui_command_round_trip(client, runtime):
    with _socket(client) as ws:
        run_id = _start(client, "open browser")
        events = _until(ws, _is("run.interrupt"))
        interrupt = events[-1]["data"]
        assert interrupt["kind"] == "confirm" and interrupt["options"] == ["yes", "no"]
        assert set(interrupt) == {"kind", "message", "options"}

        client.post(f"/api/v1/agent/runs/{run_id}/resume", json={"resume": "yes"})
        events = _until(ws, _is("ui.command"))
        command = events[-1]
        assert command["run_id"] == run_id
        assert set(command["data"]) == {"command_id", "action", "app_id", "data"}
        assert command["data"]["action"] == "open_app"
        assert command["data"]["app_id"] == "browser"
        assert command["data"]["data"] == {}

        ws.send_json({
            "type": "ui.command.ack", "session_id": SESSION, "run_id": run_id,
            "data": {"command_id": command["data"]["command_id"], "ok": True,
                     "wm_state": {"focused_app_id": "browser"}},
        })
        events = _until(ws, _is("run.completed"))

    assert events[-1]["data"] == {"status": "ok"}
    receipts = _receipt_statuses(runtime, run_id)
    assert receipts and receipts[-1]["receipt_status"] == "succeeded"
    observed = [o for o in _observations(runtime, run_id) if o.get("output")]
    assert observed[-1]["output"]["observation"]["transport"] == "ws"
    assert observed[-1]["output"]["observation"]["wm_state"] == {"focused_app_id": "browser"}


# ---------------------------------------------------------------------------
# Failure semantics (gateway receipt rules)
# ---------------------------------------------------------------------------


def _approve_open_browser(client, ws) -> tuple[str, dict]:
    run_id = _start(client, "open browser")
    _until(ws, _is("run.interrupt"))
    client.post(f"/api/v1/agent/runs/{run_id}/resume", json={"resume": True})
    command = _until(ws, _is("ui.command"))[-1]
    return run_id, command


def test_missing_ack_is_unknown_outcome(client, runtime):
    with _socket(client) as ws:
        run_id, _command = _approve_open_browser(client, ws)
        _until(ws, _is("run.completed"))  # 0.5 s ack timeout elapses
    receipt = _receipt_statuses(runtime, run_id)[-1]
    assert receipt["receipt_status"] == "unknown_outcome"
    assert receipt["error_code"] == "UNKNOWN_OUTCOME"


def test_rejected_ack_is_a_failed_receipt(client, runtime):
    with _socket(client) as ws:
        run_id, command = _approve_open_browser(client, ws)
        ws.send_json({"type": "ui.command.ack", "session_id": SESSION, "run_id": run_id,
                      "data": {"command_id": command["data"]["command_id"], "ok": False,
                               "error": "app not installed"}})
        _until(ws, _is("run.completed"))
    receipt = _receipt_statuses(runtime, run_id)[-1]
    assert receipt["receipt_status"] == "failed"
    assert receipt["error_code"] == "ADAPTER_FAILURE"


def test_without_a_socket_native_work_fails_closed(client, runtime):
    run_id = _start(client, "open browser")
    _poll(client, run_id, {"awaiting_input"})
    client.post(f"/api/v1/agent/runs/{run_id}/resume", json={"resume": "yes"})
    _poll(client, run_id, {"completed", "failed"})
    receipt = _receipt_statuses(runtime, run_id)[-1]
    assert receipt["receipt_status"] == "failed"
    assert receipt["error_code"] == "TOOL_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Cancel / validation / conflicts
# ---------------------------------------------------------------------------


def test_cancel_while_waiting_rejects_the_approval(client, runtime):
    with _socket(client) as ws:
        run_id = _start(client, "open browser")
        _until(ws, _is("run.interrupt"))
        approval_id = runtime.runs.get(run_id).approval_id
        assert approval_id
        cancelled = client.post(f"/api/v1/agent/runs/{run_id}/cancel")
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
        events = _until(ws, _is("run.completed"))
    assert events[-1]["data"] == {"status": "cancelled"}
    assert runtime.engine.repos.approvals.get(approval_id)["status"] == "rejected"
    assert runtime.engine.repos.requests.get(run_id)["status"] == "cancelled"

    again = client.post(f"/api/v1/agent/runs/{run_id}/cancel")
    assert again.status_code == 409 and again.json()["error"]["code"] == "CONFLICT"
    resume = client.post(f"/api/v1/agent/runs/{run_id}/resume", json={"resume": "yes"})
    assert resume.status_code == 409


def test_rest_errors_share_one_shape(client):
    bad_session = client.post("/api/v1/agent/runs", json={"session_id": "nope", "text": "hi"})
    assert bad_session.status_code == 400
    assert bad_session.json()["error"]["code"] == "INVALID_INPUT"

    missing_text = client.post("/api/v1/agent/runs", json={"session_id": SESSION})
    assert missing_text.status_code == 400
    body = missing_text.json()["error"]
    assert body["code"] == "INVALID_INPUT" and body["details"]["errors"]

    unknown_field = client.post("/api/v1/agent/runs",
                                json={"session_id": SESSION, "text": "hi", "sessionId": "x"})
    assert unknown_field.status_code == 400

    missing = client.get(f"/api/v1/agent/runs/{uuid.uuid4()}")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "NOT_FOUND"


def test_confirm_answer_must_be_yes_or_no(client):
    with _socket(client) as ws:
        run_id = _start(client, "open browser")
        _until(ws, _is("run.interrupt"))
    response = client.post(f"/api/v1/agent/runs/{run_id}/resume", json={"resume": "maybe"})
    assert response.status_code == 400
    assert client.get(f"/api/v1/agent/runs/{run_id}").json()["status"] == "awaiting_input"


# ---------------------------------------------------------------------------
# WebSocket client -> server messages
# ---------------------------------------------------------------------------


def _ping_error(ws) -> dict:
    """Send a deliberately bad message and wait for its error: everything
    sent before it on this socket has been applied by then."""
    ws.send_text("not json")
    return _until(ws, _is("run.error"))[-1]


def test_wm_state_becomes_the_request_ui_context(client, runtime):
    with _socket(client) as ws:
        ws.send_json({"type": "wm.state", "session_id": SESSION, "run_id": None,
                      "data": {"apps": [{"app_id": "notes"}], "focused_app_id": "notes"}})
        _ping_error(ws)
        run_id = _start(client, "run system diagnostics")
        _until(ws, _is("run.completed"))
    envelope = runtime.engine.envelope_for(run_id)
    assert envelope.ui_context.active_surface == "notes"


def test_socket_rejects_bad_client_messages(client):
    with _socket(client) as ws:
        assert _ping_error(ws)["data"]["error"]["code"] == "INVALID_INPUT"

        ws.send_json({"type": "run.response", "session_id": SESSION, "data": {}})
        assert "clients may only send" in _until(ws, _is("run.error"))[-1]["data"]["error"]["message"]

        other = str(uuid.uuid4())
        ws.send_json({"type": "wm.state", "session_id": other, "data": {}})
        assert "does not match" in _until(ws, _is("run.error"))[-1]["data"]["error"]["message"]

        ws.send_json({"type": "ui.command.ack", "session_id": SESSION,
                      "data": {"command_id": "cmd_unknown", "ok": True}})
        assert "no pending ui.command" in _until(ws, _is("run.error"))[-1]["data"]["error"]["message"]


def test_socket_requires_a_uuid_session(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/v1/ws?session_id=abc") as ws:
            ws.receive_json()


def test_events_stay_inside_their_session(client):
    other = str(uuid.uuid4())
    with _socket(client, other) as other_ws, _socket(client) as ws:
        _start(client, "run system diagnostics")
        _until(ws, _is("run.completed"))
        other_ws.send_text("not json")  # the only thing this socket should see
        assert other_ws.receive_json()["type"] == "run.error"


def test_tools_endpoint_lists_registry_contracts(client):
    tools = {tool["tool_id"]: tool for tool in client.get("/api/v1/tools").json()["tools"]}
    assert tools["open_application"]["native"] is True
    assert tools["open_application"]["input_schema"]["required"] == ["application_id"]
    assert tools["system_diagnostics"]["risk"] == "read_only"
    assert client.get("/api/v1/health").json()["api_version"] == "v1"


def test_cancel_stops_a_running_run(client, runtime, monkeypatch):
    import asyncio

    async def slow_request(envelope, on_graph_event=None):
        await asyncio.sleep(30)

    monkeypatch.setattr(runtime.engine, "handle_request", slow_request)
    with _socket(client) as ws:
        run_id = _start(client, "run system diagnostics")
        _poll(client, run_id, {"running"})
        cancelled = client.post(f"/api/v1/agent/runs/{run_id}/cancel")
        assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
        events = _until(ws, _is("run.completed"))
    assert events[-1]["data"] == {"status": "cancelled"}
    assert client.get(f"/api/v1/agent/runs/{run_id}").json()["agent_state"] == "idle"
