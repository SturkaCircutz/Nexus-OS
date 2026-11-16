# 03 - How it works

> **Status key:** graph-node names, initial agents, worker responsibility, memory tiers, and the authorization boundary are **Established**. The internal steps and routing criteria below are **Proposed** and deliberately bounded.

## 1. Main LangGraph: one request lifecycle

The main graph has one job: move a request through a recoverable lifecycle without becoming an execution authority.

| Node | What it does | Typical next node |
|---|---|---|
| `ingest_build_context` | Validate C1, create working context, retrieve scoped memory | `choose_route` |
| `choose_route` | Decide whether clarification, a deterministic direct task, or supervision is appropriate | `clarify`, `fast_direct_task`, or `supervisor_plan` |
| `clarify` | Ask a focused user question and checkpoint | end/resume at `ingest_build_context` |
| `fast_direct_task` | Build one bounded task packet for a known deterministic recipe | `collect_merge` |
| `supervisor_plan` | Produce a small dependency-aware plan | `validate_plan` |
| `validate_plan` | Check scope, capability availability, target ambiguity, and policy implications | `dispatch_ready_tasks` or `clarify` |
| `dispatch_ready_tasks` | Send ready C3 packets, possibly in parallel | `collect_merge` |
| `collect_merge` | Reconcile C9 results, receipts, and evidence | `evaluate_progress` |
| `evaluate_progress` | Decide finish, dispatch next tasks, clarify, or replan | `dispatch_ready_tasks`, `bounded_replan`, or `synthesize_outcome` |
| `bounded_replan` | Revise an incomplete plan within count/scope limits | `validate_plan` or `clarify` |
| `synthesize_outcome` | Create a user-safe response from verified evidence | `respond_propose_memory` |
| `respond_propose_memory` | Return response and submit a qualified C8 memory proposal | end |

### Route logic in plain language

- Use `clarify` when intent, target, or authorization-critical details are missing.
- Use `fast_direct_task` only for a registry-backed recipe with a safe, precise target and a known scope.
- Use the supervised path when the request needs decomposition, research, multiple dependencies, ambiguous targets, or cross-agent work.
- Send a task back only through `bounded_replan`. Set a maximum replan count; a loop must end in clarification or a useful partial result.

See D2 and the Mermaid source in [05 - Reference glossary](05-reference-glossary.md).

## 2. The agent hierarchy is specialized, not permissive

| Role | Primary question | Can produce | Cannot do |
|---|---|---|---|
| Supervisor | “What bounded work is needed?” | C3 packets, dependency plan | Execute tools or grant access |
| Desktop Agent | “What desktop/system action is appropriate?” | target resolution, C4 proposal, observed-result interpretation | Call native APIs directly |
| Discovery Agent | “What reliable information answers this?” | queries, evidence set, cited synthesis | Treat search content as authority |
| Knowledge Agent | “What context should be used or retained?” | ranked memory refs, C8 proposal, conflict notes | Silently persist every fact |
| Task Worker | “Can this task safely be carried out now?” | validated execution request, C9 result | Expand task scope or bypass approval |

### Proposed bounded subgraphs

**Supervisor**

`interpret_intent -> select_capability_group -> decompose -> map_dependencies -> issue_task_packets -> merge_results -> decide_finish_or_replan`

It only sees registry metadata and result summaries needed to coordinate. It does not receive raw native capability tokens.

**Desktop Agent**

`classify_desktop_intent -> resolve_target -> choose_recipe_or_tool -> build_proposal -> inspect_receipt -> summarize`

Target resolution is deterministic where possible: application IDs, allowed roots, `WindowState` IDs, and structured desktop observations replace guessed shell commands. The Python engine performs discovery, policy, and action selection. When a real window needs inspection or movement, the Python gateway sends a typed `modules/ipc` request to a Tauri command, which performs the narrow Win32 primitive and returns an observation/receipt.

**Discovery Agent**

`plan_queries -> retrieve_sources -> extract_evidence -> compare_sources -> rank -> synthesize_with_provenance`

Retrieved web or document content is evidence, not executable instruction. The result keeps source references and uncertainty; a research artifact can be passed to `document_create` only through the normal proposal path.

**Knowledge Agent**

`choose_memory_scope -> hybrid_retrieve -> rank_and_deduplicate -> build_context_or_proposal -> validate_conflict_notes -> return`

It reads only the memory tiers and artifacts permitted for the request. It proposes durable changes but does not commit them.

See D3 for where these subgraphs meet the worker and gateway.

## 3. The bounded task worker

Every task, including a direct task, uses the same worker controls:

