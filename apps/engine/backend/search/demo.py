"""Explicitly synthetic retrieval mode for demos; never falls back to the network."""

from pathlib import Path
import sys
from urllib.parse import urlsplit

from search.errors import RetrievalError
from search.http import DownloadedPage, FetchLimits, ResourceResponse
from search.models import SearchErrorCode, SearchWarning
from search.service import PageRetrievalService


def fixture_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "demo-fixtures"
    return Path(__file__).resolve().parents[4] / "tests/search/fixtures/html"


class FixtureFetcher:
    limits = FetchLimits()
    article_urls = {"https://example.org/article", "https://example.net/guide", "https://example.com/notes"}

    def __init__(self):
        self.root = fixture_root()
        if not self.root.is_dir():
            raise RuntimeError("Demo fixtures are missing from this installation")

    async def resource(self, url, **kwargs):
        parsed = urlsplit(url)
        if parsed.hostname == "www.google.com" and parsed.path == "/search":
            name = "google-results.html"
        elif url in self.article_urls:
            name = "article-javascript.html"
        elif parsed.hostname in {"example.org", "example.net", "example.com"} and parsed.path == "/article.js":
            name = "article.js"
        else:
            raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "URL is not available in fixture mode.")
        return ResourceResponse(200, {"content-type": "text/javascript" if name.endswith(".js") else "text/html"},
                                (self.root / name).read_bytes())

    async def fetch(self, url):
        if url not in self.article_urls:
            raise RetrievalError(SearchErrorCode.UNSUPPORTED_CONTENT, "Choose an example URL returned by fixture search.")
        return DownloadedPage(url, url, (self.root / "article-javascript.html").read_bytes(), "utf-8")


class FixtureRetrievalService(PageRetrievalService):
    @staticmethod
    def _label(result):
        result.warnings.append(SearchWarning(code=SearchErrorCode.FIXTURE_DATA,
                                            message="Synthetic fixture data; not live web retrieval."))
        return result

    async def search_web(self, request):
        return self._label(await super().search_web(request))

    async def fetch_page(self, request):
        return self._label(await super().fetch_page(request))
