"""Retrieval services callable without FastAPI or an AI model."""

import asyncio
from time import monotonic
from uuid import uuid4

from search.errors import RetrievalError
from search.extract import extract_in_worker
from search.http import PublicHttpFetcher
from search.models import FetchPageToolRequest, FetchPageToolResponse, SearchErrorCode, SearchWebToolRequest


class PageRetrievalService:
    def __init__(self, fetcher: PublicHttpFetcher | None = None, *, renderer=None, search_adapter=None):
        self.fetcher = fetcher or PublicHttpFetcher()
        self.renderer = renderer
        self.search_adapter = search_adapter
        self._slots = asyncio.Semaphore(2)

    async def fetch_page(self, request: FetchPageToolRequest) -> FetchPageToolResponse:
        try:
            await asyncio.wait_for(self._slots.acquire(), 10)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.RETRIEVAL_BUSY, "Page retrieval queue is full.", retryable=True) from None
        started = monotonic()
        try:
            async with asyncio.timeout(self.fetcher.limits.total_seconds):
                download = await self.fetcher.fetch(str(request.url))
                try:
                    article = await extract_in_worker(download)
                except RetrievalError as exc:
                    if exc.detail.code != SearchErrorCode.EXTRACTION_FAILED or self.renderer is None:
                        raise
                    # Never retry access denials, unsafe URLs, size failures or
                    # timeouts through another transport.
                    rendered = await self.renderer.render(str(request.url))
                    article = await extract_in_worker(rendered)
                return FetchPageToolResponse(request_id=uuid4().hex, article=article,
                                             warnings=[], duration_ms=int((monotonic() - started) * 1000))
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.FETCH_TIMEOUT, "Page retrieval timed out.", retryable=True) from None
        finally:
            self._slots.release()

    async def search_web(self, request: SearchWebToolRequest):
        if self.search_adapter is None:
            raise RetrievalError(SearchErrorCode.SERVICE_UNAVAILABLE, "Browser search adapter is not configured.")
        try:
            await asyncio.wait_for(self._slots.acquire(), 10)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.RETRIEVAL_BUSY, "Search queue is full.", retryable=True) from None
        try:
            async with asyncio.timeout(45):
                return await self.search_adapter.search(request)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.BROWSER_TIMEOUT, "Search timed out.", retryable=True) from None
        finally:
            self._slots.release()
