"""Browser resource mediation and parser contracts, without Chromium."""

from types import SimpleNamespace

import pytest

from search.browser_transport import BrowserRequestBroker
from search.errors import RetrievalError
from search.google import GoogleSearchAdapter, parse_results
from search.http import ResourceResponse
from search.models import SearchErrorCode, SearchWebToolRequest


class ResourceFetcher:
    def __init__(self): self.calls = []
    async def resource(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return ResourceResponse(200, {"content-type": "text/html"}, b"fixture")


class Route:
    def __init__(self, url="https://example.org/", resource_type="document", method="GET"):
        self.request = SimpleNamespace(url=url, method=method, resource_type=resource_type,
                                       frame=SimpleNamespace(parent_frame=None))
        self.aborted = False
        self.result = None
    async def abort(self, *_): self.aborted = True
    async def fulfill(self, **kwargs): self.result = kwargs


async def test_public_resources_pass_through_broker():
    fetcher = ResourceFetcher()
    broker = BrowserRequestBroker(fetcher)
    route = Route()
    await broker.handle(route)
    broker.raise_if_failed()
    assert route.result["body"] == b"fixture"
    assert fetcher.calls[0][1]["method"] == "GET"


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "file:///etc/passwd", "http://[::1]/"])
async def test_unsafe_subresources_never_reach_fetcher(url):
    fetcher = ResourceFetcher()
    broker = BrowserRequestBroker(fetcher)
    route = Route(url, "script")
    await broker.handle(route)
    assert route.aborted and not fetcher.calls
    with pytest.raises(RetrievalError) as caught: broker.raise_if_failed()
    assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL


async def test_request_and_byte_budgets_fail_closed():
    for kwargs in ({"max_requests": 1}, {"max_bytes": 10}):
        broker = BrowserRequestBroker(ResourceFetcher(), **kwargs)
        await broker.handle(Route())
        route = Route()
        await broker.handle(route)
        assert route.aborted
        with pytest.raises(RetrievalError) as caught: broker.raise_if_failed()
        assert caught.value.detail.code == SearchErrorCode.CONTENT_TOO_LARGE


async def test_media_is_blocked_without_fetching():
    fetcher = ResourceFetcher()
    broker = BrowserRequestBroker(fetcher)
    route = Route(resource_type="image")
    await broker.handle(route)
    assert route.aborted and not fetcher.calls
    broker.raise_if_failed()


def test_google_fixture_normalizes_deduplicates_and_limits(html_fixtures):
    body = (html_fixtures / "google-results.html").read_bytes()
    results = parse_results(body, "https://www.google.com/search?q=fixture", 10)
    assert len(results) == 3
    assert str(results[1].url) == "https://example.net/guide"
    assert results[0].snippet == "Structured tools preserve source information."
    assert results[-1].snippet == ""
    assert len(parse_results(body, "https://www.google.com/search?q=fixture", 1)) == 1


def test_google_empty_is_distinct_from_broken_layout_and_block():
    assert parse_results(b"<html><body>Your search did not match any documents.</body></html>", "https://www.google.com/search", 5) == []
    for body, url, code in [
        (b"<html>Unknown structure</html>", "https://www.google.com/search", SearchErrorCode.EXTRACTION_FAILED),
        (b"<html>Consent required</html>", "https://consent.google.com/", SearchErrorCode.SEARCH_BLOCKED),
        (b"<html>Challenge</html>", "https://www.google.com/sorry/index", SearchErrorCode.SEARCH_BLOCKED),
    ]:
        with pytest.raises(RetrievalError) as caught: parse_results(body, url, 5)
        assert caught.value.detail.code == code


async def test_google_live_access_is_disabled_before_navigation():
    class Renderer:
        async def render(self, url): pytest.fail("disabled adapter tried to browse")
    with pytest.raises(RetrievalError) as caught:
        await GoogleSearchAdapter(Renderer()).search(SearchWebToolRequest(query="news"))
    assert caught.value.detail.code == SearchErrorCode.SEARCH_BLOCKED
