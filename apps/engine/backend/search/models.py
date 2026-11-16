"""Canonical Search & Discover request and response contracts."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

MAX_QUERY_LENGTH = 500
DEFAULT_RESULT_LIMIT = 10
MAX_RESULTS_PER_KIND = 20
MAX_TOTAL_RESULTS = 60
MAX_CURSOR_LENGTH = 2048
MAX_URL_LENGTH = 2048
DEFAULT_TOOL_RESULT_LIMIT = 5
MAX_TOOL_RESULTS = 10
MAX_TOOL_TEXT_LENGTH = 30_000


class ContractModel(BaseModel):
    """Base behavior shared by every public search contract."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        use_enum_values=False,
        revalidate_instances="always",
    )


class SearchResultKind(str, Enum):
    WEB = "web"
    IMAGE = "image"
    VIDEO = "video"


class SafeSearchMode(str, Enum):
    OFF = "off"
    MODERATE = "moderate"
    STRICT = "strict"


class SearchErrorCode(str, Enum):
    INVALID_REQUEST = "invalid_request"
    AUTHENTICATION_FAILED = "authentication_failed"
    SERVICE_STARTING = "service_starting"
    SERVICE_UNAVAILABLE = "service_unavailable"
    PROVIDER_NOT_CONFIGURED = "provider_not_configured"
    PROVIDER_TIMEOUT = "provider_timeout"
    PROVIDER_RATE_LIMITED = "provider_rate_limited"
    PROVIDER_FAILURE = "provider_failure"
    UNSAFE_URL = "unsafe_url"
    UNSUPPORTED_CONTENT = "unsupported_content"
    CONTENT_TOO_LARGE = "content_too_large"
    EXTRACTION_FAILED = "extraction_failed"
    BROWSER_UNAVAILABLE = "browser_unavailable"
    BROWSER_CRASHED = "browser_crashed"
    BROWSER_TIMEOUT = "browser_timeout"
    BROWSER_BUSY = "browser_busy"
    SEARCH_BLOCKED = "search_blocked"
    FETCH_TIMEOUT = "fetch_timeout"
    FETCH_FAILED = "fetch_failed"
    PAGE_BLOCKED = "page_blocked"
    TOO_MANY_REDIRECTS = "too_many_redirects"
    RETRIEVAL_BUSY = "retrieval_busy"
    FIXTURE_DATA = "fixture_data"


class Attribution(ContractModel):
    text: str = Field(min_length=1, max_length=500)
    url: HttpUrl | None = Field(default=None, max_length=MAX_URL_LENGTH)


class SearchResultBase(ContractModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    source_name: str = Field(min_length=1, max_length=200)
    attribution: Attribution | None = None


class WebSearchResult(SearchResultBase):
    kind: Literal["web"]
    snippet: str = Field(default="", max_length=2_000)
    published_at: datetime | None = None


class ImageSearchResult(SearchResultBase):
    kind: Literal["image"]
    image_url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    thumbnail_url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    mime_type: str | None = Field(default=None, pattern=r"^image/[a-zA-Z0-9.+-]+$")
    alt_text: str | None = Field(default=None, max_length=1_000)


class VideoSearchResult(SearchResultBase):
    kind: Literal["video"]
    thumbnail_url: HttpUrl | None = Field(default=None, max_length=MAX_URL_LENGTH)
    creator: str | None = Field(default=None, max_length=300)
    duration_seconds: int | None = Field(default=None, ge=0)
    published_at: datetime | None = None
    embeddable: bool = False
    embed_url: HttpUrl | None = Field(default=None, max_length=MAX_URL_LENGTH)

    @model_validator(mode="after")
    def validate_embed_state(self) -> VideoSearchResult:
        if self.embed_url is not None and not self.embeddable:
            raise ValueError("embed_url requires embeddable=true")
        return self


SearchResult = Annotated[
    WebSearchResult | ImageSearchResult | VideoSearchResult,
    Field(discriminator="kind"),
]


class ArticleDocument(ContractModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=500)
    url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    text: str = Field(min_length=1)
    source_name: str | None = Field(default=None, max_length=200)
    author: str | None = Field(default=None, max_length=300)
    published_at: datetime | None = None
    language: str | None = Field(default=None, min_length=2, max_length=35)
    attribution: Attribution | None = None


class SearchQuery(ContractModel):
    query: str = Field(min_length=1, max_length=MAX_QUERY_LENGTH)
    locale: str | None = Field(default=None, min_length=2, max_length=35)
    safe_search: SafeSearchMode = SafeSearchMode.MODERATE


class SearchPageRequest(SearchQuery):
    limit: int = Field(default=DEFAULT_RESULT_LIMIT, ge=1, le=MAX_RESULTS_PER_KIND)
    cursor: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)


class WebSearchRequest(SearchPageRequest):
    pass


class ImageSearchRequest(SearchPageRequest):
    pass


class VideoSearchRequest(SearchPageRequest):
    pass


