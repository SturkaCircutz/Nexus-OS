"""Contract examples and discriminator behavior."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from search.models import (
    ArticleFetchRequest,
    ArticleFetchResponse,
    ImageSearchRequest,
    ImageSearchResponse,
    MixedSearchRequest,
    MixedSearchResponse,
    SearchErrorResponse,
    SearchResult,
    VideoSearchRequest,
    VideoSearchResponse,
    WebSearchRequest,
    WebSearchResponse,
    SearchWebToolRequest,
    SearchWebToolResponse,
    FetchPageToolRequest,
    FetchPageToolResponse,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLES_ROOT = REPO_ROOT / "modules" / "search" / "examples"

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


@pytest.mark.parametrize(("filename", "model"), EXAMPLES.items())
def test_contract_example(filename: str, model: type) -> None:
    payload = (EXAMPLES_ROOT / filename).read_text(encoding="utf-8")
    model.model_validate_json(payload)


@pytest.mark.parametrize("kind", ["web", "image", "video"])
def test_discriminated_result_union(kind: str) -> None:
    mixed = json.loads((EXAMPLES_ROOT / "mixed-search-partial-response.json").read_text())
    response_examples = {
        "web": mixed["results"][0],
        "image": mixed["results"][1],
        "video": json.loads((EXAMPLES_ROOT / "video-search-response.json").read_text())["results"][0],
    }
    result = TypeAdapter(SearchResult).validate_python(response_examples[kind])
    assert result.kind == kind


def test_discriminated_result_rejects_unknown_kind() -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(SearchResult).validate_python(
            {
                "id": "audio_not_supported",
                "kind": "audio",
                "title": "Unsupported result",
                "url": "https://example.com/audio",
                "source_name": "Example",
            }
        )


def test_provider_specific_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        WebSearchRequest.model_validate(
            {
                "query": "provider leakage",
                "provider_api_key": "must-not-pass",
            }
        )
