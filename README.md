# NEXUS OS: AI-Native Intelligent Desktop Environment

> **An intent-driven desktop orchestration layer bridging human-computer interaction, multimodal spatial tracking, and agentic desktop control.**

```text
 ╔═══════════════════════════════════════════════════════════════════════════════╗
 ║                                                                             ║
 ║     _   _  ______  __   __ _   _  _____     ____    _____                   ║
 ║    | \ | ||  ____|\ \ / /| | | |/ ____|   / __ \  / ____|                  ║
 ║    |  \| || |__    \ V / | | | || (___   | |  | || (___                    ║
 ║    | . ` ||  __|    > <  | | | | \___ \  | |  | | \___ \                   ║
 ║    | |\  || |____  / . \ | |_| | ____) | | |__| | ____) |                  ║
 ║    |_| \_||______|/_/ \_\ \___/ |_____/   \____/ |_____/                   ║
 ║                                                                             ║
 ║           An Intelligent Context-Aware Multimodal Desktop Shell             ║
 ║                                                                             ║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Executive Overview

Modern desktop interaction remains rigidly application-centric. Users spend disproportionate cognitive bandwidth manually arranging windows, toggling workspaces, launching processes, and switching between siloed tools. Meanwhile, traditional AI assistants run inside sandboxed chat widgets, blind to open windows, monitors, or active system tasks.

**NEXUS OS** resolves this divide. It introduces an intelligent orchestration shell running on top of existing operating systems. Rather than replacing the OS kernel or compositor, NEXUS acts as an intelligent intermediary. It continuously observes desktop topology, intercepts user intent via natural language and hand gestures, and translates those intents into structured tool invocations across internal shell applications and real operating system windows.

---

## Architectural Philosophy

NEXUS OS adheres to three fundamental engineering principles:

- **Unification over Duplication:** Internal shell widgets and external Win32 applications share a single unified `WindowState` abstraction.
- **Constrained Determinism:** Language models do not manipulate screen coordinates through brittle vision clicks; they plan and emit strictly validated schema calls executed by systems-level APIs.
- **Decoupled Engine Responsibilities:** UI rendering, low-level Win32 orchestration, and agentic inference are isolated across separate runtimes connected via type-safe IPC and local HTTP transport.

---

## Modular Structure

Every concern is isolated into its own module. Internal apps live under `apps/shell/frontend/internal-apps/<app>/` with their own `frontend` and `backend` subfolders. Cross-cutting contracts live under `modules/`.

