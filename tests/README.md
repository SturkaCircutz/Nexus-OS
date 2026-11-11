# Tests

| Suite | Location | Purpose |
|-------|----------|---------|
| bench | `tests/bench/` | LLM tool-calling benchmark suites |
| systems | `tests/systems/` | AI-Core contracts/policy/gateway/graphs suite |
| vision | `tests/vision/` | Gesture classification evaluations |

## Search & Discover

Search & Discover backend tests live under `tests/search/backend/`. Provider and article fixtures live under `tests/search/fixtures/`.

Run the complete offline Search & Discover workflow from the repository root:

```bash
npm test
```

## How to Run
Search & Discover now uses pytest, FastAPI's in-process test client, Vitest, React Testing Library, and JSDOM. AI-Core systems tests run separately with `python -m pytest tests/systems -q` from the repository root using the backend environment.

See the [retrieval testing guide](../docs/retrieval/testing.md) for dependency setup, opt-in Chromium tests, API checks, and native packaging.
