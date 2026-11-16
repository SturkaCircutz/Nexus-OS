"""Search, select a source, and read it without an AI model."""

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/engine/backend"))

from search.browser import BrowserRuntime
from search.config import create_service
from search.models import SearchErrorResponse
from search.tools import RetrievalTools


async def run(args):
    if args.fixtures:
        print("OFFLINE FIXTURE DEMO — synthetic search results and saved article content.", flush=True)
    async with BrowserRuntime() as browser:
        service = create_service(browser, mode="fixtures" if args.fixtures else "live", google_enabled=args.live_google)
        tools = RetrievalTools(service)
        results = await tools.search_web(args.query, args.limit)
        if isinstance(results, SearchErrorResponse):
            print(results.model_dump_json(indent=2))
            return 1
        for index, result in enumerate(results.results, 1):
            print(f"{index}. {result.title}\n   {result.url}\n   {result.snippet}")
        if not results.results:
            print("No results.")
            return 0
        try:
            choice = args.select if args.select is not None else int(input("Select a result number: "))
            if not 1 <= choice <= len(results.results):
                raise ValueError
        except (ValueError, EOFError):
            print("Invalid selection.", file=sys.stderr)
            return 2
        page = await tools.fetch_page(str(results.results[choice - 1].url))
        print(page.model_dump_json(indent=2))
        return 1 if isinstance(page, SearchErrorResponse) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--select", type=int, help="Result number; omit to select interactively")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--fixtures", action="store_true", help="Use synthetic fixtures with real headless Chromium, offline")
    mode.add_argument("--live-google", action="store_true", help="Enable live Google access only when applicable access permission exists")
    raise SystemExit(asyncio.run(run(parser.parse_args())))
