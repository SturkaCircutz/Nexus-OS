"""Deterministic lifecycle tests with a driver double; no browser installation needed."""

import asyncio

import pytest
from playwright.async_api import Error

import search.browser as module
from search.browser import BrowserLimits, BrowserRuntime
from search.errors import RetrievalError
from search.models import SearchErrorCode


class FakeContext:
    def __init__(self):
        self.closed = False

    def set_default_timeout(self, value): pass
    def set_default_navigation_timeout(self, value): pass
    async def route(self, *args): pass
    async def route_web_socket(self, *args): pass
    async def new_page(self): return self
    async def close(self): self.closed = True


class FakeBrowser:
    def __init__(self):
        self.connected = True
        self.contexts = []

    def is_connected(self): return self.connected

    async def new_context(self, **kwargs):
        assert kwargs["service_workers"] == "block"
        context = FakeContext()
        self.contexts.append(context)
        return context

    async def close(self):
        self.connected = False
        for context in self.contexts:
            await context.close()


@pytest.fixture
def driver(monkeypatch):
    class Driver:
        def __init__(self):
            self.chromium = self
            self.launches = []
            self.stopped = False
            self.fail_launch = False

        async def start(self): return self

        async def launch(self, **kwargs):
            assert kwargs["headless"] is True
            assert kwargs["chromium_sandbox"] is True
            if self.fail_launch:
                raise Error("internal path and secret must not reach tool output")
            browser = FakeBrowser()
            self.launches.append(browser)
            return browser

        async def stop(self):
            self.stopped = True
            for browser in self.launches:
                await browser.close()

    instance = Driver()
    monkeypatch.setattr(module, "async_playwright", lambda: instance)
    return instance


async def test_lazy_reuse_context_cleanup_and_shutdown(driver):
    async with BrowserRuntime() as runtime:
        assert driver.launches == []
        async with runtime.page() as first:
            assert runtime.active_contexts == 1
        assert first.closed
        with pytest.raises(ValueError):
            async with runtime.page() as second:
                raise ValueError("caller failure")
        assert second.closed
        assert first is not second
        assert len(driver.launches) == 1
        assert runtime.active_contexts == 0
    assert driver.stopped
    assert not runtime.running
    await runtime.aclose()
    with pytest.raises(RetrievalError):
        async with runtime.page(): pass


async def test_queue_timeout_and_slot_reuse(driver):
    async with BrowserRuntime(BrowserLimits(concurrency=1, queue_seconds=0.02)) as runtime:
        async with runtime.page():
            with pytest.raises(RetrievalError) as caught:
                async with runtime.page(): pass
            assert caught.value.detail.code == SearchErrorCode.BROWSER_BUSY
        async with runtime.page(): pass


async def test_cancellation_closes_context_and_releases_slot(driver):
    ready = asyncio.Event()
    async with BrowserRuntime(BrowserLimits(concurrency=1)) as runtime:
        async def operation():
            async with runtime.page():
                ready.set()
                await asyncio.Event().wait()
        task = asyncio.create_task(operation())
        await ready.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert runtime.active_contexts == 0
        assert driver.launches[0].contexts[0].closed
        async with runtime.page(): pass


async def test_operation_timeout_and_crash_restart(driver):
    async with BrowserRuntime(BrowserLimits(operation_seconds=0.02)) as runtime:
        with pytest.raises(RetrievalError) as caught:
            async with runtime.page():
                await asyncio.sleep(1)
        assert caught.value.detail.code == SearchErrorCode.BROWSER_TIMEOUT
        assert runtime.active_contexts == 0
        with pytest.raises(RetrievalError) as caught:
            async with runtime.page():
                driver.launches[0].connected = False
                raise Error("Target closed")
        assert caught.value.detail.code == SearchErrorCode.BROWSER_CRASHED
        async with runtime.page(): pass
        assert len(driver.launches) == 2


async def test_failed_launch_stops_driver_and_sanitizes_error(driver):
    driver.fail_launch = True
    async with BrowserRuntime() as runtime:
        with pytest.raises(RetrievalError) as caught:
            async with runtime.page(): pass
        assert caught.value.detail.code == SearchErrorCode.BROWSER_UNAVAILABLE
        assert "secret" not in str(caught.value)
        assert driver.stopped
        driver.fail_launch = False
        async with runtime.page(): pass


async def test_interrupted_context_creation_disposes_browser(driver, monkeypatch):
    ready = asyncio.Event()
    original = FakeBrowser.new_context

    async def slow_context(browser, **kwargs):
        await original(browser, **kwargs)
        ready.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(FakeBrowser, "new_context", slow_context)
    async with BrowserRuntime() as runtime:
        async def operation():
            async with runtime.page(): pass
        task = asyncio.create_task(operation())
        await ready.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not runtime.running
        assert driver.launches[0].contexts[0].closed


@pytest.mark.parametrize("kwargs", [{"concurrency": 0}, {"concurrency": True},
                                    {"queue_seconds": 0}, {"operation_seconds": float("inf")}])
def test_invalid_runtime_limits(kwargs):
    with pytest.raises(ValueError):
        BrowserLimits(**kwargs)
