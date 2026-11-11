# Tests

| Suite | Location | Purpose |
|-------|----------|---------|
| bench | `tests/bench/` | LLM tool-calling benchmark suites |
| systems | `tests/systems/` | Win32 window hooking unit tests |
| vision | `tests/vision/` | Gesture classification evaluations |

## Search & Discover

Search & Discover backend tests live under `tests/search/backend/`. Provider and article fixtures live under `tests/search/fixtures/`.

Run the complete offline Search & Discover workflow from the repository root:

```bash
npm test
```

## How to Run
Search & Discover now uses pytest, FastAPI's in-process test client, Vitest, React Testing Library, and JSDOM. Rust, systems, vision, and broader shell suites still need dedicated runners.

See the [retrieval testing guide](../docs/retrieval/testing.md) for dependency setup, opt-in Chromium tests, API checks, and native packaging.
