# NEXUS AI CORE architecture pack

This is a compact implementation guide for the intelligence and orchestration layer of NEXUS AI CORE. It is designed to be read by a product-minded engineer first and used as a stable reference while the system is built.

## Source and confidence

The supplied brief establishes the architecture's intent, named graph nodes, memory tiers, initial tools, and trust boundaries. It refers to an original diagram, but that image was not included with the available source. The diagrams and wiring in this pack therefore preserve the supplied names and principles while making the smallest practical implementation choices around them. The current repository is `nexus-os`: Python owns backend authority, agent logic, policy, memory, and persistence; Rust/Tauri supplies the desktop shell and performs only typed native window primitives requested through the approved Python path.

| Label | Meaning |
|---|---|
| **Established** | Directly stated in the supplied NEXUS AI CORE brief. |
| **Proposed** | A concrete implementation choice that fits the brief but still needs a team decision. |
| **Open decision** | Intentionally not assumed; choose it before implementation depends on it. |

## Start here

1. Read [01 - General architecture](01-general-architecture.md) for the system shape and authority boundaries.
2. Read [03 - How it works](03-how-it-works.md) for the request, agent, memory, approval, and recovery flows.
3. Use [02 - API and contracts](02-api-and-contracts.md) while implementing modules or reviewing integration points.
4. Use [04 - Implementation rules and roadmap](04-implementation-rules-and-roadmap.md) to sequence work and check non-negotiable rules.
5. Keep [05 - Reference glossary](05-reference-glossary.md) open as the canonical vocabulary, inventory, and Mermaid source.
6. Follow [06 - Extending NEXUS](06-extending-nexus.md) whenever you add a tool, module, or agent.
7. Use [07 - API flow](07-api-flow.md) for the shell ⇄ engine surface: `/api/v1` runs, WebSocket events, `ui.command`, avatar states.

The companion [diagram PDF](NEXUS-AI-CORE-Architecture-Diagrams.pdf) contains six zoomable, vector diagrams:

| ID | Diagram |
|---|---|
| D1 | Overall system and trust boundaries |
| D2 | Main LangGraph execution flow |
| D3 | Agent hierarchy and bounded subgraphs |
| D4 | Memory lifecycle and tiers |
| D5 | Tool approval and trusted execution |
| D6 | Persistence and relationships |

## What this pack commits to

**Established**

- React owns presentation and interaction; Rust/Tauri owns the desktop shell, sidecar lifecycle, and typed Win32 primitives; Python owns backend authority, LangGraph, agents, policy, memory, and persistence.
- LangGraph owns orchestration and state transitions, including the main graph nodes named in the source.
- The Supervisor, Desktop, Discovery, and Knowledge roles are the initial agent hierarchy.
- Agents can propose actions; trusted code authorizes and performs side effects.
- Memory is split into M0 through M5, and the design is local-first.
- The initial capability set includes `system_diagnostics`, `memory_save`, `memory_lookup`, `file_search`, `document_read`, and `document_create`.

**Proposed**

- Use typed JSON envelopes at module boundaries, a SQLite system-of-record, filesystem artifacts, local full-text/vector indexes, and a durable LangGraph checkpoint store.
- Keep model selection behind the Python engine; keep all side effects behind Python policy/gateway checks, with native window primitives crossing `modules/ipc` to the Rust desktop core.
- Treat this pack as the initial implementation target, then revise it through deliberate design decisions rather than quietly changing terms in code.

## Reading rules

- A named term has one meaning. The canonical spelling lives in [05 - Reference glossary](05-reference-glossary.md).
- Contract IDs (`C1` through `C9`) are authoritative in [02 - API and contracts](02-api-and-contracts.md).
- Diagram IDs (`D1` through `D6`) refer to both the PDF and the Mermaid source in [05 - Reference glossary](05-reference-glossary.md).
- A graph may plan, query, and reconcile. It must not silently grant itself desktop, filesystem, network, or account authority.

## Deliberate non-goals for v1

This pack does not assume cloud infrastructure, a paid model provider, a remote database, or a large fleet of prompt-only agents. It also does not prescribe an API framework or a vector-index library. Those are implementation choices, not architectural facts.

