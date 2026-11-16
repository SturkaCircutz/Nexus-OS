"""Redirect, response, and decompression limits using a deterministic HTTP double."""

import asyncio
import gzip

import pytest

from search.errors import RetrievalError
from search.http import FetchLimits, PublicHttpFetcher, read_body
from search.models import SearchErrorCode


class Response:
    def __init__(self, body=b"<html>page</html>", status=200, headers=None, content_type="text/html"):
        self.body, self.status = body, status
        self.headers = headers or {}
        self.content_type = content_type
        self.content_length = None
        self.charset = "utf-8"
        self.content = self
        self.closed = False

    async def __aenter__(self): return self
    async def __aexit__(self, *_): self.closed = True
    async def iter_chunked(self, size):
        for start in range(0, len(self.body), size):
            yield self.body[start:start + size]


class Session:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []
        self.closed = False
    async def __aenter__(self): return self
    async def __aexit__(self, *_): self.closed = True
    def get(self, url, *, allow_redirects):
        assert allow_redirects is False
        self.urls.append(str(url))
        return self.responses.pop(0)
    def request(self, method, url, *, allow_redirects, headers):
        assert method in {"GET", "HEAD"}
        assert headers == {"Accept": "*/*"}
        return self.get(url, allow_redirects=allow_redirects)


def fetcher_with(monkeypatch, *responses, limits=None):
    session = Session(responses)
    fetcher = PublicHttpFetcher(limits)
    monkeypatch.setattr(fetcher, "_session", lambda: session)
    return fetcher, session


async def test_redirect_preserves_original_and_final_url(monkeypatch):
    response = Response()
    fetcher, session = fetcher_with(monkeypatch, Response(status=302, headers={"Location": "/final"}), response)
    result = await fetcher.fetch("https://example.org/start#section")
    assert result.original_url.endswith("#section")
    assert result.final_url == "https://example.org/final"
    assert result.body == response.body
    assert session.closed and response.closed


@pytest.mark.parametrize("location", ["http://127.0.0.1/", "//169.254.169.254/", "file:///etc/passwd",
                                       "https://user:password@example.org/", "http://[::1]/"])
async def test_redirect_cannot_reach_blocked_destination(monkeypatch, location):
    response = Response(status=302, headers={"Location": location})
    fetcher, session = fetcher_with(monkeypatch, response)
    with pytest.raises(RetrievalError) as caught:
        await fetcher.fetch("https://example.org/start")
    assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL
    assert len(session.urls) == 1
    assert session.closed and response.closed


async def test_redirect_loop_and_limit(monkeypatch):
    for location, limits in [("/start", FetchLimits()), ("/next", FetchLimits(max_redirects=0))]:
        fetcher, _ = fetcher_with(monkeypatch, Response(status=302, headers={"Location": location}), limits=limits)
        with pytest.raises(RetrievalError) as caught:
            await fetcher.fetch("https://example.org/start")
        assert caught.value.detail.code == SearchErrorCode.TOO_MANY_REDIRECTS


@pytest.mark.parametrize(("response", "code"), [
    (Response(status=403), SearchErrorCode.PAGE_BLOCKED),
    (Response(status=402), SearchErrorCode.PAGE_BLOCKED),
    (Response(status=429), SearchErrorCode.PAGE_BLOCKED),
    (Response(status=500), SearchErrorCode.FETCH_FAILED),
    (Response(content_type="application/pdf"), SearchErrorCode.UNSUPPORTED_CONTENT),
])
async def test_status_and_content_failures(monkeypatch, response, code):
    fetcher, session = fetcher_with(monkeypatch, response)
    with pytest.raises(RetrievalError) as caught:
        await fetcher.fetch("https://example.org/")
    assert caught.value.detail.code == code
    assert session.closed and response.closed


async def test_size_limit_wire_and_decompressed():
    for response in (Response(body=b"x" * 101),
                     Response(body=gzip.compress(b"x" * 10_000), headers={"Content-Encoding": "gzip"})):
        with pytest.raises(RetrievalError) as caught:
            await read_body(response, 100)
        assert caught.value.detail.code == SearchErrorCode.CONTENT_TOO_LARGE


async def test_valid_and_invalid_compression():
    body = b"hello" * 50
    assert await read_body(Response(body=gzip.compress(body), headers={"Content-Encoding": "gzip"}), 1000) == body
    for body in (b"invalid gzip", gzip.compress(body)[:-4]):
        with pytest.raises(RetrievalError) as caught:
            await read_body(Response(body=body, headers={"Content-Encoding": "gzip"}), 1000)
        assert caught.value.detail.code == SearchErrorCode.FETCH_FAILED


async def test_declared_size_and_unsupported_encoding():
    response = Response()
    response.content_length = 101
    with pytest.raises(RetrievalError) as caught:
        await read_body(response, 100)
    assert caught.value.detail.code == SearchErrorCode.CONTENT_TOO_LARGE
    with pytest.raises(RetrievalError) as caught:
        await read_body(Response(headers={"Content-Encoding": "br"}), 100)
    assert caught.value.detail.code == SearchErrorCode.UNSUPPORTED_CONTENT


async def test_browser_resource_strips_cookies_and_decodes_body(monkeypatch):
    response = Response(body=gzip.compress(b"console.log('fixture')"), content_type="application/javascript",
                        headers={"Content-Encoding": "gzip", "Content-Type": "application/javascript",
                                 "Set-Cookie": "secret=1", "Content-Length": "200", "Connection": "keep-alive"})
    fetcher, _ = fetcher_with(monkeypatch, response)
    resource = await fetcher.resource("https://example.org/script.js")
    assert resource.body == b"console.log('fixture')"
    assert resource.headers == {"content-type": "application/javascript"}


async def test_browser_resource_revalidates_redirect_and_denies_writes(monkeypatch):
    fetcher, _ = fetcher_with(monkeypatch, Response(status=302, headers={"Location": "http://127.0.0.1/"}))
    with pytest.raises(RetrievalError) as caught:
        await fetcher.resource("https://example.org/")
    assert caught.value.detail.code == SearchErrorCode.UNSAFE_URL
    with pytest.raises(RetrievalError) as caught:
        await fetcher.resource("https://example.org/", method="POST")
    assert caught.value.detail.code == SearchErrorCode.UNSUPPORTED_CONTENT


async def test_timeout_and_cancellation_close_response(monkeypatch):
    class SlowResponse(Response):
        async def iter_chunked(self, size):
            ready.set()
            await asyncio.sleep(60)
            yield b"never"
    ready = asyncio.Event()
    response = SlowResponse()
    fetcher, session = fetcher_with(monkeypatch, response, limits=FetchLimits(total_seconds=0.02))
    with pytest.raises(RetrievalError) as caught:
        await fetcher.fetch("https://example.org/")
    assert caught.value.detail.code == SearchErrorCode.FETCH_TIMEOUT
    assert response.closed and session.closed
    ready.clear()
    response = SlowResponse()
    fetcher, session = fetcher_with(monkeypatch, response)
    task = asyncio.create_task(fetcher.fetch("https://example.org/"))
    await ready.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert response.closed and session.closed
