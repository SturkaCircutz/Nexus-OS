"""Readable-text and standalone tool tests using saved pages."""

import asyncio

import pytest

from search.errors import RetrievalError
from search.extract import extract_in_worker, extract_page
from search.http import DownloadedPage, FetchLimits
from search.models import FetchPageToolResponse, SearchErrorCode
from search.service import PageRetrievalService
from search.tools import RetrievalTools


def download(body):
    return DownloadedPage("https://example.org/original", "https://example.org/final", body, "utf-8")


def test_standard_article_preserves_metadata(html_fixtures):
    result = extract_page(download((html_fixtures / "article-standard.html").read_bytes()))
    assert "Explicit tool schemas" in result.text
    assert "Copyright" not in result.text
    assert result.title == "Multimodal Agents for Desktop Interaction"
    assert result.author == "A. Researcher"
    assert result.published_at.isoformat() == "2026-09-18T14:00:00+00:00"
    assert result.language == "en"
    assert str(result.original_url) == "https://example.org/original"
    assert str(result.final_url) == "https://example.org/final"
    assert not result.truncated


def test_clutter_and_missing_metadata(html_fixtures):
    result = extract_page(download((html_fixtures / "article-cluttered.html").read_bytes()))
    assert "Typed results" in result.text
    for clutter in ("Home Products", "newsletter", "trackingEnabled"):
        assert clutter not in result.text
    assert result.author is None
    assert result.published_at is None


def test_no_article_fails_without_fabricated_content(html_fixtures):
    with pytest.raises(RetrievalError) as caught:
        extract_page(download((html_fixtures / "article-no-main.html").read_bytes()))
    assert caught.value.detail.code == SearchErrorCode.EXTRACTION_FAILED


@pytest.mark.parametrize("markup", [
    '<html><title>Just a moment...</title><p>Verify access</p></html>',
    '<html><script type="application/ld+json">{"isAccessibleForFree":false}</script><article>Restricted content</article></html>',
])
def test_access_challenges_and_declared_paywalls(markup):
    with pytest.raises(RetrievalError) as caught:
        extract_page(download(markup.encode()))
    assert caught.value.detail.code == SearchErrorCode.PAGE_BLOCKED


def test_text_truncation_is_explicit():
    body = '<html><head><title>Long article</title></head><body><article>' + ''.join(
        f'<p>Paragraph {i} discusses how structured tools preserve source information and make retrieval predictable.</p>'
        for i in range(600)
    ) + '</article></body></html>'
    result = extract_page(download(body.encode()))
    assert len(result.text) == 30_000
    assert result.truncated


async def test_worker_extracts_real_fixture_and_reports_failure(html_fixtures):
    result = await extract_in_worker(download((html_fixtures / "article-standard.html").read_bytes()))
    assert "Explicit tool schemas" in result.text
    with pytest.raises(RetrievalError):
        await extract_in_worker(download(b""))


async def test_tool_calls_real_extractor_without_agent(html_fixtures):
    class FixtureFetcher:
        limits = FetchLimits()
        async def fetch(self, url):
            return DownloadedPage(url, "https://example.org/final",
                                  (html_fixtures / "article-standard.html").read_bytes(), "utf-8")

    tools = RetrievalTools(PageRetrievalService(FixtureFetcher()))
    result = await tools.fetch_page("https://example.org/original")
    assert isinstance(result, FetchPageToolResponse)
    assert result.request_id
    assert result.article.original_url != result.article.final_url
    assert "Explicit tool schemas" in result.article.text
    search = await tools.search_web("news")
    assert search.error.code == SearchErrorCode.SERVICE_UNAVAILABLE


async def test_cancelled_worker_is_killed_and_reaped(monkeypatch):
    import search.extract as module
    ready = asyncio.Event()

    class Process:
        returncode = None
        killed = False
        reaped = False
        async def communicate(self, payload=None):
            if self.killed:
                self.returncode = -9
                self.reaped = True
                return b"", b""
            ready.set()
            await asyncio.Event().wait()
        def kill(self): self.killed = True

    process = Process()
    async def spawn(*args, **kwargs): return process
    monkeypatch.setattr(module.asyncio, "create_subprocess_exec", spawn)
    task = asyncio.create_task(extract_in_worker(download(b"<p>Fixture</p>")))
    await ready.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert process.killed and process.reaped