class SearchCursors(ContractModel):
    web: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)
    image: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)
    video: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)


class MixedSearchRequest(SearchQuery):
    kinds: list[SearchResultKind] = Field(min_length=1, max_length=3)
    per_kind_limit: int = Field(default=DEFAULT_RESULT_LIMIT, ge=1, le=MAX_RESULTS_PER_KIND)
    cursors: SearchCursors = Field(default_factory=SearchCursors)

    @model_validator(mode="after")
    def validate_unique_kinds(self) -> MixedSearchRequest:
        if len(self.kinds) != len(set(self.kinds)):
            raise ValueError("kinds must not contain duplicates")
        if len(self.kinds) * self.per_kind_limit > MAX_TOTAL_RESULTS:
            raise ValueError(f"mixed search cannot request more than {MAX_TOTAL_RESULTS} results")
        return self


class ArticleFetchRequest(ContractModel):
    url: HttpUrl = Field(max_length=MAX_URL_LENGTH)


class SearchWebToolRequest(ContractModel):
    query: str = Field(min_length=1, max_length=MAX_QUERY_LENGTH, strict=True)
    limit: int = Field(default=DEFAULT_TOOL_RESULT_LIMIT, ge=1, le=MAX_TOOL_RESULTS, strict=True)


class FetchPageToolRequest(ArticleFetchRequest):
    """URL syntax only; destination authorization belongs to the network service."""


class PageContent(ArticleDocument):
    """Extracted, untrusted source text; url remains the original source URL."""

    original_url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    final_url: HttpUrl = Field(max_length=MAX_URL_LENGTH)
    text: str = Field(min_length=1, max_length=MAX_TOOL_TEXT_LENGTH)
    truncated: bool

    @model_validator(mode="after")
    def validate_original_url(self) -> PageContent:
        if self.url != self.original_url:
            raise ValueError("url must preserve original_url")
        return self


class SearchPage(ContractModel):
    next_cursor: str | None = Field(default=None, min_length=1, max_length=MAX_CURSOR_LENGTH)
    has_more: bool = False

    @model_validator(mode="after")
    def validate_cursor_state(self) -> SearchPage:
        if self.next_cursor is not None and not self.has_more:
            raise ValueError("next_cursor requires has_more=true")
        return self


class SearchPages(ContractModel):
    web: SearchPage | None = None
    image: SearchPage | None = None
    video: SearchPage | None = None


class SearchWarning(ContractModel):
    code: SearchErrorCode
    message: str = Field(min_length=1, max_length=500)
    kind: SearchResultKind | None = None
    retryable: bool = False
    retry_after_seconds: int | None = Field(default=None, ge=0)


class SearchResponseBase(ContractModel):
    request_id: str = Field(min_length=1, max_length=128)
    query: str = Field(min_length=1, max_length=MAX_QUERY_LENGTH)
    warnings: list[SearchWarning]
    duration_ms: int = Field(ge=0)


class WebSearchResponse(SearchResponseBase):
    results: list[WebSearchResult]
    page: SearchPage


class SearchWebToolResponse(WebSearchResponse):
    results: list[WebSearchResult] = Field(max_length=MAX_TOOL_RESULTS)


class ImageSearchResponse(SearchResponseBase):
    results: list[ImageSearchResult]
    page: SearchPage


class VideoSearchResponse(SearchResponseBase):
    results: list[VideoSearchResult]
    page: SearchPage


class MixedSearchResponse(SearchResponseBase):
    results: list[SearchResult]
    pages: SearchPages


class ArticleFetchResponse(ContractModel):
    request_id: str = Field(min_length=1, max_length=128)
    article: ArticleDocument
    warnings: list[SearchWarning]
    duration_ms: int = Field(ge=0)


class FetchPageToolResponse(ArticleFetchResponse):
    article: PageContent


class SearchErrorDetail(ContractModel):
    code: SearchErrorCode
    message: str = Field(min_length=1, max_length=500)
    retryable: bool = False
    retry_after_seconds: int | None = Field(default=None, ge=0)
    kind: SearchResultKind | None = None


class SearchErrorResponse(ContractModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=128)
    error: SearchErrorDetail


CONTRACT_MODELS: tuple[type[BaseModel], ...] = (
    SearchWebToolRequest,
    FetchPageToolRequest,
    PageContent,
    SearchWebToolResponse,
    FetchPageToolResponse,
    Attribution,
    WebSearchResult,
    ImageSearchResult,
    VideoSearchResult,
    ArticleDocument,
    WebSearchRequest,
    ImageSearchRequest,
    VideoSearchRequest,
    MixedSearchRequest,
    ArticleFetchRequest,
    SearchPage,
    SearchPages,
    SearchWarning,
    WebSearchResponse,
    ImageSearchResponse,
    VideoSearchResponse,
    MixedSearchResponse,
    ArticleFetchResponse,
    SearchErrorDetail,
    SearchErrorResponse,
)
