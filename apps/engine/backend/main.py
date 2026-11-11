"""NEXUS OS Agent Engine - FastAPI entry point."""

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from agent.loop import ReActLoop
from agent.tools import ToolRegistry
from search.browser import BrowserRuntime
from search.config import create_service
from search.api import router, domain_error, validation_error, RetrievalRequestMiddleware
from search.errors import RetrievalError


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with BrowserRuntime() as browser:
        app.state.retrieval_browser = browser
        app.state.retrieval_mode = os.getenv("NEXUS_RETRIEVAL_MODE", "live")
        app.state.google_live_enabled = app.state.retrieval_mode == "live" and os.getenv("NEXUS_GOOGLE_SEARCH_ENABLED") == "1"
        app.state.retrieval_api_token = os.getenv("NEXUS_API_TOKEN", "")
        service = create_service(browser, mode=app.state.retrieval_mode, google_enabled=app.state.google_live_enabled)
        app.state.tool_registry = ToolRegistry(service)
        app.state.retrieval_tools = app.state.tool_registry.web
        yield


app = FastAPI(title="NEXUS Retrieval API", version="0.1.0", lifespan=lifespan,
              description="Public web retrieval tools. Fixture mode returns explicitly labeled synthetic data. "
                          "Set NEXUS_API_TOKEN and use Authorize to test the retrieval endpoints. "
                          "Legacy agent/window routes remain scaffolding.")
app.include_router(router)
app.add_middleware(RetrievalRequestMiddleware)
app.add_exception_handler(RetrievalError, domain_error)
app.add_exception_handler(RequestValidationError, validation_error)

react_loop = ReActLoop()


@app.get("/health")
@app.get("/api/v1/health", tags=["Health"])
async def health() -> dict:
    return {"status": "ok", "service": "nexus-engine"}


@app.post("/desktop/state")
async def get_desktop_state() -> dict:
    return await react_loop.get_desktop_state()


@app.post("/agent/invoke")
async def agent_invoke(payload: dict) -> dict:
    intent = payload.get("intent", "")
    return await react_loop.run(intent)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
