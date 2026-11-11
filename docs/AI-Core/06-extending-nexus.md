# 06 - Extending NEXUS

> **Status key:** the safety boundary and contract names are **Established**. The file paths and checklists are **Proposed** conventions for keeping extensions consistent.

This is the practical “where does this go?” guide. Start here before adding a capability so the new code does not become a hidden bypass around policy, memory, or execution.

## First choose the right shape

| If you need to add... | Use this | Do not use an agent when... |
|---|---|---|
| One typed operation, such as reading a document or checking battery health | **Tool** | The operation is deterministic and has a clear input/output |
| Reusable deterministic business logic, validation, parsing, ranking, or storage behavior | **Module/service** | It does not need planning, language reasoning, or its own lifecycle |
| A domain that needs scoped reasoning, several steps, distinct evidence, and a specialized result | **Agent subgraph** | It would only be the same model with a different prompt |
| A known multi-step operation with no open-ended reasoning | **Deterministic recipe** | The steps and targets can be validated up front |

The default choice is a module or deterministic recipe. Add an agent only when it owns a genuinely different domain, inputs, output, and lifecycle.

## The universal extension flow

1. Define the capability in plain language: inputs, output, side effects, target boundary, failure modes, and who should be allowed to use it.
2. Choose the shape above. If it has a side effect, it must be a registered Python engine tool or a typed native desktop command routed through `modules/ipc`.
3. Add or reuse typed contracts from [02 - API and contracts](02-api-and-contracts.md). Do not pass loose prompt text between layers.
4. Put deterministic logic, reasoning, policy, and persistence in the Python engine. Use Rust only for the existing desktop-shell responsibilities: Tauri lifecycle, Win32 observation, and narrow typed window primitives.
5. Register the capability and policy before an agent can select it.
6. Add checkpoint, receipt, provenance, and observability behavior where applicable.
7. Add focused tests before exposing the capability to the Supervisor.
8. Update [05 - Reference glossary](05-reference-glossary.md), diagrams, and this guide only if a canonical term or topology changes.

## Adding a new tool

A tool is a single registered operation with a typed input/output contract. An agent can propose it; only the trusted execution gateway can invoke it.

### Files to add or change

| Location | Change | Why |
|---|---|---|
| `apps/engine/backend/schemas/<tool_id>.py` | Add Pydantic input/output models when generic C4-C7 types are not enough | Keeps arguments typed before they reach policy |
| `apps/engine/backend/agent/tools/registry.py` | Add one versioned registry entry | Makes the tool discoverable and allows it to be enabled/disabled |
| `apps/engine/backend/agent/execution/policy.py` | Add risk, target, approval, timeout, and retry/idempotency rules | Policy is executable Python code, not prompt text |
| `apps/engine/backend/agent/tools/<tool_id>.py` | Implement a Python engine tool | Use for web, documents, storage, and non-native work |
| `src-tauri/src/commands/<command>.rs` + `src-tauri/src/win32/<domain>.rs` | Add a typed native desktop primitive only when needed | Rust handles Win32 mechanics, not agent/policy decisions |
| `modules/ipc/` | Add the Rust/TypeScript/Python wire contract for a native command | Keeps shell-to-engine messages typed and reviewable |
| `apps/engine/backend/agent/agents/<agent>.py` | Add the tool ID to that agent’s explicit allow-list only if needed | An agent gets no tool just because it exists |
| `tests/systems/` and `tests/vision/` | Add policy, native-command, and end-to-end cases | Proves the boundary holds under failure |

### Registry entry template

~~~json
{
  "tool_id": "example_operation",
  "version": "1",
  "capability_group": "desktop.example",
  "description": "One sentence describing the operation.",
  "input_schema_ref": "contracts/example_operation_input.v1",
  "output_schema_ref": "contracts/example_operation_output.v1",
  "risk": "read_only",
  "side_effect": false,
  "allowed_targets": ["approved_workspace"],
  "timeout_ms": 10000,
  "idempotency": "not_required",
  "adapter_id": "python.example_operation",
  "native_command_id": null,
  "availability": "enabled"
}
~~~

