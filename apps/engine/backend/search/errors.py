"""Safe domain failures shared by retrieval services and tool wrappers."""

from search.models import SearchErrorCode, SearchErrorDetail, SearchErrorResponse


class RetrievalError(Exception):
    def __init__(self, code: SearchErrorCode, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.detail = SearchErrorDetail(code=code, message=message, retryable=retryable)

    def response(self, request_id: str | None = None) -> SearchErrorResponse:
        return SearchErrorResponse(request_id=request_id, error=self.detail)
