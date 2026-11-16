# 02 - API and contracts

> **Status key:** the names and role boundaries are **Established**. The fields, IDs, JSON shape, and validation behavior below are **Proposed** implementation contracts.

## Contract principles

- Every cross-module message is JSON-serializable, versioned, and attributable to a request.
- JSON Schema is the shared wire contract; the Python backend validates it with Pydantic models, while React uses generated TypeScript types.
- Graph state carries references and compact structured data, not secrets, files, native handles, or unlimited conversation text.
- Only the trusted execution gateway accepts an `ExecutionRequest`. Agents produce `ToolProposal` objects.
- Every external side effect ends in a receipt or `unknown_outcome`. “The model said it worked” is never a result type.
- Unknown fields are rejected at authority boundaries. Forward-compatible fields belong inside an explicit `extensions` object.

## Canonical contract map

For compactness, the object shapes below use TypeScript-like notation. The authoritative backend implementation is Python/Pydantic and must emit/accept the same versioned JSON Schema.

| ID | Contract | Produced by | Consumed by | Why it exists |
|---|---|---|---|---|
| C1 | `RequestEnvelope` | React through `modules/ipc` / Tauri shell | Python FastAPI engine / main graph | Stable user request and session boundary |
| C2 | `MainGraphState` | Main graph nodes | Main graph/checkpoint store | Recoverable orchestration state |
| C3 | `TaskPacket` | Supervisor/dispatcher | Task worker | Bounded unit of work |
| C4 | `ToolProposal` | Agent or deterministic recipe | Policy/approval service | Proposed operation without authority |
| C5 | `ApprovalRequest` | Python policy service | React through `modules/ipc` / Tauri shell | Human decision bound to one proposal |
| C6 | `ExecutionRequest` | Python worker after validation | Python policy/gateway, then Python tool or typed Tauri command | Authorized, idempotent operation |
| C7 | `ExecutionReceipt` | Python gateway after tool/native-command observation | Worker/main graph/audit | Observed result or uncertainty |
| C8 | `MemoryProposal` | Main graph or Knowledge Agent | Memory validator | Candidate durable memory with provenance |
| C9 | `AgentResult` | Domain subgraph/worker | Supervisor/main graph | Typed completion, evidence, or failure |

## C1 - RequestEnvelope

~~~ts
type RequestEnvelope = {
  contract_version: "1";
  request_id: string;          // UUID generated at the Python backend boundary
  session_id: string;
  parent_request_id?: string;  // for a follow-up or resume
  user_input: string;
  attachments: Array<{ artifact_id: string; media_type: string; display_name: string }>;
  ui_context: { active_surface?: string; selected_refs: string[] };
  submitted_at: string;        // ISO-8601 UTC
};
~~~

**Validation:** `request_id` and `session_id` must be non-empty UUIDs; attachments are references already registered by the Python engine; `user_input` is treated as untrusted content, not an instruction to a policy engine. The Tauri shell transports C1 and may execute only a schema-approved native command issued by the Python gateway.

## C2 - MainGraphState

~~~ts
type MainGraphState = {
  request: RequestEnvelope;
  route?: "clarify" | "fast_direct" | "supervised";
  status: "received" | "planning" | "running" | "awaiting_approval" |
          "reconciling" | "completed" | "failed" | "cancelled";
  task_ids: string[];
  ready_task_ids: string[];
  results: AgentResult[];
  memory_context: MemoryContext;
  plan?: { revision: number; goal: string; task_ids: string[] };
  replan_count: number;
  checkpoint_ref?: string;
  final_response?: { text: string; evidence_refs: string[] };
  errors: CoreError[];
};

type MemoryContext = {
  query_id: string;
  item_refs: Array<{ memory_id: string; tier: "M0"|"M1"|"M2"|"M3"|"M4"|"M5";
                    relevance: number; freshness: number; provenance_ref: string }>;
  token_budget: number;
};
~~~

The graph node that owns a field is the only writer for it; reducers append or merge clearly named collections such as `results` and `errors`. Workers return results through C9 rather than mutating shared state. This is how parallel dispatch stays deterministic enough to recover.

## C3 - TaskPacket

~~~ts
type TaskPacket = {
  task_id: string;
  request_id: string;
  parent_task_id?: string;
  assigned_to: "desktop" | "discovery" | "knowledge" | "recipe";
  objective: string;
  input_refs: string[];
  allowed_capabilities: string[];
  scope: { allowed_targets: string[]; max_steps: number; deadline_at?: string };
  idempotency_key: string;
  attempt: number;
};
~~~

The supervisor may create a packet, but a worker rejects it if the task is outside its capability group, exceeds `max_steps`, has an unknown capability, or needs a target outside scope.

## C4-C7 - proposal, approval, execution, receipt

~~~ts
type ToolProposal = {
  proposal_id: string;
  task_id: string;
  tool_id: string;
  tool_version: string;
  args: Record<string, unknown>;
  target_refs: string[];
  reason: string;
  risk: "read_only" | "reversible_write" | "sensitive" | "destructive";
  side_effect: boolean;
  proposal_fingerprint: string; // hash of canonical tool, version, args, targets, scope
};

type ApprovalRequest = {
  approval_id: string;
  proposal_id: string;
  proposal_fingerprint: string;
  summary: string;
  expires_at: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
};

type ExecutionRequest = {
  execution_id: string;
  proposal_id: string;
  proposal_fingerprint: string;
  idempotency_key: string;
  approval_id?: string;
  granted_capability_refs: string[];
};

