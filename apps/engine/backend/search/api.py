"""Versioned retrieval HTTP boundary; agent callers use Python services directly."""

import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from search.errors import RetrievalError
from search.models import (
    FetchPageToolRequest, FetchPageToolResponse, SearchErrorCode, SearchErrorResponse,
    SearchWebToolRequest, SearchWebToolResponse,
)

STATUS_CODES = {
    SearchErrorCode.INVALID_REQUEST: 422,
    SearchErrorCode.AUTHENTICATION_FAILED: 401,
    SearchErrorCode.UNSAFE_URL: 403,
    SearchErrorCode.PAGE_BLOCKED: 403,
    SearchErrorCode.SEARCH_BLOCKED: 403,
    SearchErrorCode.CONTENT_TOO_LARGE: 413,
    SearchErrorCode.UNSUPPORTED_CONTENT: 415,
    SearchErrorCode.RETRIEVAL_BUSY: 429,
    SearchErrorCode.BROWSER_BUSY: 429,
    SearchErrorCode.PROVIDER_RATE_LIMITED: 429,
    SearchErrorCode.SERVICE_UNAVAILABLE: 503,
    SearchErrorCode.SERVICE_STARTING: 503,
    SearchErrorCode.PROVIDER_NOT_CONFIGURED: 503,
    SearchErrorCode.BROWSER_UNAVAILABLE: 503,
    SearchErrorCode.FETCH_TIMEOUT: 504,
    SearchErrorCode.BROWSER_TIMEOUT: 504,
    SearchErrorCode.PROVIDER_TIMEOUT: 504,
}
ERROR_RESPONSES = {code: {"model": SearchErrorResponse} for code in (401, 403, 413, 415, 422, 429, 502, 503, 504)}
bearer = HTTPBearer(auto_error=False, description="Value of NEXUS_API_TOKEN; enter the token without the Bearer prefix.")


def response_for(request, result):
    payload = result.model_copy(update={"request_id": request.state.request_id})
    status = STATUS_CODES.get(result.error.code, 502) if isinstance(result, SearchErrorResponse) else 200
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else {}
    return JSONResponse(payload.model_dump(mode="json"), status_code=status, headers=headers)


async def require_token(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    token = request.app.state.retrieval_api_token
    if not token:
        raise RetrievalError(SearchErrorCode.SERVICE_UNAVAILABLE, "Retrieval HTTP API is disabled; configure NEXUS_API_TOKEN.")
    if credentials is None or not secrets.compare_digest(credentials.credentials.encode(), token.encode()):
        raise RetrievalError(SearchErrorCode.AUTHENTICATION_FAILED, "A valid bearer token is required.")


router = APIRouter(prefix="/api/v1", tags=["Retrieval"], dependencies=[Depends(require_token)])


@router.get("/tools", responses=ERROR_RESPONSES, summary="List retrieval tools and current mode")
async def tools(request: Request):
    return {"mode": request.app.state.retrieval_mode,
            "google_live_enabled": request.app.state.google_live_enabled,
            "tools": request.app.state.tool_registry.retrieval_definitions()}


@router.post("/web/search", response_model=SearchWebToolResponse, responses=ERROR_RESPONSES,
             summary="Find webpages using the configured browser search adapter")
async def search_web(payload: SearchWebToolRequest, request: Request):
    result = await request.app.state.retrieval_tools.search_web(payload.query, payload.limit)
    return response_for(request, result)


@router.post("/web/browse", response_model=FetchPageToolResponse, responses=ERROR_RESPONSES,
             summary="Fetch readable page content; render JavaScript when extraction requires it")
async def fetch_page(payload: FetchPageToolRequest, request: Request):
    result = await request.app.state.retrieval_tools.fetch_page(str(payload.url))
    return response_for(request, result)


async def domain_error(request: Request, error: RetrievalError):
    return response_for(request, error.response())


async def validation_error(request: Request, error: RequestValidationError):
    if not request.url.path.startswith("/api/v1/"):
        return await request_validation_exception_handler(request, error)
    # Do not echo arbitrary request values or credentials into errors/logs.
    return response_for(request, RetrievalError(SearchErrorCode.INVALID_REQUEST,
                                               "Request does not match the documented schema.").response())


class RetrievalRequestMiddleware:
    """Bound API bodies before JSON parsing and correlate all versioned responses."""
    MAX_BODY_BYTES = 16 * 1024

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/v1/"):
            return await self.app(scope, receive, send)
        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        async def correlated_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([(b"x-request-id", request_id.encode()),
                                (b"x-nexus-retrieval-mode", scope["app"].state.retrieval_mode.encode()),
                                (b"cache-control", b"no-store")])
                message = {**message, "headers": headers}
            await send(message)

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.MAX_BODY_BYTES:
                result = RetrievalError(SearchErrorCode.CONTENT_TOO_LARGE, "Request body exceeds 16 KiB.").response(request_id)
                return await JSONResponse(result.model_dump(mode="json"), status_code=413)(scope, receive, correlated_send)
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay_receive, correlated_send)
