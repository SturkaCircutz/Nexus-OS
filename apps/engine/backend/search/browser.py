"""Managed Chromium: direct networking denied, optional validated request broker."""

from __future__ import annotations

import asyncio
import math
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

from playwright.async_api import (
    Browser, BrowserContext, Error as PlaywrightError, Page, Playwright,
    TimeoutError as PlaywrightTimeout, async_playwright,
)

from search.errors import RetrievalError
from search.deny_proxy import DenyProxy
from search.models import SearchErrorCode


@dataclass(frozen=True)
class BrowserLimits:
    concurrency: int = 2
    queue_seconds: float = 10
    startup_seconds: float = 30
    navigation_seconds: float = 20
    operation_seconds: float = 45
    cleanup_seconds: float = 5

    def __post_init__(self):
        if type(self.concurrency) is not int or self.concurrency < 1:
            raise ValueError("concurrency must be a positive integer")
        for name in ("queue_seconds", "startup_seconds", "navigation_seconds",
                     "operation_seconds", "cleanup_seconds"):
            value = getattr(self, name)
            if not math.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be positive and finite")


class BrowserRuntime:
    """One event-loop-local runtime. Use aclose() or an async with block."""

    def __init__(self, limits: BrowserLimits | None = None):
        self.limits = limits or BrowserLimits()
        self._slots = asyncio.Semaphore(self.limits.concurrency)
        self._lock = asyncio.Lock()
        self._driver: Playwright | None = None
        self._browser: Browser | None = None
        self._contexts: set[BrowserContext] = set()
        self._closed = False
        self._proxy = None
        self._proxy_url = None

    @property
    def active_contexts(self) -> int:
        return len(self._contexts)

    @property
    def running(self) -> bool:
        return self._browser is not None and self._browser.is_connected()

    async def __aenter__(self) -> BrowserRuntime:
        return self

    async def __aexit__(self, *_exc) -> None:
        await self.aclose()

    async def _ensure_browser(self) -> Browser:
        async with self._lock:
            if self._closed:
                raise RetrievalError(SearchErrorCode.BROWSER_UNAVAILABLE, "Browser runtime is closed.")
            if self.running:
                return self._browser
            try:
                async with asyncio.timeout(self.limits.startup_seconds):
                    if self._driver is None:
                        self._driver = await async_playwright().start()
                    if self._proxy is None:
                        self._proxy = DenyProxy()
                        self._proxy_url = await self._proxy.start()
                    self._browser = await self._driver.chromium.launch(
                        headless=True,
                        channel="chromium",
                        chromium_sandbox=True,
                        timeout=self.limits.startup_seconds * 1000,
                        proxy={"server": self._proxy_url},
                        args=["--proxy-bypass-list=<-loopback>", "--disable-quic",
                              "--host-resolver-rules=MAP * ~NOTFOUND",
                              "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
                    )
                    return self._browser
            except BaseException:
                # Also dispose the driver on cancellation or incomplete launch.
                await self._stop_driver()
                raise

    async def _stop_driver(self) -> None:
        driver, self._driver = self._driver, None
        self._browser = None
        if driver is not None:
            try:
                await asyncio.wait_for(driver.stop(), self.limits.cleanup_seconds)
            except (PlaywrightError, TimeoutError):
                pass
        if self._proxy is not None:
            await self._proxy.aclose()
            self._proxy = None
            self._proxy_url = None

    async def _close_context(self, context: BrowserContext, browser: Browser) -> None:
        try:
            await asyncio.wait_for(context.close(), self.limits.cleanup_seconds)
        except (PlaywrightError, TimeoutError):
            # A context that cannot close must not leave a browser process alive.
            async with self._lock:
                if self._browser is browser:
                    await self._stop_driver()
        finally:
            self._contexts.discard(context)

    @asynccontextmanager
    async def page(self, broker=None) -> AsyncIterator[Page]:
        """Lease a bounded page; public traffic requires a validated broker."""
        try:
            await asyncio.wait_for(self._slots.acquire(), self.limits.queue_seconds)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.BROWSER_BUSY, "Browser queue is full.", retryable=True) from None

        context = None
        browser = None
        try:
            async with asyncio.timeout(self.limits.operation_seconds):
                browser = await self._ensure_browser()
                context = await browser.new_context(
                    accept_downloads=False, service_workers="block", permissions=[],
                    ignore_https_errors=False,
                )
                self._contexts.add(context)
                context.set_default_timeout(self.limits.navigation_seconds * 1000)
                context.set_default_navigation_timeout(self.limits.navigation_seconds * 1000)
                await context.route("**/*", broker.handle if broker else lambda route: route.abort("blockedbyclient"))
                await context.route_web_socket("**/*", lambda socket: socket.close())
                page = await context.new_page()
                yield page
                if broker:
                    broker.raise_if_failed()
        except (TimeoutError, PlaywrightTimeout):
            raise RetrievalError(SearchErrorCode.BROWSER_TIMEOUT, "Browser operation timed out.", retryable=True) from None
        except PlaywrightError:
            if broker:
                broker.raise_if_failed()
            code = SearchErrorCode.BROWSER_CRASHED if browser is not None and not browser.is_connected() else SearchErrorCode.BROWSER_UNAVAILABLE
            raise RetrievalError(code, "Browser operation failed.", retryable=True) from None
        finally:
            try:
                if broker is not None:
                    await broker.aclose()
                if context is not None:
                    cleanup = asyncio.create_task(self._close_context(context, browser))
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        await cleanup
                        raise
                elif browser is not None:
                    # Context creation may have completed remotely before an
                    # interrupted client received its handle. Dispose that browser.
                    async with self._lock:
                        if self._browser is browser:
                            await self._stop_driver()
            finally:
                self._slots.release()

    async def aclose(self) -> None:
        async with self._lock:
            self._closed = True
            try:
                if self._browser is not None:
                    await asyncio.wait_for(self._browser.close(), self.limits.cleanup_seconds)
            except (PlaywrightError, TimeoutError):
                pass
            finally:
                await self._stop_driver()
                self._contexts.clear()