type ExecutionReceipt = {
  execution_id: string;
  status: "succeeded" | "failed" | "cancelled" | "unknown_outcome";
  started_at: string;
  finished_at?: string;
  output_ref?: string;
  error?: CoreError;
  adapter_observation_ref?: string;
};
~~~

An approval is valid only when its `proposal_fingerprint`, requester session, expiry, and target scope all match C6. Changing one argument, target, tool version, or risk classification produces a new proposal and invalidates the old approval. The gateway enforces idempotency before invoking an adapter.

## C8-C9 - memory and agent result

~~~ts
type MemoryProposal = {
  proposal_id: string;
  source_request_id: string;
  tier: "M2" | "M3" | "M4" | "M5";
  kind: "episode" | "fact" | "procedure" | "artifact";
  content_ref: string;
  provenance_refs: string[];
  confidence: number;          // 0..1
  sensitivity: "normal" | "sensitive";
  operation: "create" | "update" | "retire";
};

type AgentResult = {
  task_id: string;
  agent: "supervisor" | "desktop" | "discovery" | "knowledge" | "recipe";
  status: "completed" | "needs_input" | "blocked" | "failed";
  summary: string;
  evidence_refs: string[];
  proposal_refs: string[];
  receipt_refs: string[];
  error?: CoreError;
};
~~~

M0 and M1 are runtime/working context, so they are not written through C8. A memory proposal is not a memory record until the memory validator checks provenance, sensitivity, duplicate/conflict status, and retention policy.

## Tool registry and initial catalog

Each registry entry includes `tool_id`, `version`, description, capability group, JSON input/output schemas, risk class, side-effect flag, allowed target rules, timeout, retry/idempotency policy, availability, and adapter ID. The registry is data, not an agent prompt.

| Tool ID | Capability group | Input | Output | Default risk | Adapter owner |
|---|---|---|---|---|---|
| `system_diagnostics` | desktop.system | requested checks; scope | structured health observations | read_only | Python engine tool; Tauri/Win32 snapshot when needed |
| `memory_save` | knowledge.memory | validated memory record reference | memory ID, index status | reversible_write | Memory repository |
| `memory_lookup` | knowledge.memory | query, tiers, limit, permission scope | ranked memory references | read_only | Retrieval service |
| `file_search` | desktop.files | approved roots, pattern, limit | file metadata references | read_only | Python engine filesystem tool |
| `document_read` | documents | artifact/file reference, extraction mode | text/evidence references | read_only | Python document adapter |
| `document_create` | documents | artifact type, content reference, destination | artifact reference, receipt | reversible_write | Python document adapter |

**Proposed:** `memory_save` is internal-only: it accepts a record created by the validator, never unreviewed free-form agent text. Future tools use the same registry structure; their existence does not grant them to every agent.

## Internal API surface

The system does not need a public HTTP API for its first local deployment. Use `modules/ipc` for typed React/Tauri/Python messages, local FastAPI for the engine boundary, and typed Python service calls inside the engine:

| Surface | Direction | Contract |
|---|---|---|
| UI request | React -> Tauri -> `modules/ipc` -> Python FastAPI -> graph | C1 |
| Progress update | Python graph -> `modules/ipc` -> Tauri -> React | request ID, task status, safe display text |
| Worker dispatch | supervisor -> worker | C3 |
| Proposal evaluation | worker -> policy | C4 |
| Approval decision | React -> Tauri -> Python policy | approval ID, decision, session proof |
| Engine tool execution | Python worker -> Python gateway -> Python tool | C6 / C7 |
| Native window execution | Python worker -> Python gateway -> `modules/ipc` -> Tauri command -> Win32 | C6 / C7 |
| Memory write | graph/agent -> validator -> repository | C8 |

No UI response can mark a request approved unless the Python approval service verifies the session and the approval is still pending. Tauri transports the decision and runs native commands only after receiving a valid typed request from the Python gateway.

## Error contract and lifecycle statuses

~~~ts
type CoreError = {
  code: "INVALID_INPUT" | "POLICY_DENIED" | "APPROVAL_REQUIRED" |
        "APPROVAL_EXPIRED" | "TOOL_UNAVAILABLE" | "TARGET_NOT_FOUND" |
        "ADAPTER_FAILURE" | "MODEL_UNAVAILABLE" | "TIMEOUT" |
        "UNKNOWN_OUTCOME" | "CANCELLED";
  message: string;             // safe to show to a user or operator
  retryable: boolean;
  detail_ref?: string;         // diagnostic detail, access controlled
};
~~~

Use the status vocabulary exactly: `received`, `planning`, `running`, `awaiting_approval`, `reconciling`, `completed`, `failed`, and `cancelled`. Only the gateway may emit `unknown_outcome` for an external side effect.

## Storage mapping

| Record | Primary store | Supporting store |
|---|---|---|
| Session, request, task, approval, execution, audit event | SQLite | Checkpoint references |
| Graph checkpoint | LangGraph checkpoint backend | SQLite metadata/index |
| Artifact contents | Local filesystem | SQLite artifact metadata |
| Memory canonical record | SQLite | Full-text/vector index entries |
| Embedding/index projection | Local index | Canonical memory ID and revision |

See D6 for relationships and [04 - Implementation rules and roadmap](04-implementation-rules-and-roadmap.md) for migration and test expectations.

