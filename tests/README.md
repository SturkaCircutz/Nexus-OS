# Tests

| Suite | Location | Purpose |
|-------|----------|---------|
| bench | `tests/bench/` | LLM tool-calling benchmark suites |
| systems | `tests/systems/` | AI-Core contracts/policy/gateway/graphs suite |
| vision | `tests/vision/` | Gesture classification evaluations |

## How to Run
From the repo root:
- Rust: `cargo test`
- Python (engine AI-Core systems tests): `cd apps/engine/backend && .\.venv\Scripts\python.exe -m pytest ..\..\..\tests\systems -q`
- TS: `vitest`
