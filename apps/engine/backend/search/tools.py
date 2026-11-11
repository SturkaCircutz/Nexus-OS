"""Framework-independent tool boundary. Services are supplied by the caller."""

from typing import Protocol

from pydantic import ValidationError

from search.errors import RetrievalError
from search.models import (
    FetchPageToolRequest, FetchPageToolResponse, SearchErrorCode,
    SearchErrorResponse, SearchWebToolRequest, SearchWebToolResponse,
)


class RetrievalService(Protocol):
    async def search_web(self, request: SearchWebToolRequest) -> SearchWebToolResponse: ...

    async def fetch_page(self, request: FetchPageToolRequest) -> FetchPageToolResponse: ...


def tool_definitions() -> list[dict]:
    """Input/output contracts; external text is evidence, never instructions."""
    return [
        {
            "name": name,
            "description": description,
            "parameters": request.model_json_schema(),
            "result_schema": response.model_json_schema(),
            "error_schema": SearchErrorResponse.model_json_schema(),
            "content_trust": "untrusted_external_data",
        }
        for name, description, request, response in (
            ("search_web", "Find public webpages and return source URLs and snippets.",
             SearchWebToolRequest, SearchWebToolResponse),
            ("fetch_page", "Read a public webpage and return bounded text and source metadata.",
             FetchPageToolRequest, FetchPageToolResponse),
        )
    ]


class RetrievalTools:
    def __init__(self, service: RetrievalService):
        self.service = service

    async def search_web(self, query: str, limit: int = 5) -> SearchWebToolResponse | SearchErrorResponse:
        try:
            request = SearchWebToolRequest(query=query, limit=limit)
        except ValidationError:
            return RetrievalError(SearchErrorCode.INVALID_REQUEST, "Invalid search query or limit.").response()
        try:
            result = await self.service.search_web(request)
            result = SearchWebToolResponse.model_validate(result)
            if len(result.results) > request.limit:
                raise RetrievalError(SearchErrorCode.PROVIDER_FAILURE, "Search exceeded the requested limit.")
            return result
        except RetrievalError as exc:
            return exc.response()
        except ValidationError:
            return RetrievalError(SearchErrorCode.PROVIDER_FAILURE, "Invalid search response.").response()
        except Exception:
            return RetrievalError(SearchErrorCode.SERVICE_UNAVAILABLE, "Search service failed.", retryable=True).response()

    async def fetch_page(self, url: str) -> FetchPageToolResponse | SearchErrorResponse:
        try:
            request = FetchPageToolRequest(url=url)
        except ValidationError:
            return RetrievalError(SearchErrorCode.INVALID_REQUEST, "Invalid HTTP/HTTPS URL.").response()
        try:
            result = FetchPageToolResponse.model_validate(await self.service.fetch_page(request))
            if result.article.original_url != request.url:
                raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Page response did not preserve the requested URL.")
            return result
        except RetrievalError as exc:
            return exc.response()
        except ValidationError:
            return RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Invalid page response.").response()
        except Exception:
            return RetrievalError(SearchErrorCode.SERVICE_UNAVAILABLE, "Page service failed.", retryable=True).response()
