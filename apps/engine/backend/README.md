# Engine (Python FastAPI AI Brain)

## Purpose
Headless agent intelligence sidecar implementing the AI-Core architecture
(`docs/AI-Core/`). Contracts C1–C9 are enforced end to end: a request is a C1
envelope, work is a bounded C3 packet, agents only *propose* C4 tool calls, a
human or policy decision (C5) authorizes exact work, and only the trusted
execution gateway may act — recording a C7 receipt for every outcome,
including `unknown_outcome`. Memory proposals (C8) are validated before they
become durable; answers carry evidence refs (C9).

The system is deterministic-first: everything runs and tests without a model
provider (`NEXUS_MODEL_PROVIDER=none` is the default). When a provider is
configured, the model only raises validated data *offers*
(`agent/providers/structured.py`); any rejection or outage falls back to
deterministic behavior with a typed `MODEL_UNAVAILABLE` note.

## Phase status

- **Phase 0–2** (done, 39 tests): contracts C1–C9, storage + repositories,
  registry/policy/gateway/adapters, worker subgraph, main graph (12 canonical
  nodes), memory service, FastAPI surface.
- **Phase 3** (done, +11 tests in `tests/systems/test_supervision.py`):
  supervision and initial agent subgraphs —
  - research requests decompose into bounded C3 packets **with
    dependencies** encoded as `task:<task_id>` refs in `input_refs`;
    `validate_plan`/`evaluate_progress` gate dispatch until each dependency
    has a successful terminal record.
  - parallel dispatch: `dispatch_ready_tasks` fans packets out with
    `asyncio.gather` under `NEXUS_MAX_PARALLEL_TASKS` (default 3); results
    merge exclusively through the C2 `_append_lists` reducers.
  - bounded replans: failures/blocked work with remaining budget replan the
    unfinished branch; ids/keys are revision-scoped
    (`supervised:{request_id}:{step}:r{revision}`); `NEXUS_MAX_REPLANS`
    bounds revisions (default 2) and every replan is audited
    (`task_replanned`).
  - trace B: a report packet (knowledge agent, `document_create`,
    reversible_write) builds its material from the `task_completed` audit
    trail of its dependency tasks only (doc rule 12), stays approval-bound,
    and resumes through the same proposal fingerprint.
  - Discovery agent: read-only evidence gathering — `document_read` when a
    registered `artifact:` ref is in scope, else `memory_lookup`; cited
    provenance in C9; explicit uncertainty when the corpus is empty; it
    cannot resolve native adapter targets even if a packet claims them.
  - model seam: `agent/providers/` (`ModelClient.complete_json`, Ollama
    local-first, OpenAI-compatible opt-in, `ScriptedModel` for tests). Two
    validated touchpoints only: supervisor query planning
    (`DiscoveryQueryPlan`, ≤3) and final synthesis (`SynthesisOffer`,
    evidence refs must be a subset of collected evidence).
- **API flow** (+15 tests in `tests/systems/test_api_flow.py`): `/api/v1`
  runs streamed over a per-session WebSocket, confirm/clarify interrupts that
  resume the same run, cancel, and `ui.command`/`ui.command.ack` as the live
  desktop bridge transport. See `docs/AI-Core/07-api-flow.md`.
- **Phase 4/5** (later): memory consolidation loops and crash/restart tests.

## Tech Stack
- Python 3.11+, FastAPI, Pydantic v2, Uvicorn, SQLAlchemy 2
- LangGraph 0.2 + `langgraph-checkpoint-sqlite` (AsyncSqliteSaver) for
  recoverable orchestration state
- SQLite (`modules/storage/schema.sql`) as the canonical system of record

