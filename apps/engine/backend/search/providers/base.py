"""Provider boundary shared by mock and production search adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Generic, TypeVar

from search.models import (
    ImageSearchRequest,
    ImageSearchResult,
    VideoSearchRequest,
    VideoSearchResult,
    WebSearchRequest,
    WebSearchResult,
)

ResultT = TypeVar(
    "ResultT",
    WebSearchResult,
    ImageSearchResult,
    VideoSearchResult,
)


@dataclass(frozen=True, slots=True)
class ProviderPage(Generic[ResultT]):
    results: tuple[ResultT, ...]
    next_cursor: str | None = None
    has_more: bool = False


class SearchProviderError(RuntimeError):
    """Base class for failures produced at the provider boundary."""


class ProviderTimeoutError(SearchProviderError):
    pass


class ProviderRateLimitError(SearchProviderError):
    def __init__(self, message: str, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class MalformedProviderResponseError(SearchProviderError):
    pass


class SearchProvider(ABC):
    """Provider-neutral interface implemented by every search adapter."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the internal adapter name used for diagnostics."""

    @abstractmethod
    async def search_web(
        self,
        request: WebSearchRequest,
    ) -> ProviderPage[WebSearchResult]:
        """Return normalized web results."""

    @abstractmethod
    async def search_images(
        self,
        request: ImageSearchRequest,
    ) -> ProviderPage[ImageSearchResult]:
        """Return normalized image results."""

    @abstractmethod
    async def search_videos(
        self,
        request: VideoSearchRequest,
    ) -> ProviderPage[VideoSearchResult]:
        """Return normalized video results."""
