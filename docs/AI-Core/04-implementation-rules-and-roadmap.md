# 04 - Implementation rules and roadmap

> **Status key:** the trust, local-first, typed-contract, persistence, and deterministic-first principles are **Established**. The implementation order and repository map are **Proposed**.

## Non-negotiable rules

1. **Agents propose; trusted code authorizes.** No agent, model response, tool description, or retrieved document can execute a native side effect directly.
2. **Deterministic first.** Resolve IDs, schemas, targets, permissions, risk, receipts, and retries in deterministic code. Use a model only where reasoning or language interpretation helps.
3. **One gateway for side effects.** A new adapter is useless until it is reachable only through the trusted execution gateway.
4. **Approve exact work.** Bind approval to tool version, arguments, target references, scope, session, and expiry. Any material change means a new proposal.
5. **Receipt before claim.** A response may say an external action completed only when a C7 receipt says so.
6. **Checkpoint before uncertainty.** Persist before dispatch, while awaiting approval, after an execution result, and before final synthesis.
7. **State stays small and serializable.** Put artifacts, secrets, and large text behind references; validate every state update.
8. **Memory writes are proposals.** Require provenance, value, sensitivity review, duplicate/conflict handling, and retention policy.
9. **No policy in prompts.** Prompts can explain policy but the executable policy is typed Python backend code/data.
10. **One canonical vocabulary.** Do not rename a graph node, status, tool, or memory tier in code without updating [05 - Reference glossary](05-reference-glossary.md).
11. **Local-first by default.** A basic installation works with local persistence and a configurable model provider; hosted services are opt-in adapters.
12. **Audit enough to recover.** Record request, proposal, policy decision, approval outcome, execution request, receipt, and checkpoint links with safe diagnostics.

## Repository map aligned to the current NEXUS OS tree

The current repository is `nexus-os`. Python/FastAPI owns agentic backend authority, while `src-tauri` is the native desktop core: it starts the sidecar, observes/manipulates Win32 through narrow typed commands, and does not own agent planning, policy, memory, or persistence decisions. New LangGraph folders extend the existing Python `agent/` package rather than creating a second backend.

~~~
nexus-os/
  apps/
    shell/
      frontend/
        src/
          shell/                # Desktop, WidgetGrid, prompt, taskbar
          wm/                   # Desktop store and snap-grid layout
          apps/                 # Internal-app registry
          ui/ theme/ hooks/     # Shared UI primitives, tokens, useIPC/useGesture
          internal-apps/        # Per-app frontend + local app backend
          vision/               # MediaPipe landmark/gesture detection
          types/                # Frontend WindowState and IPC types
    engine/
      backend/
        agent/
          graphs/               # Proposed: main_graph.py, worker_graph.py
          agents/               # Proposed: supervisor.py, desktop.py, discovery.py, knowledge.py
          workers/              # Proposed bounded worker helpers
          tools/                # Existing tool home; add registry.py and typed tool modules here
          memory/               # Existing short-term buffers; extend to M0-M5
          providers/            # Ollama/OpenAI/Anthropic adapters
          execution/            # Proposed: policy.py, gateway.py, desktop_bridge.py
          loop.py               # Existing ReAct loop; migrate/bridge incrementally
        schemas/                # Pydantic input/output schemas
        database/               # SQLite sessions, repositories, checkpoint metadata
        main.py                 # FastAPI entry point
  src-tauri/
    src/
      win32/                    # Window enumeration, hooks, geometry primitives
      commands/                 # Tauri commands exposed through modules/ipc
      sidecar.rs                # FastAPI lifecycle management
      state.rs                  # Cached desktop topology
      main.rs                   # Native desktop entry point
  modules/
    ipc/                        # Typed JSON-RPC: shell <-> Tauri <-> engine
    window-state/               # Shared WindowState abstraction
    storage/                    # SQLite schema and migrations
    vision/                     # Gesture pipeline
    config/                     # Environment and feature flags
  tests/
    bench/ systems/ vision/     # Add graph/tool cases under systems/
  scripts/ docs/
~~~

**Ownership rule:** the React shell imports IPC/window-state contracts, never engine internals. The Python engine owns planning, policy, memory, and persistence. Rust owns only native desktop observation/execution behind `modules/ipc`; it must reject malformed commands and never infer user intent or grant approval.

## Build in dependency order

### Phase 0 - Contracts and durable skeleton

Build: Pydantic C1-C9 schemas under `apps/engine/backend/schemas`, shared IPC/`WindowState` contracts under `modules`, SQLite migrations in `modules/storage`, repositories in `apps/engine/backend/database`, and basic audit events.

