# NEXUS Python engine

The backend contains implemented retrieval tools and a FastAPI retrieval API alongside
older agent/window scaffolding. It uses Python 3.12, Pydantic, aiohttp, Trafilatura,
Playwright, and headless Chromium. Retrieval does not require an AI model.

Start with the [retrieval quick start](../../../docs/retrieval/README.md). It explains
how to install dependencies, launch a fixture API, open Swagger, and run a complete
search → select → read demonstration.

- [API endpoints, authentication, schemas, and agent integration](../../../docs/retrieval/api.md)
- [Architecture, network controls, budgets, and ownership](../../../docs/retrieval/architecture.md)
- [Tests, packaging, and troubleshooting](../../../docs/retrieval/testing.md)

## HTTP surface

| Route | Status |
| --- | --- |
| `GET /health`, `GET /api/v1/health` | Process health |
| `GET /api/v1/tools` | Authenticated retrieval tool discovery and runtime mode |
| `POST /api/v1/web/search` | Authenticated browser search; fixtures available, live Google disabled by default |
| `POST /api/v1/web/browse` | Authenticated `fetch_page` retrieval |
| `GET /docs`, `GET /openapi.json` | Interactive and machine-readable API reference |
| `POST /desktop/state`, `POST /agent/invoke` | Legacy scaffolding; not a completed agent integration |

`launcher.py` binds to loopback and supports `--port`, `--self-test`, and packaged
worker startup. `main.py` remains a compatible development entry point on port 8000.
`NEXUS_API_TOKEN` is required for retrieval HTTP requests. CLI and in-process Python
calls do not require an HTTP token.

## Code map

- `search/`: contracts, services, network controls, browser adapters, extraction, API, and fixture mode.
- `agent/tools/`: the existing registry delegates web calls to retrieval services.
- `agent/loop.py`: existing planning scaffold; reasoning/execution orchestration is separate work.
- `runtime.py`, `launcher.py`: source and native-package entry points.
- `requirements.txt`: runtime dependencies.
- `requirements-dev.txt`: offline test dependencies.
- `requirements-build.txt`: native packaging dependencies.

The canonical models are in `search/models.py`. Regenerate JSON Schema and TypeScript
with `python scripts/generate-search-contracts.py` from the repository root after
changing them. Do not edit generated artifacts by hand.
