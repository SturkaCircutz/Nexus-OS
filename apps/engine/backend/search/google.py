"""Google result adapter. Live access is disabled unless explicitly configured."""

import hashlib
from time import monotonic
from typing import Protocol
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
from uuid import uuid4

from lxml import html

from search.errors import RetrievalError
from search.models import SearchErrorCode, SearchWebToolRequest, SearchWebToolResponse, WebSearchResult
from search.network import public_url


class BrowserSearchAdapter(Protocol):
    async def search(self, request: SearchWebToolRequest) -> SearchWebToolResponse: ...


def parse_results(body: bytes, final_url: str, limit: int) -> list[WebSearchResult]:
    try:
        tree = html.fromstring(body, parser=html.HTMLParser(no_network=True, encoding="utf-8"))
    except (ValueError, html.etree.ParserError):
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Search page could not be parsed.") from None
    title = " ".join(tree.xpath("//title/text()")).lower()
    parsed = urlsplit(final_url)
    if (parsed.hostname == "consent.google.com" or parsed.path.startswith("/sorry")
            or "before you continue" in title or "unusual traffic" in title
            or tree.xpath('//form[contains(@action,"/sorry/")] | //*[@id="captcha-form"]')):
        raise RetrievalError(SearchErrorCode.SEARCH_BLOCKED, "Search requires consent or an access challenge.")
    if parsed.hostname not in {"google.com", "www.google.com"}:
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Search redirected to an unexpected host.")
    candidates = tree.xpath('//*[@id="search"]//a[.//h3]')
    if not candidates:
        text = " ".join(tree.itertext()).lower()
        if "did not match any documents" in text or "no results found for" in text:
            return []
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Search result layout was not recognized.")
    results, seen = [], set()
    for anchor in candidates:
        href = urljoin(final_url, anchor.get("href", ""))
        link = urlsplit(href)
        if link.hostname in {"google.com", "www.google.com"} and link.path == "/url":
            params = parse_qs(link.query)
            href = (params.get("q") or params.get("url") or [""])[0]
        try:
            destination = str(public_url(href))
        except RetrievalError:
            continue
        host = urlsplit(destination).hostname
        if host in {"google.com", "www.google.com"} or host.endswith(".google.com"):
            continue
        title = " ".join(" ".join(anchor.xpath('.//h3//text()')).split())
        if not title or destination in seen:
            continue
        seen.add(destination)
        snippet = ""
        for parent in anchor.iterancestors("div"):
            if parent.get("id") == "search":
                break
            snippets = parent.xpath('.//*[contains(concat(" ",normalize-space(@class)," ")," VwiC3b ") or @data-sncf]')
            if snippets:
                snippet = " ".join(" ".join(snippets[0].itertext()).split())
                break
        results.append(WebSearchResult(
            id="web_" + hashlib.sha256(("web\0" + destination).encode()).hexdigest()[:16],
            kind="web", title=title[:500], url=destination, source_name=host[:200], snippet=snippet[:2000],
        ))
        if len(results) == limit:
            break
    if not results:
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Search contained no usable public result links.")
    return results


class GoogleSearchAdapter:
    def __init__(self, renderer, *, enabled: bool = False):
        self.renderer = renderer
        self.enabled = enabled

    async def search(self, request: SearchWebToolRequest) -> SearchWebToolResponse:
        if not self.enabled:
            raise RetrievalError(SearchErrorCode.SEARCH_BLOCKED, "Live Google search is disabled pending authorized access.")
        started = monotonic()
        url = "https://www.google.com/search?" + urlencode({"q": request.query, "num": request.limit, "hl": "en", "safe": "active"})
        try:
            page = await self.renderer.render(url)
        except RetrievalError as exc:
            if exc.detail.code == SearchErrorCode.PAGE_BLOCKED:
                raise RetrievalError(SearchErrorCode.SEARCH_BLOCKED, "Search engine blocked access.") from None
            raise
        results = parse_results(page.body, page.final_url, request.limit)
        return SearchWebToolResponse(request_id=uuid4().hex, query=request.query, results=results,
                                     warnings=[], duration_ms=int((monotonic() - started) * 1000),
                                     page={"has_more": False})
