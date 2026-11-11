# 01 - General architecture

> **Status key:** **Established** facts come from the supplied brief. **Proposed** choices make the implementation actionable and should be confirmed before code is treated as production-ready.

## The mental model

NEXUS AI CORE is not one all-powerful assistant. It is a local-first coordinator that turns a user request into a bounded plan, asks specialized agents for reasoning or evidence, and sends only validated execution requests to trusted Python backend code.

**Confirmed implementation decision:** React owns interaction and presentation. Python/FastAPI owns backend authority: LangGraph orchestration, agents, policies, memory, persistence, and approval decisions. Rust/Tauri owns the desktop shell, FastAPI sidecar lifecycle, Win32 observation, and typed native window primitives. Agents propose actions; the Python gateway validates and authorizes them before a Python engine tool or typed Rust command can run.

The short version is:

~~~
React UI -> Tauri shell -> modules/ipc -> Python FastAPI engine -> LangGraph -> agents / workers
                                             <- Python policy/gateway <- engine tools OR typed IPC -> Rust Win32 commands
~~~

See D1 in [the diagram PDF](NEXUS-AI-CORE-Architecture-Diagrams.pdf) for the complete boundary map.

## Layers and ownership

| Layer | Owner | Responsibility | Must not control | Logic |
|---|---|---|---|---|
| Presentation | React | Collect intent, show progress, render approval and results | Native side effects, policy decisions | Deterministic UI |
| Presentation shell | React | Desktop canvas, widgets, taskbar, gestures, approval display | Session, policy, native commands, or execution authority | Deterministic UI |
| Native desktop core | Rust/Tauri | Windowing, sidecar lifecycle, Win32 hooks, typed native commands, cached topology | Intent interpretation, policy, model, memory, or plan ownership | Deterministic |
| Backend entry | Python FastAPI | Local API, session/request boundary, capability context | UI presentation or desktop window lifecycle | Deterministic |
| Main orchestration | LangGraph | Route, checkpoint, dispatch, merge, recover | Direct OS/service calls | Mixed |
| Coordination | Supervisor | Decompose and schedule bounded tasks | Grant permissions or invent tools | Mixed |
| Domain agents | Desktop, Discovery, Knowledge | Produce typed plans, evidence, and proposals | Bypass worker or gateway | Mixed |
| Task worker | Worker graph | Bind task scope, resolve inputs, request execution, reconcile result | Expand its own scope or authority | Mostly deterministic |
| Capability system | Tool registry + policies | Describe available, allowed operations | Execute without gateway validation | Deterministic |
| Trusted execution | Python policy/gateway + engine tools + typed Rust commands | Validate, approve, execute, observe, receipt | Let native code infer intent or rewrite policy | Deterministic |
| Memory and retrieval | Memory service | Retrieve, rank, propose durable knowledge | Become a source of execution authority | Mixed retrieval |
| Durable storage | SQLite, checkpoint store, filesystem, indexes | Keep records, artifacts, and recovery data | Interpret intent or authorize actions | Deterministic |
| Model inference | Inference gateway | Supply structured reasoning behind contracts | Make permission decisions | Generative |
| Observability | Audit + events | Trace decisions, receipts, checkpoints, errors | Alter outcomes | Deterministic |

## Authority is enforced, not implied

**Proposed enforcement model**

1. React sends C1 through `modules/ipc` and the Tauri shell to the local FastAPI engine. The shell forwards typed payloads; it does not interpret intent.
2. Python creates or validates the session, request identity, and capability context before the graph begins.
3. LangGraph and agents can emit `ToolProposal` objects (C4), but they do not receive adapter handles, OS tokens, or raw account credentials.
4. The task worker turns a valid proposal into an `ExecutionRequest` (C6) only after schema validation, target resolution, policy evaluation, and any required approval.
5. The Python policy/gateway is the sole authority path to a tool. It either invokes a Python engine tool or issues a typed `modules/ipc` request to a Rust Tauri command. It binds approval to the exact proposal fingerprint, records a receipt, and returns an `ExecutionReceipt` (C7).
6. The graph trusts a receipt or an explicitly `unknown_outcome` status, not a model's claim that an action occurred.

