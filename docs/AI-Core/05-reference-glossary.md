# 05 - Reference glossary

> **Status key:** canonical names inherited from the source are **Established**. Implementation detail is **Proposed** unless called out otherwise. This file is the vocabulary and diagram-source reference; do not create alternate spellings in code.

## Canonical graph nodes

| Node | Canonical purpose |
|---|---|
| `ingest_build_context` | Validate request, build bounded M0/M1 context, retrieve scoped memory |
| `choose_route` | Choose clarify, direct, or supervised processing |
| `clarify` | Request the smallest missing user decision |
| `fast_direct_task` | Issue one safe deterministic task packet |
| `supervisor_plan` | Create a bounded dependency-aware plan |
| `validate_plan` | Validate scope, capabilities, targets, and policy needs |
| `dispatch_ready_tasks` | Dispatch ready task packets, potentially in parallel |
| `collect_merge` | Merge typed results, evidence, and receipts |
| `evaluate_progress` | Choose more dispatch, bounded replan, clarification, or completion |
| `bounded_replan` | Revise plan within fixed limits |
| `synthesize_outcome` | Produce a user-safe, evidence-grounded outcome |
| `respond_propose_memory` | Respond and submit a qualified memory proposal |

## Canonical roles and capability groups

| Name | Type | Scope |
|---|---|---|
| Supervisor | Agent subgraph | Task planning, dependencies, dispatch decisions |
| Desktop Agent | Agent subgraph | Desktop/system discovery and action proposals |
| Discovery Agent | Agent subgraph | Research, evidence, source comparison |
| Knowledge Agent | Agent subgraph | Retrieval, consolidation, memory proposals |
| Task Worker | Worker graph | Scope enforcement, proposal-to-receipt lifecycle |
| Deterministic recipe | Code path | Known bounded operation with no open-ended planning |
| Tool | Registered Python engine operation | One typed capability with schema/policy metadata |
| Trusted execution gateway | Python engine boundary | Sole authority to invoke a Python tool or issue a typed Tauri native command |

## Memory tiers

| Tier | Stores | Does not store | Primary backend | Retention / access |
|---|---|---|---|---|
| M0 - Live World State | Current UI/runtime observations | Durable user facts or authority | Runtime snapshot; optional checkpoint ref | Short-lived, read-scoped |
| M1 - Working Context | Current task plan, selected excerpts, temporary notes | Raw files, secrets, native handles | Graph state/checkpoint | Request-scoped |
| M2 - Episodic Memory | Outcome of prior interactions and decisions | General truth without provenance | SQLite + retrieval index | Versioned, user-scoped |
| M3 - Semantic Memory | Durable facts/preferences with evidence | Unvalidated model claims | SQLite + full-text/vector index | Versioned, policy-scoped |
| M4 - Procedural Memory | Approved reusable procedures/recipes | Ad hoc privileged scripts | Registry/repository + SQLite metadata | Reviewed and versioned |
| M5 - Knowledge Artifacts | Reports, documents, structured notes | A replacement for canonical records | Filesystem + artifact metadata | Retained by artifact policy |

## Initial tools

| Tool ID | Type | Principal inputs | Principal output |
|---|---|---|---|
| `system_diagnostics` | Read-only tool | Requested checks, scope | Structured observations |
| `memory_save` | Internal write tool | Validated record reference | Memory ID/index status |
| `memory_lookup` | Read-only tool | Query, tiers, limit | Ranked references |
| `file_search` | Read-only tool | Allowed roots, pattern, limit | File metadata refs |
| `document_read` | Read-only tool | Artifact/file ref, mode | Extracted evidence refs |
| `document_create` | Reversible-write tool | Content ref, destination | Artifact ref/receipt |

## Canonical stores and core relationships

| Store | Canonical contents | Rebuildable? |
|---|---|---|
| SQLite | Session, request, task, proposal, approval, execution, receipt, memory/artifact metadata, audit | No |
| Checkpoint store | Serialized `MainGraphState` snapshots and write records | No for in-progress work |
| Filesystem artifact root | Documents and other artifacts | No unless backed up |
| Full-text/vector index | Retrieval projections keyed to canonical records | Yes |
| Runtime memory | Python backend session context, M0, live adapter state | Yes; never the only durable record |

Canonical status values: `received`, `planning`, `running`, `awaiting_approval`, `reconciling`, `completed`, `failed`, `cancelled`. The gateway alone may report `unknown_outcome`.

## Traceability matrix

| Source intent | Implementation reference |
|---|---|
| React shell / Rust Tauri native core / Python FastAPI engine | [01](01-general-architecture.md), D1 |
| Main LangGraph and named nodes | [03](03-how-it-works.md), D2 |
| Supervisor, Desktop, Discovery, Knowledge | [03](03-how-it-works.md), D3 |
| Bounded worker and authorization | [02](02-api-and-contracts.md), D5 |
| M0-M5 and local-first retrieval | [03](03-how-it-works.md), D4 |
| Tool registry and initial tools | [02](02-api-and-contracts.md), D5 |
| SQLite, checkpoints, artifacts, index | [01](01-general-architecture.md), D6 |
| Recovery, audit, receipts, idempotency | [03](03-how-it-works.md), [04](04-implementation-rules-and-roadmap.md) |

## Mermaid source

These diagrams are concise source equivalents of the vector PDF. They use the same names as the documents. The PDF is the preferred reading format; the Mermaid remains useful for version control and later regeneration.

