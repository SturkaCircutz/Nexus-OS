"""Real Chromium uses only mediated local fixture responses in these tests."""

import asyncio
from urllib.parse import urlsplit

import pytest

from search.browser import BrowserRuntime
from search.browser_transport import BrowserPageRenderer, BrowserRequestBroker
from search.google import GoogleSearchAdapter
from search.http import DownloadedPage, FetchLimits, ResourceResponse
from search.models import FetchPageToolRequest, SearchErrorCode, SearchWebToolRequest
from search.errors import RetrievalError
from search.service import PageRetrievalService

pytestmark = pytest.mark.browser


class FixtureFetcher:
    limits = FetchLimits()
    def __init__(self, root):
        self.root = root
        self.calls = []
    async def fetch(self, url):
        return DownloadedPage(url, url, (self.root / "article-javascript.html").read_bytes(), "utf-8")
    async def resource(self, url, **kwargs):
        self.calls.append(url)
        parsed = urlsplit(url)
        name = "google-results.html" if parsed.hostname == "www.google.com" else "article.js" if parsed.path.endswith(".js") else "article-javascript.html"
        return ResourceResponse(200, {"content-type": "text/javascript" if name.endswith(".js") else "text/html"},
                                (self.root / name).read_bytes())


async def test_real_browser_search_and_javascript_page_fallback(html_fixtures):
    fetcher = FixtureFetcher(html_fixtures)
    async with BrowserRuntime() as runtime:
        renderer = BrowserPageRenderer(runtime, fetcher)
        adapter = GoogleSearchAdapter(renderer, enabled=True)  # Fixture transport only.
        service = PageRetrievalService(fetcher, renderer=renderer, search_adapter=adapter)
        results = await service.search_web(SearchWebToolRequest(query="desktop tools", limit=2))
        assert len(results.results) == 2
        article = await service.fetch_page(FetchPageToolRequest(url=results.results[0].url))
        assert "JavaScript can populate article text" in article.article.text
        assert "<script" not in article.article.text
        assert any(url.endswith("article.js") for url in fetcher.calls)
        assert runtime.active_contexts == 0


async def test_real_browser_blocks_private_fetch_and_websocket(html_fixtures):
    hits = []
    async def canary(reader, writer):
        hits.append(True)
        writer.close()
    server = await asyncio.start_server(canary, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        async with BrowserRuntime() as runtime:
            broker = BrowserRequestBroker(FixtureFetcher(html_fixtures))
            with pytest.raises(RetrievalError) as caught:
                async with runtime.page(broker) as page:
                    await page.goto("https://example.org/article", wait_until="networkidle")
                    await page.evaluate("""async (port) => {
                        await fetch(`http://127.0.0.1:${port}/private`).catch(() => {});
                    }""", port)
                    broker.raise_if_failed()
            assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL
            async with runtime.page() as page:
                result = await page.evaluate("""port => new Promise(resolve => {
                    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
                    socket.onclose = () => resolve('closed');
                    socket.onerror = () => resolve('closed');
                    setTimeout(() => resolve('timeout'), 2000);
                })""", port)
                assert result == "closed"
        assert hits == []
    finally:
        server.close()
        await server.wait_closed()


async def test_direct_browser_network_falls_into_deny_proxy():
    async with BrowserRuntime() as runtime:
        async with runtime.page() as page:
            # Simulate an accidentally unhandled route. The local proxy still denies it.
            await page.route("**/*", lambda route: route.continue_())
            with pytest.raises(Exception):
                await page.goto("https://example.org/", timeout=3000)


@pytest.mark.browser
async def test_real_browser_google_challenge_redirect_reports_search_blocked():
    class ChallengeFetcher:
        limits = FetchLimits()
        calls = 0
        async def resource(self, url, **kwargs):
            self.calls += 1
            return ResourceResponse(302, {"location": "https://www.google.com/sorry/index"}, b"")

    fetcher = ChallengeFetcher()
    async with BrowserRuntime() as runtime:
        adapter = GoogleSearchAdapter(BrowserPageRenderer(runtime, fetcher), enabled=True)
        with pytest.raises(RetrievalError) as caught:
            await adapter.search(SearchWebToolRequest(query="fixture challenge"))
        assert caught.value.detail.code == SearchErrorCode.SEARCH_BLOCKED
        assert fetcher.calls == 1
        assert runtime.active_contexts == 0
