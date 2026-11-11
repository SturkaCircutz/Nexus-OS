"""Standalone engine entry point used by native packages."""

import argparse
import asyncio
import json

from runtime import configure_packaged_runtime


async def self_test() -> None:
    from search.browser import BrowserRuntime
    from search.extract import extract_in_worker
    from search.http import DownloadedPage

    fixture = b'''<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>Packaged retrieval check</title></head><body><article>
    <h1>Packaged retrieval check</h1><p>A standalone engine must find its bundled
    Chromium browser and run an extraction worker without an installed Python interpreter.</p>
    <p>This offline fixture verifies source extraction and browser lifecycle cleanup.</p>
    </article></body></html>'''
    async with BrowserRuntime() as browser:
        async with browser.page() as page:
            await page.route("https://nexus-package.invalid/", lambda route: route.fulfill(
                status=200, content_type="text/html", body=fixture,
            ))
            await page.goto("https://nexus-package.invalid/")
            if await page.title() != "Packaged retrieval check":
                raise RuntimeError("Packaged browser fixture failed")
            document = (await page.content()).encode("utf-8")
        result = await extract_in_worker(DownloadedPage(
            "https://nexus-package.invalid/", "https://nexus-package.invalid/", document, "utf-8",
        ))
        if "installed Python interpreter" not in result.text or browser.active_contexts:
            raise RuntimeError("Packaged extraction or context cleanup failed")
    if browser.running:
        raise RuntimeError("Packaged browser did not shut down")
    from main import app, health
    async with app.router.lifespan_context(app):
        if (await health())["status"] != "ok" or len(app.state.tool_registry.retrieval_definitions()) != 2:
            raise RuntimeError("Packaged API/tool initialization failed")
    print(json.dumps({"status": "ok", "checks": ["chromium", "extraction_worker", "cleanup", "api_initialization"], "network": "offline"}))


def main() -> None:
    configure_packaged_runtime()
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--extract-worker", action="store_true", help=argparse.SUPPRESS)
    mode.add_argument("--self-test", action="store_true", help="Run an offline browser and extraction check")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if args.extract_worker:
        from search.extract import main as extract_main
        extract_main()
    elif args.self_test:
        asyncio.run(self_test())
    else:
        if not 1 <= args.port <= 65535:
            parser.error("port must be between 1 and 65535")
        import uvicorn
        from main import app
        uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