### D1 - Overall system and trust boundaries

~~~mermaid
flowchart TB
  user[User] --> ui[React UI]
  ui --> shell[Rust Tauri shell]
  shell --> ipc[modules ipc]
  ipc --> engine[Python FastAPI engine]
  engine --> graph[Main LangGraph]
  graph --> supervisor[Supervisor]
  supervisor --> agents[Desktop Discovery Knowledge agents]
  agents --> worker[Task Worker]
  worker --> proposal[ToolProposal]
  proposal --> policy[Policy and approval]
  policy --> gateway[Python policy and execution gateway]
  gateway --> engineTools[Python engine tools]
  gateway --> native[Tauri commands and Win32]
  graph --> memory[Memory retrieval]
  memory --> stores[SQLite artifacts indexes]
  graph --> model[Model inference gateway]
  gateway --> audit[Receipts audit checkpoints]
~~~

### D2 - Main LangGraph flow

~~~mermaid
flowchart LR
  begin[Request] --> ingest[ingest_build_context]
  ingest --> route[choose_route]
  route -->|missing detail| clarify[clarify]
  clarify --> waiting[Await user input]
  route -->|known direct task| direct[fast_direct_task]
  route -->|multi-step task| plan[supervisor_plan]
  plan --> validate[validate_plan]
  validate -->|valid| dispatch[dispatch_ready_tasks]
  validate -->|needs detail| clarify
  direct --> merge[collect_merge]
  dispatch --> merge
  merge --> progress[evaluate_progress]
  progress -->|more ready work| dispatch
  progress -->|bounded replan| replan[bounded_replan]
  replan --> validate
  progress -->|finish| synthesize[synthesize_outcome]
  synthesize --> memory[respond_propose_memory]
  memory --> done[Response]
~~~

### D3 - Agent hierarchy and bounded subgraphs

~~~mermaid
flowchart TB
  main[Main LangGraph] --> supervisor[Supervisor]
  supervisor --> packet[TaskPacket]
  packet --> worker[Task Worker]
  worker --> desktop[Desktop Agent]
  worker --> discovery[Discovery Agent]
  worker --> knowledge[Knowledge Agent]
  worker --> recipe[Deterministic recipe]
  desktop --> proposal[ToolProposal]
  discovery --> evidence[Evidence set]
  knowledge --> context[MemoryContext]
  recipe --> proposal
  proposal --> gateway[Trusted execution gateway]
  gateway --> receipt[ExecutionReceipt]
  evidence --> result[AgentResult]
  context --> result
  receipt --> result
  result --> main
~~~

### D4 - Memory lifecycle and tiers

~~~mermaid
flowchart LR
  input[User request] --> m0[M0 Live World State]
  m0 --> m1[M1 Working Context]
  m1 --> retrieve[Scoped hybrid retrieval]
  m2[M2 Episodic] --> retrieve
  m3[M3 Semantic] --> retrieve
  m4[M4 Procedural] --> retrieve
  m5[M5 Knowledge Artifacts] --> retrieve
  retrieve --> ranked[Ranked MemoryContext]
  ranked --> execution[Agent and worker execution]
  execution --> candidate[MemoryProposal]
  candidate --> validate[Validate provenance value sensitivity]
  validate -->|accepted| canonical[SQLite canonical record]
  canonical --> index[Full-text and vector projections]
  validate -->|rejected| discard[No durable write]
~~~

### D5 - Tool approval and trusted execution

~~~mermaid
flowchart LR
  agent[Agent or recipe] --> proposal[ToolProposal]
  proposal --> schema[Schema and target validation]
  schema --> policy[Policy evaluation]
  policy -->|denied| denied[Typed denial]
  policy -->|approval needed| approval[ApprovalRequest]
  approval -->|approved and unexpired| request[ExecutionRequest]
  policy -->|allowed| request
  request --> gateway[Python policy and execution gateway]
  gateway --> adapter[Python tool or Tauri command]
  adapter --> receipt[ExecutionReceipt]
  receipt --> reconcile[Worker reconciliation]
  reconcile --> graph[Main graph]
~~~

### D6 - Persistence relationships

~~~mermaid
erDiagram
  SESSION ||--o{ REQUEST : contains
  REQUEST ||--o{ TASK : creates
  TASK ||--o{ AGENT_RUN : invokes
  AGENT_RUN ||--o{ AGENT_STEP : records
  TASK ||--o{ TOOL_PROPOSAL : proposes
  TOOL_PROPOSAL ||--o| APPROVAL_REQUEST : requires
  TOOL_PROPOSAL ||--o| TOOL_EXECUTION : becomes
  TOOL_EXECUTION ||--|| EXECUTION_RECEIPT : yields
  REQUEST ||--o{ MEMORY_PROPOSAL : produces
  MEMORY_PROPOSAL ||--o| MEMORY : writes
  MEMORY ||--o{ MEMORY_SOURCE : cites
  MEMORY ||--o{ MEMORY_EMBEDDING : indexes
  REQUEST ||--o{ KNOWLEDGE_ARTIFACT : creates
  MEMORY_SOURCE }o--|| KNOWLEDGE_ARTIFACT : references
  REQUEST ||--o{ GRAPH_CHECKPOINT : checkpoints
  GRAPH_CHECKPOINT ||--o{ CHECKPOINT_WRITE : contains
~~~

