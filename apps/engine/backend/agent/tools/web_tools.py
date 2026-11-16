"""Agent-facing adapter for the framework-independent retrieval tools."""

from search.service import PageRetrievalService
from search.tools import RetrievalService, RetrievalTools


class WebTools(RetrievalTools):
    def __init__(self, service: RetrievalService | None = None):
        super().__init__(service or PageRetrievalService())

    async def fetch_article(self, url: str):
        """Legacy alias; new tool registration uses fetch_page."""
        return await self.fetch_page(url)
