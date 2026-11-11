"""Deterministic fixture-backed search provider used by tests and demos."""

from __future__ import annotations

import asyncio
import json
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from search.models import (
    ImageSearchRequest,
    ImageSearchResult,
    SearchResultKind,
    VideoSearchRequest,
    VideoSearchResult,
    WebSearchRequest,
    WebSearchResult,
)
from search.providers.base import (
    MalformedProviderResponseError,
    ProviderPage,
    ProviderRateLimitError,
    ProviderTimeoutError,
    SearchProvider,
)


class MockScenario(str, Enum):
    SUCCESS = "success"
    EMPTY = "empty"
    DUPLICATE = "duplicate"
    MALFORMED = "malformed"
    SLOW = "slow"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"


class MockSearchProvider(SearchProvider):
    """Serve deterministic normalized results from local JSON fixtures."""

    def __init__(
        self,
        fixture_root: Path,
        scenarios: dict[SearchResultKind, MockScenario] | None = None,
    ) -> None:
        self.fixture_root = fixture_root
        self.scenarios = scenarios or {}

    @property
    def name(self) -> str:
        return "mock"

    @classmethod
    def from_scenario_fixture(
        cls,
        fixture_root: Path,
        filename: str,
    ) -> MockSearchProvider:
        payload = cls._read_json(fixture_root / filename)
        scenarios = {
            SearchResultKind(kind): MockScenario(scenario)
            for kind, scenario in payload["scenarios"].items()
        }
        return cls(fixture_root, scenarios)

    async def search_web(
        self,
        request: WebSearchRequest,
    ) -> ProviderPage[WebSearchResult]:
        return await self._search(SearchResultKind.WEB, request.limit, WebSearchResult)

    async def search_images(
        self,
        request: ImageSearchRequest,
    ) -> ProviderPage[ImageSearchResult]:
        return await self._search(SearchResultKind.IMAGE, request.limit, ImageSearchResult)

    async def search_videos(
        self,
        request: VideoSearchRequest,
    ) -> ProviderPage[VideoSearchResult]:
        return await self._search(SearchResultKind.VIDEO, request.limit, VideoSearchResult)

    async def _search(
        self,
        kind: SearchResultKind,
        limit: int,
        model: type[BaseModel],
    ) -> ProviderPage[Any]:
        scenario = self.scenarios.get(kind, MockScenario.SUCCESS)

        if scenario is MockScenario.EMPTY:
            payload = self._read_json(self.fixture_root / "empty.json")
        elif scenario is MockScenario.DUPLICATE:
            payload = self._duplicate_payload(kind)
        elif scenario is MockScenario.MALFORMED:
            payload = self._read_json(self.fixture_root / "malformed.json")
        elif scenario is MockScenario.TIMEOUT:
            payload = self._read_json(self.fixture_root / "timeout.json")
            raise ProviderTimeoutError(payload["message"])
        elif scenario is MockScenario.RATE_LIMIT:
            payload = self._read_json(self.fixture_root / "rate-limit.json")
            raise ProviderRateLimitError(
                payload["message"],
                retry_after_seconds=payload.get("retry_after_seconds"),
            )
        else:
            payload = self._read_json(self.fixture_root / f"{kind.value}.json")

        if scenario is MockScenario.SLOW:
            slow = self._read_json(self.fixture_root / "slow.json")
            await asyncio.sleep(slow["delay_ms"] / 1_000)

        try:
            results = tuple(model.model_validate(item) for item in payload["results"][:limit])
        except (KeyError, TypeError, ValidationError) as exc:
            raise MalformedProviderResponseError(
                f"mock {kind.value} fixture did not match the provider contract"
            ) from exc

        return ProviderPage(
            results=results,
            next_cursor=payload.get("next_cursor"),
            has_more=payload.get("has_more", False),
        )

    def _duplicate_payload(self, kind: SearchResultKind) -> dict[str, Any]:
        if kind is SearchResultKind.WEB:
            return self._read_json(self.fixture_root / "duplicate.json")
        payload = self._read_json(self.fixture_root / f"{kind.value}.json")
        payload["results"] = payload["results"] * 2
        return payload

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))
