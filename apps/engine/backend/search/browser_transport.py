"""Read-only browser request mediation through the public HTTP transport."""

import asyncio

from playwright.async_api import Error as PlaywrightError, TimeoutError as PlaywrightTimeout

from search.errors import RetrievalError
from search.http import DownloadedPage, PublicHttpFetcher
from search.models import SearchErrorCode
from search.network import public_url


class BrowserRequestBroker:
    def __init__(self, fetcher=None, *, max_requests=50, max_bytes=15 * 1024 * 1024):
        self.fetcher = fetcher or PublicHttpFetcher()
        self.max_requests, self.max_bytes = max_requests, max_bytes
        self.requests = 0
        self.bytes = 0
        self.navigations = 0
        self.failure = None
        self._lock = asyncio.Lock()
        self._tasks = set()

    def raise_if_failed(self):
        if self.failure:
            raise self.failure

    async def handle(self, route):
        task = asyncio.current_task()
        self._tasks.add(task)
        request = route.request
        try:
            async with self._lock:
                self.raise_if_failed()
                self.requests += 1
                if self.requests > self.max_requests:
                    raise RetrievalError(SearchErrorCode.CONTENT_TOO_LARGE, "Browser request budget exceeded.")
                url = str(public_url(request.url))
                if request.resource_type in {"image", "media", "font"}:
                    await route.abort("blockedbyclient")
                    return
                if request.resource_type == "document":
                    if request.frame.parent_frame is not None:
                        await route.abort("blockedbyclient")
                        return
                    self.navigations += 1
                    if self.navigations > 6:
                        raise RetrievalError(SearchErrorCode.TOO_MANY_REDIRECTS, "Browser navigation limit exceeded.")
                result = await self.fetcher.resource(url, method=request.method, maximum=self.max_bytes - self.bytes)
                self.bytes += len(result.body)
                if self.bytes > self.max_bytes:
                    raise RetrievalError(SearchErrorCode.CONTENT_TOO_LARGE, "Browser byte budget exceeded.")
                if request.resource_type == "document":
                    if result.status in {401, 402, 403, 429}:
                        raise RetrievalError(SearchErrorCode.PAGE_BLOCKED, "Page access is restricted.")
                    if result.status >= 400:
                        raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Page returned an unsuccessful response.")
                await route.fulfill(status=result.status, headers=result.headers, body=result.body)
        except RetrievalError as exc:
            self.failure = self.failure or exc
            try:
                await route.abort("blockedbyclient")
            except PlaywrightError:
                pass
        except PlaywrightError:
            # Context closure during cancellation must not leak background tasks.
            pass
        except Exception:
            self.failure = self.failure or RetrievalError(SearchErrorCode.FETCH_FAILED, "Browser resource mediation failed.")
            try:
                await route.abort("blockedbyclient")
            except PlaywrightError:
                pass
        finally:
            self._tasks.discard(task)

    async def aclose(self):
        tasks = tuple(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


class BrowserPageRenderer:
    def __init__(self, runtime, fetcher=None):
        self.runtime = runtime
        self.fetcher = fetcher or PublicHttpFetcher()

    async def render(self, url: str) -> DownloadedPage:
        destination = str(public_url(url))
        broker = BrowserRequestBroker(self.fetcher)
        async with self.runtime.page(broker) as page:
            await page.goto(destination, wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeout:
                pass
            broker.raise_if_failed()
            final_url = str(public_url(page.url))
            content = (await page.content()).encode("utf-8")
            if len(content) > self.fetcher.limits.max_bytes:
                raise RetrievalError(SearchErrorCode.CONTENT_TOO_LARGE, "Rendered page exceeded the HTML limit.")
            return DownloadedPage(url, final_url, content, "utf-8")
