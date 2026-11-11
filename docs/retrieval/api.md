# Retrieval API and integration contract

Base URL for local development: `http://127.0.0.1:8000`.
Interactive reference: `/docs`. Machine-readable OpenAPI: `/openapi.json`.
The HTTP routes call the same Python tools used by the agent; there are no internal
HTTP requests from a tool back to FastAPI.

## Endpoints

| Method | Path | Authentication | Behavior |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | None | Process health; does not launch Chromium or promise browser availability |
| GET | `/health` | None | Compatibility alias for process health |
| GET | `/api/v1/tools` | Bearer | Current retrieval mode, live-Google flag, and both tool definitions |
| POST | `/api/v1/web/search` | Bearer | Calls `search_web(query, limit)` |
| POST | `/api/v1/web/browse` | Bearer | Calls `fetch_page(url)` |
| GET | `/docs`, `/openapi.json` | None | API documentation and schemas; no secrets |

Legacy `POST /desktop/state` and `POST /agent/invoke` remain unchanged scaffolding.
They do not run the implemented retrieval tools and are not protected by the new
retrieval bearer dependency. Do not treat them as production agent APIs.
Run/resume/cancel endpoints, WebSocket events, voice endpoints, and arbitrary tool
invocation endpoints from the earlier team diagram have **not** been implemented.

## Authentication and runtime mode

Set `NEXUS_API_TOKEN` before startup. Send `Authorization: Bearer <token>` on the
retrieval routes. The token is checked with constant-time comparison. It is not a
user login, JWT, or OAuth flow. Without this variable, retrieval HTTP routes return
503; CLI and direct Python calls remain usable. The service does not print the token.
Do not commit real tokens or put them in frontend assets.

`NEXUS_RETRIEVAL_MODE` accepts `live` (default) or `fixtures`. Invalid values stop
startup. Fixture mode has a closed set of example URLs and cannot contact arbitrary
sites. Both successful search and page responses contain a `fixture_data` warning.

