"""Validate examples and generated Search & Discover contract artifacts."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from pydantic import ValidationError

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "apps" / "engine" / "backend"
EXAMPLES_ROOT = REPO_ROOT / "modules" / "search" / "examples"

sys.path.insert(0, str(BACKEND_ROOT))

from search.models import (  # noqa: E402
    ArticleFetchRequest,
    ArticleFetchResponse,
    ImageSearchRequest,
    ImageSearchResponse,
    MixedSearchRequest,
    MixedSearchResponse,
    SearchErrorResponse,
    VideoSearchRequest,
    VideoSearchResponse,
    WebSearchRequest,
    WebSearchResponse,
    WebSearchResult,
    SearchWebToolRequest,
    SearchWebToolResponse,
    FetchPageToolRequest,
    FetchPageToolResponse,
)

EXAMPLES = {
    "search-web-tool-request.json": SearchWebToolRequest,
    "search-web-tool-response.json": SearchWebToolResponse,
    "fetch-page-tool-request.json": FetchPageToolRequest,
    "fetch-page-tool-response.json": FetchPageToolResponse,
    "web-search-request.json": WebSearchRequest,
    "image-search-request.json": ImageSearchRequest,
    "video-search-request.json": VideoSearchRequest,
    "mixed-search-request.json": MixedSearchRequest,
    "article-fetch-request.json": ArticleFetchRequest,
    "web-search-response.json": WebSearchResponse,
    "image-search-response.json": ImageSearchResponse,
    "video-search-response.json": VideoSearchResponse,
    "mixed-search-partial-response.json": MixedSearchResponse,
    "article-fetch-response.json": ArticleFetchResponse,
    "error-response.json": SearchErrorResponse,
}


def validate_examples() -> None:
    for filename, model in EXAMPLES.items():
        path = EXAMPLES_ROOT / filename
        model.model_validate_json(path.read_text(encoding="utf-8"))
        print(f"valid example: {path.relative_to(REPO_ROOT)}")


def require_validation_error(label: str, model: type, payload: dict) -> None:
    try:
        model.model_validate(payload)
    except ValidationError:
        print(f"valid rejection: {label}")
        return
    raise AssertionError(f"expected validation failure: {label}")


def validate_contract_guards() -> None:
    require_validation_error(
        "result discriminator is required",
        WebSearchResult,
        {
            "id": "web_missing_kind",
            "title": "Missing kind",
            "url": "https://example.com/missing-kind",
            "source_name": "Example",
            "snippet": "",
        },
    )
    require_validation_error(
        "mixed result kinds are unique",
        MixedSearchRequest,
        {"query": "duplicate kinds", "kinds": ["web", "web"]},
    )
    require_validation_error(
        "unknown fields are rejected",
        WebSearchRequest,
        {"query": "unexpected data", "provider_api_key": "must-not-pass"},
    )
    require_validation_error(
        "query length is bounded",
        WebSearchRequest,
        {"query": "x" * 501},
    )


def validate_generated_artifacts() -> None:
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "generate-search-contracts.py"), "--check"],
        cwd=REPO_ROOT,
        check=True,
    )


def main() -> int:
    validate_examples()
    validate_contract_guards()
    validate_generated_artifacts()
    print(f"validated {len(EXAMPLES)} examples and generated contract artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
