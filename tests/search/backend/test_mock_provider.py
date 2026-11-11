"""Deterministic behavior of the fixture-backed search provider."""

from __future__ import annotations

import socket
from pathlib import Path

import pytest

from search.models import (
    ImageSearchRequest,
    SearchResultKind,
    VideoSearchRequest,
    WebSearchRequest,
)
from search.providers import (
    MalformedProviderResponseError,
    MockScenario,
    MockSearchProvider,
    ProviderRateLimitError,
    ProviderTimeoutError,
    SearchProvider,
)


def provider(
    fixture_root: Path,
    kind: SearchResultKind,
    scenario: MockScenario,
) -> MockSearchProvider:
    return MockSearchProvider(fixture_root, {kind: scenario})


def test_mock_provider_implements_provider_interface(provider_fixtures: Path) -> None:
    assert isinstance(MockSearchProvider(provider_fixtures), SearchProvider)


async def test_success_results_are_normalized(provider_fixtures: Path) -> None:
    mock = MockSearchProvider(provider_fixtures)

    web = await mock.search_web(WebSearchRequest(query="desktop agents"))
    images = await mock.search_images(ImageSearchRequest(query="gesture interface"))
    videos = await mock.search_videos(VideoSearchRequest(query="desktop orchestration"))

    assert [result.kind for result in web.results] == ["web", "web"]
    assert [result.kind for result in images.results] == ["image"]
    assert [result.kind for result in videos.results] == ["video"]
    assert web.next_cursor == "web-fixture-page-2"
    assert web.has_more is True


async def test_result_limit_is_enforced(provider_fixtures: Path) -> None:
    mock = MockSearchProvider(provider_fixtures)
    page = await mock.search_web(WebSearchRequest(query="limited", limit=1))
    assert len(page.results) == 1


async def test_empty_scenario(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.WEB, MockScenario.EMPTY)
    page = await mock.search_web(WebSearchRequest(query="nothing"))
    assert page.results == ()
    assert page.has_more is False


async def test_duplicate_scenario_preserves_duplicate_fixture(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.WEB, MockScenario.DUPLICATE)
    page = await mock.search_web(WebSearchRequest(query="duplicate"))
    assert len(page.results) == 2
    assert page.results[0].url.host == page.results[1].url.host


async def test_malformed_scenario_raises_typed_error(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.WEB, MockScenario.MALFORMED)
    with pytest.raises(MalformedProviderResponseError):
        await mock.search_web(WebSearchRequest(query="malformed"))


async def test_timeout_scenario_raises_typed_error(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.VIDEO, MockScenario.TIMEOUT)
    with pytest.raises(ProviderTimeoutError):
        await mock.search_videos(VideoSearchRequest(query="timeout"))


async def test_rate_limit_preserves_retry_delay(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.IMAGE, MockScenario.RATE_LIMIT)
    with pytest.raises(ProviderRateLimitError) as raised:
        await mock.search_images(ImageSearchRequest(query="rate limit"))
    assert raised.value.retry_after_seconds == 30


async def test_slow_scenario_completes_without_network(provider_fixtures: Path) -> None:
    mock = provider(provider_fixtures, SearchResultKind.WEB, MockScenario.SLOW)
    page = await mock.search_web(WebSearchRequest(query="slow fixture"))
    assert page.results


async def test_partial_fixture_controls_each_result_kind(provider_fixtures: Path) -> None:
    mock = MockSearchProvider.from_scenario_fixture(provider_fixtures, "partial.json")

    web = await mock.search_web(WebSearchRequest(query="partial"))
    images = await mock.search_images(ImageSearchRequest(query="partial"))

    assert web.results
    assert images.results == ()
    with pytest.raises(ProviderTimeoutError):
        await mock.search_videos(VideoSearchRequest(query="partial"))


def test_network_is_disabled_by_default() -> None:
    with pytest.raises(AssertionError, match="network access is disabled"):
        socket.create_connection(("example.com", 443))