Use `read_only`, `reversible_write`, `sensitive`, or `destructive` for risk. A write tool needs a clear idempotency/reconciliation story. If it cannot prove whether it completed after a crash, the gateway must be able to return `unknown_outcome`.

### Required wiring

~~~text
agent or recipe
  -> C4 ToolProposal
  -> schema + target validation
  -> policy decision / C5 approval when needed
  -> C6 ExecutionRequest
  -> Python policy and execution gateway
  -> Python engine tool OR modules/ipc -> Tauri command -> Win32 primitive
  -> C7 ExecutionReceipt
  -> worker reconciliation
~~~

Never wire `agent -> Win32`, `React UI -> Tauri command`, or `model output -> shell command`. The Python gateway is the only component that may issue a native command request.

### Tool definition of done

- Registry entry, Pydantic schema, policy rule, and tool/native-command version agree.
- A Python tool accepts only validated structured input; a Rust command also rejects malformed IPC payloads.
- The policy binds approvals to exact arguments and target references.
- Each execution records an idempotency key, audit event, and receipt or `unknown_outcome`.
- Tests cover allowed, denied, expired approval, malformed input, timeout, cancellation, and resume-after-crash behavior.

## Adding a new module or service

Use a module for deterministic logic that several graphs, agents, or adapters can call. Examples: a document parser, a source-ranker, a target resolver, or a memory deduplicator.

### File placement

| Module type | Home | May depend on | Must not depend on |
|---|---|---|---|
| Orchestration node/reducer | `apps/engine/backend/agent/graphs/` or `agent/state/` | Pydantic schemas, engine services | UI or Tauri internals |
| Domain reasoning helper | `apps/engine/backend/agent/agents/<domain>/` | Schemas, retrieval/model interfaces | Tauri command internals |
| Deterministic domain service | `apps/engine/backend/agent/services/` | Schemas, repositories, stable utilities | React components |
| Persistence repository | `apps/engine/backend/database/` | SQLite and `modules/storage` | Agent prompts |
| Policy/approval service | `apps/engine/backend/agent/execution/` | Registry, schemas, storage | Agent prompts |
| Python engine tool | `apps/engine/backend/agent/tools/` | Python libraries and typed bridge | React and raw Win32 APIs |
| Native desktop primitive | `src-tauri/src/commands/` + `win32/` | `modules/ipc`, windows-rs | Agent/model/policy code |

For a module that changes durable data, add a repository method and migration in `migrations/`. Keep the transaction boundary in the service/repository layer, not in an agent node.

### Module checklist

- Give it one responsibility and a small typed interface.
- Decide whether it is stateless, owns runtime state, or owns durable records.
- Return a typed result/error; do not make callers parse free-form strings.
- Add unit tests before wiring it to an agent.
- If it emits events, use the request/task IDs already present in C1-C3.

## Adding an internal shell app

An internal app is a desktop widget, not an agent. Put its UI and app-specific logic together under the existing shell tree:

~~~text
apps/shell/frontend/src/internal-apps/<app_name>/
  frontend/                    # React widget, views, local interaction state
  backend/                     # App-local logic/storage adapter, if genuinely needed
  README.md                     # Purpose, IPC/API surface, run/test notes
~~~

Also register the widget in `apps/shell/frontend/src/apps/` (sizes, aliases, modes) and use `modules/window-state` for its shared `WindowState`. If the widget needs agent work, call the Python engine through `modules/ipc`; do not embed agent policy or raw Win32 calls in the widget.

## Adding a new agent

Create a new agent only if a tool, recipe, or helper inside Desktop, Discovery, Knowledge, or Supervisor would become confusing. An agent needs a clear domain boundary, a bounded state shape, a capability allow-list, and its own success/failure criteria.

