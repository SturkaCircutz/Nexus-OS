# Retrieval tools: run and inspect

NEXUS now has two Python retrieval tools and a versioned HTTP API. `search_web`
finds source links through a browser adapter; `fetch_page` reads a public page,
using headless Chromium when HTML extraction requires JavaScript rendering.
The AI agent, chat interface, and Tauri integration are separate workstreams.

The fastest complete demonstration uses **synthetic fixtures with real Chromium**.
Live page retrieval works separately. Live Google search is disabled by default
and has not been validated against Google's current result layout.

## Start the interactive API

Use Python 3.12. Run these commands from the repository root.

### macOS / Linux

```bash
python3.12 -m venv apps/engine/backend/.venv
source apps/engine/backend/.venv/bin/activate
python -m pip install -r apps/engine/backend/requirements-dev.txt
python -m playwright install chromium --no-shell
export NEXUS_RETRIEVAL_MODE=fixtures
export NEXUS_API_TOKEN=nexus-local-demo-token
python apps/engine/backend/launcher.py --port 8000
```

### Windows PowerShell

```powershell
py -3.12 -m venv apps/engine/backend/.venv
.\apps\engine\backend\.venv\Scripts\Activate.ps1
python -m pip install -r apps/engine/backend/requirements-dev.txt
python -m playwright install chromium --no-shell
$env:NEXUS_RETRIEVAL_MODE = 'fixtures'
$env:NEXUS_API_TOKEN = 'nexus-local-demo-token'
python apps/engine/backend/launcher.py --port 8000
```

If the environment already exists, reuse it. The example token is for local testing;
choose a fresh private token for an integration session. Environment variables are
read when the server starts. Restart after changing them. The launcher binds only
to `127.0.0.1` and does not enable CORS.

Open [Swagger UI](http://127.0.0.1:8000/docs). Its JavaScript assets are loaded from
a CDN; the CLI demo below works without those browser assets after installation.

1. Click **Authorize**, paste `nexus-local-demo-token` (without `Bearer`), and close the dialog.
2. Try `GET /api/v1/tools`. It should report `mode: "fixtures"` and list two tools.
3. Try `POST /api/v1/web/search` with `{"query":"desktop retrieval","limit":2}`.
4. Copy a result URL into `POST /api/v1/web/browse`, for example `{"url":"https://example.org/article"}`.
5. Inspect the returned article text, original/final URLs, and `fixture_data` warning.

Expected fixture results include **Desktop Retrieval Research** and **Retrieval Guide**.
The article contains “JavaScript can populate article text”. Chromium stays hidden;
Swagger shows the resulting JSON. Stop the server with Ctrl+C.

## Test with curl

With the fixture server running:

```bash
curl -sS http://127.0.0.1:8000/api/v1/tools \
  -H 'Authorization: Bearer nexus-local-demo-token'

curl -sS http://127.0.0.1:8000/api/v1/web/search \
  -H 'Authorization: Bearer nexus-local-demo-token' \
  -H 'Content-Type: application/json' \
  -d '{"query":"desktop retrieval","limit":2}'

curl -sS http://127.0.0.1:8000/api/v1/web/browse \
  -H 'Authorization: Bearer nexus-local-demo-token' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.org/article"}'
```

PowerShell users can use Swagger or `Invoke-RestMethod`:

```powershell
$headers = @{ Authorization = 'Bearer nexus-local-demo-token' }
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/web/search `
  -Headers $headers -ContentType application/json `
  -Body '{"query":"desktop retrieval","limit":2}' | ConvertTo-Json -Depth 10
```

## Test a real public page

Stop the server, set `NEXUS_RETRIEVAL_MODE=live`, and start it again. Call
`POST /api/v1/web/browse` with `{"url":"https://www.python.org/about/"}`. This performs
real network retrieval; source content and timing can change. There should be no
`fixture_data` warning. Search still returns `403 search_blocked` unless separately enabled.

Alternatively, from the repository root with the virtual environment active:

```bash
python scripts/fetch-page.py https://www.python.org/about/
```

## Run the full flow without an HTTP server

```bash
python scripts/retrieval-demo.py "desktop retrieval" --fixtures --select 1
```

Omit `--select` to select a result interactively. The fixture demo uses saved content,
never falls back to live requests, and prints an explicit fixture banner. It needs
Chromium but no AI model, account login, or search API key.

## Implementation status

| Capability | Status |
| --- | --- |
| Python tools, schemas, errors, registry integration | Implemented |
| Authenticated retrieval API and Swagger | Implemented |
| Public-only HTTP page retrieval and text extraction | Implemented; public-page smoke checks performed |
| Managed Chromium and filtered JavaScript rendering | Implemented; local integration tests and a public-page rendering check performed |
| Google result parser and adapter | Implemented against synthetic fixtures; live compatibility unverified |
| Agent reasoning, confirmation, run streaming, chat UI | Outside this change; existing agent routes are scaffolding |
| Native backend package | macOS ARM64 package smoke-tested |
| Windows CI/package and Tauri MSI | Workflow prepared; Windows execution and Tauri integration remain pending |

## Documentation for other teams

- [HTTP API and Python integration](api.md)
- [Architecture, ownership, and limitations](architecture.md)
- [Tests, packaging, and commit scope](testing.md)
- [Canonical Pydantic contracts](../../apps/engine/backend/search/models.py)
- [Generated JSON Schema](../../modules/search/search-contract.schema.json)
- [Generated TypeScript types](../../apps/shell/frontend/src/types/search.ts)