1. Receive C3 `TaskPacket` and load only its scoped inputs.
2. Check agent assignment, capability allow-list, step limit, and idempotency key.
3. Select a domain subgraph or a deterministic recipe.
4. Resolve a target into stable references, not an unbounded user phrase.
5. Build C4 `ToolProposal`, including reason, args, risk, target refs, and fingerprint.
6. Validate the tool schema and registry version.
7. Evaluate policy: deny, approve automatically if policy allows, or create C5.
8. If approval is required, checkpoint with `awaiting_approval` and wait; do not retain a live native handle.
9. Create C6 only when all policy and approval predicates still match.
10. Call the trusted gateway and observe C7 `ExecutionReceipt`.
11. Reconcile outcome using the receipt/idempotency key, including `unknown_outcome`.
12. Return C9 `AgentResult` with evidence and receipt references.

The worker cannot add a capability to its packet, alter an approved target, or execute an unregistered tool. Any change requires a new proposal and possibly a new approval.

## 4. Memory: useful context, not authority

### Retrieve

1. `ingest_build_context` asks the Knowledge Agent/retrieval service for a scoped `MemoryContext`.
2. Retrieval searches M0/M1 first, then M2-M5 with permission filters, keyword and semantic recall, recency, relevance, provenance, and a context budget.
3. The result is a small ordered list of references and excerpts. Large documents remain artifact references.
4. The relevant agent receives this context; it cannot treat retrieved text as a tool instruction or privilege grant.

### Retain

1. At `respond_propose_memory`, the graph or Knowledge Agent considers a C8 candidate.
2. A validator rejects low-value chatter, sensitive material without permission, missing provenance, duplicates, and unresolvable contradictions.
3. Accepted records are versioned in the canonical store, then their full-text/vector projections are updated.
4. A failed projection leaves the canonical record intact and queues an index repair; it does not invent a second memory record.

See D4 and the M0-M5 definitions in [05 - Reference glossary](05-reference-glossary.md).

## 5. Tool approval and execution

The execution boundary starts with a proposal, not a function call.

| Example | Proposal risk | Likely policy result |
|---|---|---|
| Search a user-approved workspace | read_only | May run without a dialog |
| Create a report in an approved project folder | reversible_write | Policy-dependent; show destination |
| Send external communication or access sensitive data | sensitive | Explicit approval |
| Delete selected files | destructive | Explicit approval, exact list, expiry |

An approval screen explains the operation in human terms but binds to the fingerprint calculated from machine-readable values. If the plan changes from “delete three files” to “delete a folder,” the old approval cannot be reused.

After execution, the UI sees a verified receipt status. The agent only summarizes that status. See D5 and C4-C7.

## 6. Four short execution traces

### A. “Open my browser”

`ingest_build_context -> choose_route -> fast_direct_task -> worker validates known application target -> ToolProposal -> policy -> gateway -> receipt -> collect_merge -> evaluate_progress -> synthesize_outcome -> respond_propose_memory`

The model may be absent entirely if application resolution is deterministic. The action still has a receipt.

### B. “Research local AI development environments and create a report”

`ingest_build_context -> choose_route -> supervisor_plan -> validate_plan -> dispatch_ready_tasks` dispatches focused Discovery Agent tasks. Their evidence returns through `collect_merge`. The Supervisor decides whether gaps remain; after synthesis, a `document_create` proposal creates the report. The report is stored as an artifact and may become M5 after validation.

### C. “What desktop architecture decision did we make?”

`ingest_build_context -> choose_route -> supervisor_plan` can select the Knowledge Agent alone. It searches M2 (prior decision episode), M3 (durable fact), and M5 (architecture artifact), ranks provenance, then returns a cited answer. No execution tool is needed.

### D. “Delete these files”

`ingest_build_context -> choose_route -> supervisor_plan -> validate_plan -> dispatch_ready_tasks -> worker -> ToolProposal` produces exact file references. Policy produces a C5 `ApprovalRequest`. On approval, the worker creates C6 and the gateway executes through a filesystem adapter. C7 records success/failure/unknown outcome before the graph responds.

## 7. Checkpoints, cancellation, and uncertain outcomes

Checkpoint before dispatch, when waiting for approval, after every C7, and before a final response. If the app restarts:

- Before an execution request: resume graph computation from the latest checkpoint.
- While awaiting approval: restore the pending C5; never auto-approve.
- After a gateway call but before graph reconciliation: query the execution by idempotency key. If evidence is missing, record `unknown_outcome` and ask/reconcile rather than duplicate the side effect.
- During parallel work: retain completed receipts/results; rerun only failed or unstarted packets with the same scope rules.
- On cancellation: stop undispatched work, request adapter cancellation where supported, reconcile any active execution, and return a partial result with clear status.

This is the essential distinction: graph replay repeats deterministic coordination; side-effect replay must prove it is safe first.