```
nexus-os/
├── apps/
│   ├── shell/                              # React Desktop Frontend (Presentation Shell)
│   │   ├── frontend/
│   │   │   ├── src/
│   │   │   │   ├── shell/                  # Desktop, WidgetGrid, DotField, agent prompt
│   │   │   │   ├── wm/                     # desktop store + snap-grid layout
│   │   │   │   ├── apps/                   # app registry (sizes, aliases, modes)
│   │   │   │   ├── ui/                     # shared ASCII primitives (AsciiFrame, …)
│   │   │   │   ├── theme/                  # light/dark tokens, ThemeProvider
│   │   │   │   ├── hooks/                  # useIPC, useGesture
│   │   │   │   ├── internal-apps/          # internal apps (each: frontend + backend)
│   │   │   │   │   ├── notes/
│   │   │   │   │   │   ├── frontend/       # React widget UI
│   │   │   │   │   │   ├── backend/        # notes logic + storage adapter
│   │   │   │   │   │   └── README.md
│   │   │   │   │   ├── files/
│   │   │   │   │   ├── terminal/
│   │   │   │   │   ├── system-monitor/
│   │   │   │   │   ├── clock/
│   │   │   │   │   ├── timer/
│   │   │   │   │   ├── gallery/
│   │   │   │   │   ├── browser/
│   │   │   │   │   ├── wm/
│   │   │   │   │   ├── settings/
│   │   │   │   │   ├── calc/
│   │   │   │   │   └── calendar/
│   │   │   │   ├── vision/                 # MediaPipe landmark detection
│   │   │   │   ├── types/                  # WindowState, IPC schemas
│   │   │   │   ├── App.tsx
│   │   │   │   └── main.tsx
│   │   │   ├── package.json
│   │   │   ├── vite.config.ts
│   │   │   └── tsconfig.json
│   │   │   └── README.md
│   │   │
│   │   └── README.md
│   │
│   └── engine/                             # Python FastAPI AI Brain
│       ├── backend/
│       │   ├── agent/
│       │   │   ├── tools/                  # window + web discovery tools
│       │   │   ├── memory/                 # short-term buffers
│       │   │   ├── providers/              # Ollama / OpenAI / Anthropic adapters
│       │   │   └── loop.py                 # ReAct execution loop
│       │   ├── schemas/                    # Pydantic I/O schemas
│       │   ├── database/                   # SQLite session management
│       │   └── main.py                     # FastAPI entry point
│       │   ├── requirements.txt
│       │   └── README.md
│       │
│       └── README.md
│
├── src-tauri/                              # Rust Desktop Core (Native Systems Core)
│   ├── src/
│   │   ├── win32/                          # Win32 API hooks & calls
│   │   ├── commands/                       # Tauri commands exposed to frontend
│   │   ├── sidecar.rs                      # FastAPI lifecycle management
│   │   ├── state.rs                        # Live cached desktop topology
│   │   └── main.rs                         # Systems entry point
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── README.md
│
├── modules/                                # Cross-cutting shared modules
│   ├── ipc/                                # Tauri IPC JSON-RPC contract
│   ├── window-state/                       # Unified WindowState abstraction
│   ├── storage/                            # SQLite schema & migrations
│   ├── vision/                             # MediaPipe gesture pipeline
│   ├── config/                             # env vars & feature flags
│   └── README.md
│
├── tests/
│   ├── bench/
│   ├── systems/
│   └── vision/
├── scripts/
│   ├── dev-setup.sh
│   └── build-sidecar.py
├── docs/
│   └── architecture.md
├── .env.example
├── LICENSE
├── package.json                            # root npm workspace
└── README.md
```

### Module Responsibilities

| Module | Role | Tech |
|--------|------|------|
| `apps/shell/frontend` | Desktop canvas, taskbar, widget mounting, gesture/vision pipeline | React 19, TS, Tailwind, Vite, MediaPipe |
| `apps/shell/frontend/internal-apps/*/frontend` | Per-app widget UI | React + TS |
| `apps/shell/frontend/internal-apps/*/backend` | Per-app logic + storage adapter | Python / TS |
| `apps/engine/backend` | ReAct agent loop, tool dispatch, LLM provider routing, memory | Python 3.11, FastAPI, Pydantic v2, Uvicorn, SQLAlchemy |
| `src-tauri` | Win32 window enumeration/hooks, geometry control, sidecar lifecycle | Rust, windows-rs, Tauri v2 |
| `modules/ipc` | Typed JSON-RPC contract between shell ↔ Rust ↔ engine | TS + Rust serde |
| `modules/window-state` | Shared `WindowState` abstraction | TS |
| `modules/storage` | SQLite schema, migrations, session cache | SQL |
| `modules/vision` | MediaPipe landmark/gesture pipeline | MediaPipe Tasks Vision |
| `modules/config` | env loading, feature flags | dotenv |

---

## System Architecture

NEXUS divides responsibilities across four distinct layers:

### 1. Presentation Shell: React + TypeScript
Hosted inside a Tauri webview. Manages the taskbar, widget canvas, z-indexing, window-snapping previews, internal virtual application runtimes, and local camera streams.

### 2. Native Systems Core: Rust + `windows-rs`
Subscribes to Win32 shell hooks to track active processes and window focus. Manipulates process coordinates via `SetWindowPos`, `ShowWindow`, `BringWindowToTop`.

### 3. Agent Intelligence Engine: Python + FastAPI
Headless intelligence sidecar. Ingests desktop state snapshots, grounds prompts, executes tool routing loops, maintains memory, and coordinates information retrieval.

### 4. Storage & Persistence: SQLite
Embedded relational database. Stores layout configurations, user preferences, workspace topologies, and context vectors.

---

## Key Capabilities

### Unified Window Abstraction

Whether targeting an internal React widget or a real external process, the agent interacts with an identical data contract:

```typescript
interface WindowState {
  id: string;
  appId: string;
  title: string;
  mode: 'minimized' | 'windowed' | 'fullscreen';
  x: number;
  y: number;
  width: number;
  height: number;
  workspaceId: string;
  monitor: number;
  focused: boolean;
  zIndex: number;
  isExternal: boolean;
  externalHandle?: string;
}
```