### Files to add or change

| Location | Change |
|---|---|
| `apps/engine/backend/agent/agents/<agent_name>.py` | Define the subgraph, its prompt/model use, nodes, edges, and C9 result mapping |
| `apps/engine/backend/agent/agents/<agent_name>_state.py` | Add state only when C2/C3/C9 cannot express the scoped fields cleanly |
| `apps/engine/backend/agent/agents/supervisor.py` | Add the capability-group routing rule and task-packet assignment |
| `apps/engine/backend/agent/graphs/worker_graph.py` | Add the allowed agent selection; preserve scope validation |
| `apps/engine/backend/schemas/` | Add structured Pydantic output only if it crosses a module boundary |
| `apps/engine/backend/agent/tools/registry.py` and execution policy | Declare every tool the agent is allowed to propose |
| `tests/systems/test_<agent_name>.py` | Test routes, structured output, denied tool behavior, and failure/replan behavior |
| `05-reference-glossary.md` and D3 | Add the name, scope, and topology if it becomes canonical |

### Minimal subgraph contract

~~~text
Input:  TaskPacket + MemoryContext + referenced evidence
State:  only fields needed for this domain; JSON serializable
Output: AgentResult with evidence_refs, proposal_refs, receipt_refs, or typed error
Tools:  explicit allow-list from the registry
Writes: no direct durable or native writes; emit a proposal instead
~~~

An agent is not a privileged service. It may ask for a tool through C4, propose a memory item through C8, and return C9. It does not issue C6 directly.

### Agent definition of done

- The Supervisor has an explicit reason to choose it.
- Its graph has bounded loops and a clear terminal state.
- It receives only scoped C3 inputs and a bounded `MemoryContext`.
- It returns C9 for success, needs-input, blocked, and failure cases.
- It has no direct adapter/repository write path.
- Its model output is validated before it affects a plan, proposal, or result.

## Where integrations happen

| Integration | Exact owner | What to change |
|---|---|---|
| User starts work | React -> Tauri -> `modules/ipc` -> Python FastAPI | The shell transports C1; do not add graph logic to the UI or native core |
| Main route changes | `apps/engine/backend/agent/graphs/main_graph.py` | Add/adjust a node only when it affects global lifecycle |
| Domain selection changes | `apps/engine/backend/agent/agents/supervisor.py` | Map capability group to agent or recipe |
| Task safety changes | `apps/engine/backend/agent/graphs/worker_graph.py` + execution policy | Keep validation before gateway invocation |
| New engine tool | Python registry + policy + tool + gateway | All four are required |
| New native desktop ability | Python registry/policy + `modules/ipc` + Tauri command + Win32 primitive | Python decides; Rust executes only the typed primitive |
| New durable record | Contract + repository + migration + tests | Indexes follow canonical writes |
| New memory behavior | `apps/engine/backend/agent/memory/` | Preserve provenance and deletion propagation |
| New user approval display | React approval view + C5 handling | Do not invent a second approval path |

## A safe pull-request-sized sequence

For a small read-only tool:

1. Add contract and registry metadata.
2. Implement and register the Python engine tool.
3. Add policy and gateway tests.
4. Add the tool to one agent/recipe allow-list.
5. Add an integration test from C4 to C7.
6. Document it in the glossary.

For a new agent, first ship the deterministic tools/modules it needs. Then add the agent subgraph and Supervisor route in a separate change. This makes it easy to tell whether a failure lives in the capability or the reasoning layer.

## Stop-and-ask conditions

Pause for a design decision before coding when the extension:

- sends data off-device, uses a new account, or handles highly sensitive content;
- requires a new approval category or changes what can run without approval;
- introduces a new durable data class or retention policy;
- needs a network service, remote database, paid provider, or background daemon;
- has an external side effect that cannot be made idempotent or reconciled;
- would duplicate another agent with only a different prompt.

Those choices change the architecture, not just a file.