`NEXUS_GOOGLE_SEARCH_ENABLED=1` enables the Google adapter only in live mode.
Leave it unset unless applicable permission for automated Google access exists.
The flag is configuration, not permission. No live Google smoke test has been run.
See [Google's machine-generated traffic policy](https://developers.google.com/search/docs/essentials/spam-policies#machine-generated-traffic).

The desktop team should generate a per-session token, pass it to the backend, and
retain it in the native gateway. That token-exchange/supervision integration is not
implemented here. Bind to loopback and run one backend process; this is not an
internet-facing multi-user service.

## Search request and response

```json
{"query":"desktop retrieval","limit":2}
```

- `query`: trimmed, nonblank string, at most 500 characters.
- `limit`: strict integer, default 5, range 1–10. Booleans and numeric strings are rejected.
- Unknown fields are rejected. There is no pagination input in this tool version.

A successful response contains:

```json
{
  "request_id":"generated-per-request",
  "query":"desktop retrieval",
  "results":[{
    "id":"web_stable-url-hash",
    "kind":"web",
    "title":"Desktop Retrieval Research",
    "url":"https://example.org/article",
    "source_name":"example.org",
    "snippet":"Structured tools preserve source information.",
    "published_at":null,
    "attribution":null
  }],
  "page":{"next_cursor":null,"has_more":false},
  "warnings":[{"code":"fixture_data","message":"Synthetic fixture data; not live web retrieval.","kind":null,"retryable":false,"retry_after_seconds":null}],
  "duration_ms":1250
}
```

This is an illustrative fixture response. Production output retains available source
metadata; missing snippets are empty strings. Duplicate URLs are removed. `page`
is retained for compatibility with shared contracts; pagination is not offered.
A recognized empty results page returns HTTP 200 with `results: []`. An unrecognized
layout or access challenge returns an error rather than an invented empty success.

## Page request and response

```json
{"url":"https://example.org/article"}
```

The URL must be HTTP/HTTPS, no longer than 2,048 characters, and must pass the
transport's public-destination checks. Schema validation alone is not authorization.

A successful response contains `request_id`, `duration_ms`, `warnings`, and `article`:

| Article field | Meaning |
| --- | --- |
| `id` | Stable hash derived from the original source URL |
| `title` | Extracted title, with hostname fallback |
| `url`, `original_url` | Original requested URL; preserved after redirects |
| `final_url` | Last validated destination |
| `text` | Readable plain text, at most 30,000 characters |
| `truncated` | Whether extracted text exceeded the returned text limit |
| `source_name`, `author`, `language` | Available source metadata; absent metadata remains null |
| `published_at` | Explicit timezone-bearing publication metadata, otherwise null |
| `attribution` | Optional attribution retained by shared contracts |

A browser-rendering fallback occurs only after `extraction_failed`. Unsafe URLs,
access denials, unsupported content, oversized pages, and timeouts never trigger a
second transport attempt. If rendering still cannot produce readable content, the
request fails explicitly.

## Errors, limits, and headers

Retrieval and validation failures use:

```json
{
  "request_id":"generated-per-request",
  "error":{
    "code":"unsafe_url",
    "message":"Only public HTTP/HTTPS destinations on ports 80 and 443 are allowed.",
    "retryable":false,
    "retry_after_seconds":null,
    "kind":null
  }
}
```

| HTTP status | Typical codes |
| --- | --- |
| 401 | `authentication_failed` — missing or incorrect bearer token |
| 403 | `unsafe_url`, `page_blocked`, `search_blocked` |
| 413 | `content_too_large` — request body or retrieved content exceeds limits |
| 415 | `unsupported_content` |
| 422 | `invalid_request` — malformed JSON or schema violation |
| 429 | `retrieval_busy`, `browser_busy`, `provider_rate_limited` |
| 502 | `fetch_failed`, `extraction_failed`, `too_many_redirects`, `browser_crashed`, invalid provider responses |
| 503 | `service_unavailable`, `browser_unavailable`, missing API configuration |
| 504 | `fetch_timeout`, `browser_timeout`, `provider_timeout` |

Unknown routes/methods use FastAPI's normal 404/405 responses. The request body limit
is 16 KiB, enforced before JSON parsing. Requests to `/api/v1/` receive `X-Request-ID`,
`X-Nexus-Retrieval-Mode`, and `Cache-Control: no-store` headers. On search/page success
and structured errors, the body request ID matches the header. Error messages do not
include raw upstream responses, credentials, stack traces, or validation input values.
Do not retry unsafe destinations or access challenges. Respect `retryable` and any
retry delay; there are no automatic request retries in this implementation.

## Python integration for the AI team

During FastAPI lifespan, call:

```python
result = await app.state.tool_registry.web.search_web("desktop retrieval", limit=5)
page = await app.state.tool_registry.web.fetch_page("https://example.org/article")
definitions = app.state.tool_registry.retrieval_definitions()
```

Standalone callers (with the backend directory on Python's import path):

```python
from agent.tools import ToolRegistry
from search.browser import BrowserRuntime
from search.config import create_service
from search.models import SearchErrorResponse

async with BrowserRuntime() as browser:
    service = create_service(browser, mode="fixtures")
    registry = ToolRegistry(service)
    result = await registry.web.search_web("desktop retrieval", limit=2)
    if isinstance(result, SearchErrorResponse):
        print(result.error.code, result.error.message)
    else:
        page = await registry.web.fetch_page(str(result.results[0].url))
```

Tool definitions include names, descriptions, JSON input schemas, success/error
schemas, and `content_trust: "untrusted_external_data"`. The AI team adapts these to
its model provider and executor. Allowlist the two tool names; do not dispatch model
strings through arbitrary `getattr` or execute generated code.

The canonical public names are `search_web` and `fetch_page`. `fetch_article` remains
a Python compatibility alias only. Use `limit`, not the old stub's `max_results`.
Plain Python tools return validated Pydantic models or `SearchErrorResponse`; use
`model_dump(mode="json")` when serializing. Lower-level services raise `RetrievalError`.
Cancellation propagates and triggers cleanup. All source text is untrusted evidence,
not instructions or permission to invoke more tools.