This shape makes an LLM useful without letting it turn prose into authority. A compromised or confused agent can make a bad proposal; it cannot directly press the destructive button.

## Request lifecycle

1. The user acts in React. The Tauri shell forwards the typed request over the shared IPC contract to the local Python engine.
2. The Python engine creates a session/request record and invokes the LangGraph main graph at `ingest_build_context`.
3. The graph loads M0/M1 context and retrieves only relevant durable memories. It selects a route at `choose_route`.
4. A safe, recognized operation can use `fast_direct_task`. Everything else goes through `supervisor_plan`, `validate_plan`, and bounded task dispatch.
5. Workers call a domain subgraph or deterministic recipe. They return evidence, a result, or a `ToolProposal`.
6. A proposal is checked by policy and, when needed, shown in React as an approval bound to exact arguments and targets.
7. Only the gateway executes an approved request. The gateway emits a receipt, audit event, and observable result.
8. The graph merges results, evaluates progress, performs a bounded replan if justified, synthesizes the answer, and makes a memory proposal.
9. A memory validator decides whether a proposal becomes durable; it does not silently save every conversation fragment.

For the node-by-node flow, see [03 - How it works](03-how-it-works.md) and D2.

## Routing: direct is not unchecked

**Established:** the main graph includes both `fast_direct_task` and a supervised path.

**Proposed:** the direct path is limited to a registry-backed deterministic recipe whose intent, target, arguments, and risk class are unambiguous. “Open my browser” may qualify after the target is resolved. “Clean up my downloads” does not; it needs a plan and likely review.

Both paths converge on the same policy, approval, execution, receipt, and audit mechanisms. “Fast” only removes unnecessary planning; it never removes the trust boundary.

## Data ownership and persistence

| Data | Canonical owner | Durable location | Examples |
|---|---|---|---|
| UI-only state | React | In-memory UI state | Panel visibility, draft text |
| Desktop/native state | `src-tauri/src/state.rs` + `modules/window-state` | Cached Win32 topology and unified `WindowState` snapshots | Window handle/geometry observations |
| Backend capability context | Python engine | Session/approval records, not graph state | Scoped capability grant, target references |
| Graph state | LangGraph + checkpoint service | Checkpoint store | Route, task status, cursor |
| Work records | Core repositories | SQLite | Requests, tasks, agent runs |
| Side-effect evidence | Trusted gateway | SQLite + event records | Receipt, outcome, timestamps |
| Artifacts | Artifact service | Local filesystem + metadata row | Reports, documents |
| Searchable memory | Memory service | SQLite + local full-text/vector index | Episodes, facts, procedures |

Graph state contains identifiers and small structured values, never raw files, secrets, open handles, or unbounded model context.

## Error and recovery posture

Errors travel as typed results, not as informal model prose. A worker reports a retryable failure, terminal failure, or uncertain side effect. The main graph records a checkpoint before dispatch and after reconciliation. If execution may have happened but no receipt is yet visible, the gateway is queried by idempotency key before retrying anything.

**Established:** checkpointing, observability, audit, and recovery are architectural layers.

**Proposed:** an external side effect is retried only when it has been proven not to have occurred, or when its adapter is explicitly idempotent. Replaying graph computation is safe more often than replaying a desktop or filesystem operation.

## Local-first deployment profile

The initial deployment can run on one desktop:

- `apps/shell/frontend` provides the React presentation shell and internal widgets; `src-tauri` hosts the desktop core and starts the FastAPI sidecar.
- `apps/engine/backend` runs the Python orchestration service, policy/gateway, agent tools, memory, database access, and model-provider routing.
- `modules/ipc` carries typed shell-to-engine requests; `modules/window-state` defines the unified internal/external window contract; `modules/storage` owns shared SQLite schema/migrations.
- SQLite stores structured records; local filesystem storage holds artifacts; local full-text/vector indexes accelerate retrieval; the checkpoint store preserves graph progress.

**Open decision:** finalize JSON-RPC versus local HTTP details for shell-to-engine transport and choose the embedded vector-index implementation. Python backend authority is fixed; Rust stays a typed native desktop executor rather than an agent backend.