### Constrained Agent Tool Matrix

| Tool | Scope | Args | Operation |
|------|-------|------|-----------|
| `get_desktop_state` | Read | `monitor?` | Returns all monitored windows |
| `open_app` | Execute | `app_name` | Spawns widget or native binary |
| `close_app` | Execute | `window_id` | Closes target window |
| `move_window` | Mutate | `window_id, x, y` | Repositions window |
| `resize_window` | Mutate | `window_id, width, height` | Resizes viewport |
| `set_window_mode` | Mutate | `window_id, mode` | Toggles minimized/windowed/fullscreen |
| `switch_workspace` | Mutate | `workspace_id` | Cycles virtual workspace |
| `search_web` | Network | `query, max_results?` | Retrieves search data |
| `fetch_article` | Network | `url` | Extracts markdown content |
| `persist_workspace`| Storage | `name, layout` | Saves topology to SQLite |

---

## Getting Started

### Prerequisites

1. **OS:** Windows 10/11 (x86_64)
2. **Node.js:** v18+
3. **Rust:** latest stable
4. **Python:** 3.11+
5. **C++ Build Tools:** Visual Studio Build Tools (Desktop development with C++)
6. **Ollama (optional):** running `llama3.1:8b` or `qwen2.5-coder`

### Installation

```powershell
git clone https://github.com/raghavsethi/nexus-os.git
cd nexus-os
```

### 1. Setup Python Agent Engine
```powershell
cd apps/engine/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
cd ..\..
```

### 2. Configure Environment
```powershell
copy .env.example .env
```
Edit `.env` with your API keys and provider choice.

### 3. Install Frontend Dependencies
```powershell
cd apps/shell/frontend
npm install
cd ..\..
```

### 4. Run in Development
```powershell
# Terminal A - engine
cd apps/engine/backend
.\.venv\Scripts\Activate.ps1
python main.py

# Terminal B - shell
cd apps/shell/frontend
npm run dev

# Terminal C - tauri
cd src-tauri
cargo run
```

Or use the setup script:
```powershell
bash scripts/dev-setup.sh
```

---

## Per-Module Documentation

Every module contains its own `README.md` explaining:

- Purpose & responsibilities
- Tech stack
- Folder layout
- How to run / dev commands
- How to add a feature within the module
- IPC / API contracts it exposes
- Testing instructions

Start with:
- `apps/shell/frontend/README.md` — shell widget system
- `apps/engine/backend/README.md` — agent loop & tools
- `src-tauri/README.md` — Rust native core
- `modules/ipc/README.md` — IPC contract
- `apps/shell/frontend/src/internal-apps/notes/README.md` — example internal app

---

## Roadmap

- [x] Phase 0: Core Scaffolding — modular structure, IPC pipes, Rust-FastAPI sidecar coordination, SQLite schemas.
- [x] Phase 1: Shell Implementation — virtual desktop canvas, window snapping, layout persistence.
- [x] Phase 2: Agent Tool Engine — structured ReAct loop, context grounding, provider switching.
- [ ] Phase 3: Deep Information Retrieval — headless web extraction, citation parsing, native media renderers.
- [ ] Phase 4: Multimodal Vision — MediaPipe landmark detection, gesture classification, debouncing pipelines.
- [ ] Phase 5: Native Window Automation — Win32 `SetWinEventHook` state listeners, bidirectional native control.
- [ ] Phase 6: Multi-Platform Expansion — macOS Accessibility and Linux Wayland/Hyprland hooks.

---

## Security & Safety Boundaries

- **No Arbitrary Shell Execution:** The LLM never accesses raw shell environments. It only calls structured, strictly typed tools.
- **Parametric Type Checking:** All tool payloads undergo validation before passing to the Rust layer.
- **Destructive Action Gates:** Destructive operations require explicit user confirmation.
- **Air-Gapped Operation:** In `local` mode, all processing runs on the local machine with zero external network calls.

---

## Contributing

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/module-name`).
3. Commit following [Conventional Commits](https://www.conventionalcommits.org/).
4. Push and open a Pull Request.

Each module must include or update its `README.md` when adding features.