## Folder Layout
```
apps/engine/backend/
├── main.py                  # FastAPI entry point (legacy + AI-Core + /api/v1)
├── api/                     # API flow: /api/v1 runs, session WebSocket, ui.command bridge
│   ├── events.py            #   wire vocabulary (event types, agent states, envelope)
│   ├── hub.py               #   per-session sockets, wm.state, pending ui.command acks
│   ├── runs.py              #   RunManager: background runs, interrupts, resume, cancel
│   ├── ui_bridge.py         #   DesktopBridge over WS: ui.command -> ui.command.ack
│   └── routes.py            #   /api/v1 router + error shape
├── requirements.txt
├── config/engine_settings.py  # engine knobs (env-driven, safe local defaults)
├── schemas/contracts.py     # canonical contracts C1–C9 (source: docs/AI-Core/02)
├── database/
│   ├── session.py           # applies modules/storage/schema.sql to SQLite
│   └── repositories.py      # typed access to canonical records
├── agent/
│   ├── core.py              # CoreEngine facade: handle_request / resume_after_decision
│   ├── loop.py              # legacy ReAct loop (kept for the old sidecar contract)
│   ├── agents/              # supervisor / knowledge / desktop / discovery (one file each)
│   ├── execution/           # trusted core: policy, gateway, adapters, desktop bridge
│   ├── graphs/              # main_graph (canonical 12 nodes), worker_graph, recipes
│   ├── memory/service.py    # scoped retrieval + C8 validation
│   ├── tools/registry.py    # 6 registered tools + typed input schemas
│   ├── memory/buffer.py     # legacy short-term buffer stub
│   └── providers/            # model seam: Ollama / OpenAI-compat / scripted (offers only)
└── README.md
```

Shared SQLite DDL lives in `modules/storage/schema.sql` (sessions, requests,
tasks, proposals, approvals, executions, receipts, memory/artifact records,
`audit_events`). Applying it is idempotent at engine startup.

## How to Run
```powershell
cd apps/engine/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

## How to Test
```powershell
cd apps/engine/backend
.\.venv\Scripts\python.exe -m pytest ..\..\..\tests\systems -q
```
`tests/systems/conftest.py` puts the backend on `sys.path` and isolates every
test with its own database/artifacts/checkpoints under `tmp_path`.

## IPC / API Contracts
Legacy (pre-AI-Core, still consumed by the existing Tauri sidecar):
- `GET /health`
- `POST /desktop/state`
- `POST /agent/invoke`

AI-Core surface:
- `POST /agent/requests` — accepts a C1 `RequestEnvelope` payload
  (`user_input` required; `request_id`/`session_id`/`submitted_at` generated
  at the boundary when omitted). Runs the main graph and returns the typed
  result: status, route, response text + evidence refs, task/receipt/proposal
  refs, errors, and any `pending_approval`.
- `POST /agent/approvals/{approval_id}/decision` — body
  `{"decision": "approved"|"rejected", "session_id": "..."}`. Applies the
  decision (session-proof, pending-only) and, when approved, resumes the
  bounded work through the same proposal fingerprint.

API flow surface (`/api/v1`, full reference in `docs/AI-Core/07-api-flow.md`):
- `POST /api/v1/agent/runs` -> `202 {run_id}`; progress streams over the socket
- `GET /api/v1/agent/runs/{run_id}`, `POST .../resume`, `POST .../cancel`
- `GET /api/v1/tools`, `GET /api/v1/health`
- `WS /api/v1/ws?session_id={uuid}`: `agent.state`, `task.progress`,
  `ui.command`, `run.interrupt`, `run.response`, `run.completed`, `run.error`
  out; `ui.command.ack`, `wm.state` in. Approved native tools reach the shell
  as `ui.command` (no ack in `NEXUS_UI_ACK_TIMEOUT_MS` -> `unknown_outcome`).

Consumed by `src-tauri` sidecar via local HTTP on port 8000.

## Trust Model (short form)
- Agents propose; the trusted gateway (`agent/execution/gateway.py`) is the
  sole authority path to a tool (Python adapter or typed `modules/ipc`
  request into Rust — `desktop_bridge.py` fails closed until that transport
  exists).
- Approval (C5) is bound to the proposal fingerprint (tool, version, args,
  targets, scope). Any material change produces a new proposal and a new
  approval.
- Idempotency: the same idempotency key returns the prior receipt verbatim;
  a started without receipt becomes `unknown_outcome`, never a re-run.
- Every node/decision leaves an `audit_events` row linked to its request
  (`request_received` … `receipt_recorded` … `request_completed`).

## How to Add a Feature
1. New tool → add a typed entry + input model in `agent/tools/registry.py`
   and a deterministic adapter in `agent/execution/adapters.py` (risk class,
   side-effect flag, targets, idempotency policy are registry data).
2. New capability group → extend the recipe/agent that proposes it; never
   grant execution outside the gateway.
3. New schema field → `schemas/contracts.py` (front-compatible fields belong
   in `extensions`; unknown fields are rejected at authority boundaries).
4. Register storage tables in `modules/storage/schema.sql`.