Done when:

- A React request can become a persisted request with a stable ID.
- Contracts reject malformed/unknown authority fields.
- A checkpoint reference can be stored and retrieved.
- Contract and migration tests pass without a model provider.

### Phase 1 - Trusted execution core

Build: Python tool registry/policy/gateway under `apps/engine/backend/agent`, typed `modules/ipc` desktop bridge, Tauri commands/Win32 primitives, execution receipts, `system_diagnostics`, and `file_search`.

Done when:

- Unregistered tools and mismatched proposals are rejected.
- Approval expires and invalidates on argument or target changes.
- A gateway execution is idempotent and produces a C7 receipt.
- A crash after adapter invocation can be reconciled by idempotency key.

### Phase 2 - Direct path and main graph

Build: `ingest_build_context`, `choose_route`, `clarify`, `fast_direct_task`, `collect_merge`, `evaluate_progress`, `synthesize_outcome`, and `respond_propose_memory`. Add checkpoint/resume behavior.

Done when:

- “Open my browser” can use a deterministic recipe without model inference.
- Unknown or ambiguous targets stop for clarification.
- Every response is linked to its request and relevant receipt/evidence.
- Restarting at each checkpoint yields no duplicate side effect.

### Phase 3 - Supervision and initial agent subgraphs

Build: `supervisor_plan`, `validate_plan`, `dispatch_ready_tasks`, `bounded_replan`, the task worker, Desktop Agent, and minimum Discovery Agent evidence flow.

Done when:

- A multi-step request becomes bounded C3 packets with dependencies.
- Parallel workers merge through reducers, not shared mutable state.
- Replan count and task scope are enforced.
- Discovery output includes evidence/provenance and cannot invoke native adapters.

### Phase 4 - Memory, artifacts, and knowledge

Build: M0-M5 mapping, hybrid retrieval, `memory_lookup`, `memory_save`, `document_read`, `document_create`, artifact metadata, memory validation, deduplication, and index repair.

Done when:

- A prior architecture decision can be retrieved with provenance.
- A report becomes a registered artifact and can be proposed as M5.
- Duplicate/conflicting facts are surfaced instead of silently overwriting each other.
- Deleting/retiring memory propagates to search projections.

### Phase 5 - Reliability and product hardening

Build: cancellation, timeout behavior, model-provider fallbacks, observability UI, export/backup, diagnostics, policy administration, and end-to-end desktop tests.

Done when:

- A simulated crash during every execution phase has a documented recovery outcome.
- Model unavailability yields deterministic fallback, safe partial completion, or clear user action.
- Audit data can reconstruct “who proposed, approved, executed, and observed what.”

## Test matrix and acceptance invariants

| Area | Minimum test | Invariant |
|---|---|---|
| Contracts | Schema fuzz/negative cases | Invalid authority-bearing envelopes do not cross a boundary |
| Graph | Transition and checkpoint tests | Node routes use only declared statuses and bounded loops |
| Worker | Scoped packet tests | A worker cannot add capability, target, or step count |
| Policy/approval | Mutation and expiry tests | Approval matches the exact proposal fingerprint |
| Gateway | Idempotency/crash tests | Each side effect has a receipt or `unknown_outcome` |
| Memory | Retrieval/dedupe/conflict tests | Every durable memory keeps provenance and revision |
| Storage | Migration/foreign-key tests | Canonical records remain consistent with index projections |
| Agents | Structured-output and hostile-content tests | Agent text cannot invoke adapters or change policy |
| End to end | Desktop happy/failure paths | UI shows verified progress and safe partial outcomes |

Run deterministic unit and graph tests without a model provider. Use a fake structured model and fake adapters for integration tests; reserve real desktop/provider tests for a small, controlled suite.

## Engineering decision log to close early

| Decision | Why it matters | Safe default |
|---|---|---|
| LangGraph migration boundary | Affects deployment and SDK usage, not contracts | Extend `apps/engine/backend/agent/graphs` beside the existing `loop.py` |
| IPC transport/versioning | Defines shell/native/engine transport | Versioned JSON-RPC in `modules/ipc` |
| Local embedding/index library | Controls retrieval performance and packaging | SQLite remains canonical; index is rebuildable |
| Model provider defaults | Controls privacy/cost/availability | Local provider first, hosted adapter opt-in |
| Approval policy UX | Shapes trust and interruption recovery | Show exact targets, impact, expiry, and cancel |
| Artifact root/backup policy | Controls retention and deletion | User-visible local root with metadata and export |

Do not postpone these decisions until agents exist. The execution gateway, contracts, and persistence model are the foundation every agent depends on.

