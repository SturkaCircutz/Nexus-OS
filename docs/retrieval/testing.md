# Verification, packaging, and commit scope

## Test commands

Activate the backend environment described in [the quick start](README.md). From the
repository root:

```bash
python scripts/generate-search-contracts.py --check
python scripts/validate-search-contracts.py
python -m pytest
python -m pytest -m browser --run-browser
```

Default tests are offline, deterministic, and do not launch Chromium. Browser-marked
tests are opt-in and use real Chromium with local fixtures. They cover storage
isolation, cleanup, cancellation, restart, network denial, JavaScript rendering,
search parsing, and the authenticated fixture API flow. Python socket guards alone
cannot constrain a Chromium process; browser tests also exercise the broker/deny proxy.

For the combined backend/generated-contract/frontend checks, install Node.js 20.19+
(or a compatible newer version) and run:

```bash
npm ci
npm test
```

The frontend checks validate generated result contracts and the merged shell tests.
The updated shell from main supplies the missing entry point; `npm run build`
checks its production bundle. There is no new search UI
in the desktop shell. Swagger is the interactive test surface for this implementation.

The CLI examples in the quick start are manual demos. A real public-page request is
an opt-in live check and is never part of default tests. Live Google has not been
validated; synthetic fixtures are not proof of current Google compatibility.

## Local verification recorded 2026-11-10

On macOS ARM64 with Python 3.12.6:

- Generated contracts and 15 JSON examples validated.
- Default backend suite: 145 passed, 7 browser tests skipped intentionally.
- Opt-in Chromium suite: all 7 passed.
- Frontend contract suite: all 3 passed.
- `pip check` and `git diff --check` passed.
- Source and packaged HTTP servers both passed health, authenticated tool discovery,
  fixture search, JavaScript-rendered browse, OpenAPI, and graceful shutdown checks.
- The macOS native package passed its offline self-test from outside the checkout;
  the packaged HTTP demo also ran without Python or Node on PATH.
- Live page retrieval from `https://www.python.org/about/` returned extracted text.

Two dependency deprecation warnings remain in Starlette's test dependencies.
At that checkpoint the desktop build lacked `index.html`; the subsequent main merge
supplied the shell entry point. See the merge verification below for current results.
Windows and live Google validation have not been performed.

## Native package

Build on the target OS with Python 3.12; cross-compilation is rejected:

```powershell
python -m pip install -r apps/engine/backend/requirements-build.txt
python scripts/build-sidecar.py --target windows-x64
```

On Apple Silicon, use `--target macos-arm64`. The output is
`dist/sidecar/<target>/nexus-engine/`. Distribute the **whole directory**, including
`_internal`, not just the executable. Chromium is copied intact after freezing to
preserve its native layout and vendor binaries. Build-time downloads are expected;
startup does not require Python, Node, or Chrome on PATH or a browser download.

The build runs `nexus-engine --self-test` from a temporary directory with the developer
browser cache disabled, then writes `build-manifest.json` only on success. The smoke
checks browser startup, worker extraction, cleanup, and API/tool initialization.
The launcher supports `--port` and the same environment variables as source execution.

The manual [Windows workflow](../../.github/workflows/retrieval-windows.yml) builds on
Windows Server 2022 x64, runs tests, uploads the package, and verifies it on a fresh
runner without Python on PATH. The workflow must be available on GitHub to run.
Windows 11 desktop acceptance, signing, Tauri resource integration, and MSI creation
remain separate release work. The current Tauri configuration is still a scaffold.

## Expected failures

| Symptom | Check |
| --- | --- |
| 401 | Set the Authorization bearer token to the startup value of `NEXUS_API_TOKEN` |
| 503 on retrieval routes | Set `NEXUS_API_TOKEN`; check browser installation if the code is `browser_unavailable` |
| `search_blocked` in live mode | Expected while live Google access is disabled; use fixture mode for the full demo |
| 415 in fixture mode | Choose a result URL returned by the fixture search; arbitrary URLs cannot be fetched |
| Missing browser executable | Run `python -m playwright install chromium --no-shell` in the correct environment |
| Port 8000 already used | Stop the other process or launch with `--port 8001`; use that port in Swagger/curl |
| Empty/unreadable page | Some pages need unsupported session state, POST APIs, or additional rendering time |
| Swagger assets do not load | Its assets use a CDN; use curl or the standalone offline fixture demo |

## Commit contents and exclusions

Include retrieval backend modules, the existing registry integration, API/worker
launcher changes, pinned dependency files, generated schemas/types, fixture examples,
CLI/build scripts, tests/test configuration, the Windows workflow, and these docs.
The removed `docs/search/` files belonged to the superseded architecture; the current
handoff lives in `docs/retrieval/`.

Frontend test-runner and dependency updates are grouped in a separate commit.
They are used by `npm test` and should be reviewed together with the lockfile.

Do not commit virtual environments, node_modules, browser downloads, native packages,
PyInstaller caches, logs, or real tokens. Build outputs under `build/` and `dist/`
are ignored. `git diff --check` and the commands above are the local commit checks.

This is a testable retrieval/API milestone, not a claim that live Google, Windows,
the full AI agent, or the Tauri installer is production-ready.

## Main-branch merge verification — 2026-11-11

Integrated `origin/main` at `7a5fb07`, preserving AI-Core runs/WebSocket routes
and its canonical tool registry. Retrieval discovery is now `/api/v1/web/tools`;
`/api/v1/tools` keeps the AI-Core contract. Retrieval uses `RetrievalToolRegistry`.
Pydantic is pinned to 2.7.4 to satisfy LangGraph dependencies on Python 3.12.

- `npm test`: 146 retrieval/backend tests, 65 AI-Core systems tests, and 56 frontend tests passed.
- Opt-in real-Chromium suite: 7 passed.
- `npm run build`: production frontend bundle passed; main supplied the missing entry point.
- `pip check`, generated contracts, and merge-resolution whitespace checks against `origin/main` passed.
  The full incoming diff contains pre-existing whitespace warnings in AI-Core docs/PDF;
  those upstream files were preserved.
- Rebuilt macOS ARM64 package passed its offline self-test.
- Source and packaged servers completed AI-Core diagnostics, fixture search,
  JavaScript-rendered browse, health/discovery/OpenAPI, and graceful shutdown checks.
- Windows execution and live Google compatibility remain unverified.

The root test runner and Windows workflow now include the AI-Core systems suite.
