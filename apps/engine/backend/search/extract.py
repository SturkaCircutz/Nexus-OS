"""HTML-to-text extraction. Never fetch URLs or execute page scripts."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import sys
from datetime import datetime
from urllib.parse import urlsplit

from lxml import html
from trafilatura import bare_extraction

from search.errors import RetrievalError
from search.http import DownloadedPage
from search.models import MAX_TOOL_TEXT_LENGTH, PageContent, SearchErrorCode, SearchErrorResponse
from runtime import extraction_command


def _restricted_metadata(value) -> bool:
    if isinstance(value, dict):
        if value.get("isAccessibleForFree") in (False, "false", "False"):
            return True
        return any(_restricted_metadata(child) for child in value.values())
    if isinstance(value, list):
        return any(_restricted_metadata(child) for child in value)
    return False


def extract_page(download: DownloadedPage) -> PageContent:
    body = download.body
    encoding = None
    if download.charset:
        try:
            body = body.decode(download.charset, errors="replace").encode("utf-8")
            encoding = "utf-8"
        except (LookupError, UnicodeError):
            pass
    try:
        tree = html.fromstring(body, parser=html.HTMLParser(no_network=True, encoding=encoding))
    except (ValueError, html.etree.ParserError):
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Page has no readable HTML.") from None

    def meta(name: str) -> str | None:
        values = tree.xpath("//meta[@name=$name or @property=$name]/@content", name=name)
        return values[0].strip() if values and values[0].strip() else None

    title = " ".join(tree.xpath("//title/text()")).strip()
    if title.lower() in {"access denied", "just a moment...", "verify you are human", "captcha"}:
        raise RetrievalError(SearchErrorCode.PAGE_BLOCKED, "Page requires an access challenge.")
    for script in tree.xpath('//script[@type="application/ld+json"]/text()'):
        try:
            restricted = _restricted_metadata(json.loads(script))
        except (ValueError, RecursionError):
            continue
        if restricted:
            raise RetrievalError(SearchErrorCode.PAGE_BLOCKED, "Page declares restricted access.")

    author = meta("author") or meta("article:author")
    language = tree.get("lang")
    published = None
    date = meta("article:published_time") or meta("datePublished")
    if date:
        try:
            candidate = datetime.fromisoformat(date.replace("Z", "+00:00"))
            # Do not manufacture a time or timezone from a date-only field.
            if candidate.tzinfo is not None:
                published = candidate
        except ValueError:
            pass
    for element in tree.xpath("//nav|//aside|//footer|//script|//style|//form|//iframe|//noscript|//*[@hidden]|//*[@aria-hidden='true']"):
        if element.getparent() is not None:
            element.drop_tree()
    document = bare_extraction(tree, url=download.final_url, with_metadata=True,
                               include_comments=False, include_images=False,
                               favor_precision=True, fast=True,
                               date_extraction_params={"extensive_search": False})
    text = document.text.strip() if document and document.text else ""
    if not text:
        raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Page has no readable article text; browser rendering may be required.")
    host = urlsplit(download.final_url).hostname
    return PageContent(
        id="article_" + hashlib.sha256(download.original_url.encode()).hexdigest()[:16],
        title=(document.title or title or host)[:500],
        url=download.original_url, original_url=download.original_url, final_url=download.final_url,
        text=text[:MAX_TOOL_TEXT_LENGTH], truncated=len(text) > MAX_TOOL_TEXT_LENGTH,
        author=(author or document.author or "")[:300] or None,
        published_at=published, language=language if language and 2 <= len(language) <= 35 else None,
        source_name=(document.sitename or host)[:200],
    )


async def extract_in_worker(download: DownloadedPage) -> PageContent:
    """A disposable process makes parser deadlines/cancellation enforceable."""
    payload = json.dumps({"original_url": download.original_url, "final_url": download.final_url,
                          "body": base64.b64encode(download.body).decode("ascii"),
                          "charset": download.charset}).encode()
    command, working_directory = extraction_command()
    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=working_directory,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        async with asyncio.timeout(10):
            output, _ = await process.communicate(payload)
        if process.returncode != 0:
            raise RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Page extraction failed.")
        data = json.loads(output)
        if "error" in data:
            error = SearchErrorResponse.model_validate(data).error
            raise RetrievalError(error.code, error.message, retryable=error.retryable)
        return PageContent.model_validate(data)
    except TimeoutError:
        raise RetrievalError(SearchErrorCode.FETCH_TIMEOUT, "Page extraction timed out.", retryable=True) from None
    finally:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.communicate()


def main() -> None:
    try:
        data = json.loads(sys.stdin.buffer.read(8 * 1024 * 1024))
        data["body"] = base64.b64decode(data["body"], validate=True)
        result = extract_page(DownloadedPage(**data))
    except RetrievalError as exc:
        result = exc.response()
    except Exception:
        result = RetrievalError(SearchErrorCode.EXTRACTION_FAILED, "Page extraction failed.").response()
    print(result.model_dump_json())


if __name__ == "__main__":
    main()
