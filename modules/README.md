# Modules (Cross-Cutting Shared)

## Purpose
Shared contracts, types, schema, vision pipeline, and config consumed by all runtimes (React shell, Rust core, Python engine).

## Modules
| Module | Purpose |
|--------|---------|
| `ipc/` | Typed JSON-RPC command contract |
| `window-state/` | Shared `WindowState` abstraction |
| `storage/` | SQLite schema & migrations |
| `vision/` | MediaPipe gesture pipeline |
| `config/` | Env vars & feature flags |
| `search/` | Generated Search & Discover schemas and validated examples |

## How to Use
Import the TS files into the shell frontend. Mirror the contracts in Rust serde structs and Python Pydantic models.
