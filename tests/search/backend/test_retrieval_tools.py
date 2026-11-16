"""The future agent boundary works without a model, browser, or live service."""

import asyncio
import json

import pytest
from pydantic import ValidationError

from search.errors import RetrievalError
from search.models import (
    FetchPageToolRequest, FetchPageToolResponse, PageContent, SearchErrorCode,
    SearchWebToolRequest, SearchWebToolResponse, WebSearchRequest,
)
from search.tools import RetrievalTools, tool_definitions


class FixtureService:
    def __init__(self, fixtures):
        self.fixtures = fixtures
        self.calls = []

    async def search_web(self, request):
        self.calls.append(request)
        data = json.loads((self.fixtures / "web.json").read_text())
        return SearchWebToolResponse(
            request_id="fixture", query=request.query, warnings=[], duration_ms=0,
            results=data["results"][:request.limit], page={"has_more": False},
        )

    async def fetch_page(self, request):
        self.calls.append(request)
        return FetchPageToolResponse(
            request_id="fixture", warnings=[], duration_ms=0,
            article=PageContent(id="fixture", title="Fixture", url=request.url,
                                original_url=request.url, final_url="https://example.org/final",
                                text="External source text.", truncated=False),
        )


@pytest.mark.parametrize("limit", [0, 11, True, "5", 1.5])
def test_tool_limits_are_strict(limit):
    with pytest.raises(ValidationError):
        SearchWebToolRequest(query="news", limit=limit)


def test_tool_contract_does_not_change_broader_search_defaults():
    assert SearchWebToolRequest(query=" news ").limit == 5
    assert SearchWebToolRequest(query=" news ").query == "news"
    assert WebSearchRequest(query="news").limit == 10
    assert WebSearchRequest(query="news", limit=20).limit == 20


@pytest.mark.parametrize("payload", [{"query": " "}, {"query": "x" * 501},
                                      {"query": "news", "engine": "google"}])
def test_invalid_search_contract(payload):
    with pytest.raises(ValidationError):
        SearchWebToolRequest.model_validate(payload)


def test_page_contract_bounds_and_source_identity():
    payload = dict(id="page", title="Page", url="https://example.org/",
                   original_url="https://example.org/", final_url="https://example.org/final",
                   text="x", truncated=False)
    PageContent(**payload)
    for change in ({"text": "x" * 30_001}, {"original_url": "https://other.example/"}):
        with pytest.raises(ValidationError):
            PageContent(**(payload | change))
    with pytest.raises(ValidationError):
        FetchPageToolRequest(url="file:///etc/passwd")


async def test_tools_validate_before_service_and_retain_sources(provider_fixtures):
    service = FixtureService(provider_fixtures)
    tools = RetrievalTools(service)
    invalid = await tools.search_web("query", limit=11)
    assert invalid.error.code == SearchErrorCode.INVALID_REQUEST
    assert service.calls == []
    found = await tools.search_web(" news ", limit=1)
    assert len(found.results) == 1
    assert found.query == "news"
    page = await tools.fetch_page(str(found.results[0].url))
    assert page.article.original_url == found.results[0].url
    assert page.article.final_url != page.article.original_url
    assert page.article.truncated is False


async def test_domain_errors_are_structured_and_cancellation_propagates():
    class FailingService:
        async def search_web(self, request):
            raise RetrievalError(SearchErrorCode.SEARCH_BLOCKED, "Search is blocked.")

        async def fetch_page(self, request):
            raise asyncio.CancelledError()

    tools = RetrievalTools(FailingService())
    assert (await tools.search_web("news")).error.code == SearchErrorCode.SEARCH_BLOCKED
    with pytest.raises(asyncio.CancelledError):
        await tools.fetch_page("https://example.org/")


def test_definitions_expose_stable_names_and_untrusted_content():
    definitions = tool_definitions()
    assert [tool["name"] for tool in definitions] == ["search_web", "fetch_page"]
    assert definitions[0]["parameters"]["properties"]["limit"]["maximum"] == 10
    assert all(tool["content_trust"] == "untrusted_external_data" for tool in definitions)


async def test_unexpected_service_errors_do_not_expose_internals():
    class BrokenService:
        async def search_web(self, request):
            raise RuntimeError("secret key and internal URL")
        async def fetch_page(self, request):
            return {"invalid": "internal content"}

    tools = RetrievalTools(BrokenService())
    result = await tools.search_web("news")
    assert result.error.code == SearchErrorCode.SERVICE_UNAVAILABLE
    assert "secret" not in result.model_dump_json()
    result = await tools.fetch_page("https://example.org/")
    assert result.error.code == SearchErrorCode.EXTRACTION_FAILED


async def test_service_cannot_return_more_than_requested(provider_fixtures):
    class OversizedService(FixtureService):
        async def search_web(self, request):
            result = await super().search_web(request)
            return result.model_copy(update={"results": result.results * 2})

    result = await RetrievalTools(OversizedService(provider_fixtures)).search_web("news", 1)
    assert result.error.code == SearchErrorCode.PROVIDER_FAILURE


async def test_existing_registry_delegates_to_retrieval_service(provider_fixtures):
    from agent.tools import RetrievalToolRegistry
    service = FixtureService(provider_fixtures)
    registry = RetrievalToolRegistry(service)
    results = await registry.web.search_web("news", limit=1)
    assert len(results.results) == 1
    page = await registry.web.fetch_page(str(results.results[0].url))
    assert page.article.text == "External source text."
    legacy = await registry.web.fetch_article(str(results.results[0].url))
    assert legacy.article == page.article
    assert [item["name"] for item in registry.retrieval_definitions()] == ["search_web", "fetch_page"]
