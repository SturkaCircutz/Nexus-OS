"""Standalone page retrieval: python scripts/fetch-page.py https://example.org/article"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/engine/backend"))

from search.models import SearchErrorResponse
from search.service import PageRetrievalService
from search.tools import RetrievalTools
from search.browser import BrowserRuntime
from search.browser_transport import BrowserPageRenderer


async def run(url: str) -> int:
    async with BrowserRuntime() as browser:
        result = await RetrievalTools(PageRetrievalService(renderer=BrowserPageRenderer(browser))).fetch_page(url)
    print(result.model_dump_json(indent=2))
    return 1 if isinstance(result, SearchErrorResponse) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run(args.url)))
