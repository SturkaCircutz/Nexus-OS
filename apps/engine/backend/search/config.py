"""One service factory shared by the API and command-line demo."""

from search.browser_transport import BrowserPageRenderer
from search.demo import FixtureFetcher, FixtureRetrievalService
from search.google import GoogleSearchAdapter
from search.http import PublicHttpFetcher
from search.service import PageRetrievalService


def create_service(browser, *, mode="live", google_enabled=False):
    if mode not in {"live", "fixtures"}:
        raise ValueError("NEXUS_RETRIEVAL_MODE must be live or fixtures")
    fetcher = FixtureFetcher() if mode == "fixtures" else PublicHttpFetcher()
    renderer = BrowserPageRenderer(browser, fetcher)
    adapter = GoogleSearchAdapter(renderer, enabled=mode == "fixtures" or google_enabled)
    service = FixtureRetrievalService if mode == "fixtures" else PageRetrievalService
    return service(fetcher, renderer=renderer, search_adapter=adapter)
