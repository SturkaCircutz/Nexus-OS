"""Opt-in real Chromium checks. All page content is fulfilled from local fixtures."""

import asyncio

import pytest

from search.browser import BrowserRuntime
from search.errors import RetrievalError

pytestmark = pytest.mark.browser
FIXTURE_URL = "https://nexus-fixture.invalid/article"


async def load_fixture(page, html):
    await page.route(FIXTURE_URL, lambda route: route.fulfill(
        status=200, content_type="text/html", body=html,
    ))
    await page.goto(FIXTURE_URL)


async def test_real_chromium_reads_fixture_and_isolates_storage(html_fixtures):
    html = (html_fixtures / "article-standard.html").read_text()
    async with BrowserRuntime() as runtime:
        assert not runtime.running
        async with runtime.page() as page:
            await load_fixture(page, html)
            assert await page.title() == "Multimodal Agents for Desktop Interaction"
            assert "Explicit tool schemas" in await page.locator("article").inner_text()
            await page.evaluate("localStorage.setItem('test', 'private')")
            browser = page.context.browser
        assert page.is_closed()
        assert runtime.active_contexts == 0
        async with runtime.page() as another:
            assert another.context.browser is browser
            await load_fixture(another, html)
            assert await another.evaluate("localStorage.getItem('test')") is None
    assert not browser.is_connected()


async def test_real_chromium_blocks_unfulfilled_navigation():
    async with BrowserRuntime() as runtime:
        with pytest.raises(RetrievalError):
            async with runtime.page() as page:
                await page.goto("https://unfulfilled.invalid/")
        assert page.is_closed()
        assert runtime.active_contexts == 0


async def test_real_chromium_cancellation_and_restart(html_fixtures):
    html = (html_fixtures / "article-standard.html").read_text()
    ready = asyncio.Event()
    async with BrowserRuntime() as runtime:
        async def wait_in_page():
            async with runtime.page() as page:
                await load_fixture(page, html)
                ready.set()
                await asyncio.Event().wait()

        task = asyncio.create_task(wait_in_page())
        await asyncio.wait_for(ready.wait(), 40)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert runtime.active_contexts == 0
        async with runtime.page() as page:
            old_browser = page.context.browser
            await old_browser.close()
        async with runtime.page() as page:
            assert page.context.browser is not old_browser
            await load_fixture(page, html)
            assert "Desktop Interaction" in await page.title()
