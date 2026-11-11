"""Bounded HTTP retrieval with public-only DNS and manually validated redirects."""

from __future__ import annotations

import asyncio
import math
import ssl
import zlib
from dataclasses import dataclass

import aiohttp
import certifi
from yarl import URL

from search.errors import RetrievalError
from search.models import SearchErrorCode
from search.network import PublicResolver, public_url


@dataclass(frozen=True)
class FetchLimits:
    total_seconds: float = 60
    connect_seconds: float = 5
    read_seconds: float = 20
    max_redirects: int = 5
    max_bytes: int = 5 * 1024 * 1024

    def __post_init__(self):
        for value in (self.total_seconds, self.connect_seconds, self.read_seconds):
            if not math.isfinite(value) or value <= 0:
                raise ValueError("timeouts must be positive and finite")
        if type(self.max_redirects) is not int or self.max_redirects < 0:
            raise ValueError("max_redirects must be a nonnegative integer")
        if type(self.max_bytes) is not int or self.max_bytes < 1:
            raise ValueError("max_bytes must be positive")


@dataclass(frozen=True)
class DownloadedPage:
    original_url: str
    final_url: str
    body: bytes
    charset: str | None


@dataclass(frozen=True)
class ResourceResponse:
    status: int
    headers: dict[str, str]
    body: bytes


def too_large() -> RetrievalError:
    return RetrievalError(SearchErrorCode.CONTENT_TOO_LARGE, "Page exceeded the response size limit.")


async def read_body(response, maximum: int) -> bytes:
    """Bound both wire bytes and decoded bytes; never allocate an unbounded inflate."""
    if response.content_length is not None and response.content_length > maximum:
        raise too_large()
    encoding = response.headers.get("Content-Encoding", "identity").lower().strip()
    if encoding not in {"identity", "gzip", "deflate"}:
        raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "Unsupported content encoding.")
    decoder = None if encoding == "identity" else zlib.decompressobj(31 if encoding == "gzip" else 15)
    output = bytearray()
    wire_bytes = 0
    try:
        async for chunk in response.content.iter_chunked(64 * 1024):
            wire_bytes += len(chunk)
            if wire_bytes > maximum:
                raise too_large()
            decoded = chunk if decoder is None else decoder.decompress(chunk, maximum - len(output) + 1)
            output.extend(decoded)
            if len(output) > maximum or (decoder is not None and decoder.unconsumed_tail):
                raise too_large()
        if decoder is not None and (not decoder.eof or decoder.unused_data):
            raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Invalid compressed response.")
    except zlib.error:
        raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Invalid compressed response.") from None
    return bytes(output)


class PublicHttpFetcher:
    def __init__(self, limits: FetchLimits | None = None):
        self.limits = limits or FetchLimits()

    def _session(self):
        tls = ssl.create_default_context()
        tls.load_verify_locations(cafile=certifi.where())
        connector = aiohttp.TCPConnector(
            resolver=PublicResolver(), use_dns_cache=False, force_close=True, limit=2,
            ssl=tls,
        )

        return aiohttp.ClientSession(
            connector=connector, trust_env=False, cookie_jar=aiohttp.DummyCookieJar(),
            auto_decompress=False,
            timeout=aiohttp.ClientTimeout(total=self.limits.total_seconds,
                                          connect=self.limits.connect_seconds,
                                          sock_read=self.limits.read_seconds),
            headers={"User-Agent": "NEXUS-Retrieval/0.1", "Accept": "text/html, application/xhtml+xml",
                     "Accept-Encoding": "gzip, deflate"},
        )

    async def resource(self, url: str, *, method: str = "GET", maximum: int | None = None) -> ResourceResponse:
        """Fetch one browser resource; Chromium receives each validated redirect."""
        current = public_url(url)
        if method not in {"GET", "HEAD"}:
            raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "Only read-only browser requests are supported.")
        maximum = min(self.limits.max_bytes, maximum if maximum is not None else self.limits.max_bytes)
        if maximum < 1:
            raise too_large()
        try:
            async with self._session() as session:
                async with session.request(method, current, allow_redirects=False,
                                           headers={"Accept": "*/*"}) as response:
                    # Do not forward cookies, encoded lengths, or hop-by-hop headers.
                    allowed = {"content-type", "content-security-policy", "x-content-type-options",
                               "access-control-allow-origin", "access-control-allow-methods",
                               "access-control-allow-headers", "cross-origin-resource-policy",
                               "cross-origin-opener-policy", "cross-origin-embedder-policy"}
                    headers = {key.lower(): value for key, value in response.headers.items() if key.lower() in allowed}
                    if response.status in {301, 302, 303, 307, 308}:
                        location = response.headers.get("Location")
                        if not location or any(ord(char) < 32 or ord(char) == 127 for char in location):
                            raise RetrievalError(SearchErrorCode.UNSAFE_URL, "Invalid redirect destination.")
                        headers["location"] = str(public_url(str(current.join(URL(location)))))
                        return ResourceResponse(response.status, headers, b"")
                    allowed_types = {"text/html", "application/xhtml+xml", "text/css", "text/javascript",
                                     "application/javascript", "application/json", "text/plain"}
                    if response.content_type not in allowed_types:
                        raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "Unsupported browser resource type.")
                    body = b"" if method == "HEAD" else await read_body(response, maximum)
                    return ResourceResponse(response.status, headers, body)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.FETCH_TIMEOUT, "Browser resource timed out.", retryable=True) from None
        except (aiohttp.ClientError, OSError, ValueError):
            raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Browser resource could not be retrieved.", retryable=True) from None


    async def fetch(self, url: str) -> DownloadedPage:
        current = public_url(url)
        seen = set()
        try:
            async with asyncio.timeout(self.limits.total_seconds):
                async with self._session() as session:
                    for step in range(self.limits.max_redirects + 1):
                        current = public_url(str(current))
                        if str(current) in seen:
                            raise RetrievalError(SearchErrorCode.TOO_MANY_REDIRECTS, "Redirect loop detected.")
                        seen.add(str(current))
                        # Original hostname is kept for Host, SNI and TLS validation.
                        # Only the connector's resolver controls the socket addresses.
                        async with session.get(current, allow_redirects=False) as response:
                            if response.status in {301, 302, 303, 307, 308}:
                                if step == self.limits.max_redirects:
                                    raise RetrievalError(SearchErrorCode.TOO_MANY_REDIRECTS, "Redirect limit exceeded.")
                                location = response.headers.get("Location")
                                if not location:
                                    raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Redirect has no destination.")
                                if any(ord(char) < 32 or ord(char) == 127 for char in location):
                                    raise RetrievalError(SearchErrorCode.UNSAFE_URL, "Unsafe redirect destination.")
                                current = public_url(str(current.join(URL(location))))
                                continue
                            if response.status in {401, 402, 403, 429}:
                                raise RetrievalError(SearchErrorCode.PAGE_BLOCKED, "Page access is restricted.", retryable=response.status == 429)
                            if response.status != 200:
                                raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Page returned an unsuccessful response.", retryable=response.status >= 500)
                            if response.content_type not in {"text/html", "application/xhtml+xml"}:
                                raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "Only HTML pages are supported.")
                            body = await read_body(response, self.limits.max_bytes)
                            return DownloadedPage(url, str(current), body, response.charset)
        except TimeoutError:
            raise RetrievalError(SearchErrorCode.FETCH_TIMEOUT, "Page retrieval timed out.", retryable=True) from None
        except (aiohttp.ClientError, OSError, ValueError):
            raise RetrievalError(SearchErrorCode.FETCH_FAILED, "Page could not be retrieved.", retryable=True) from None
