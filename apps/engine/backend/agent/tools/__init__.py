"""AI-Core registry and independent retrieval service facade.

ToolRegistry remains the canonical proposal/policy registry. Retrieval tools
are not yet registered behind the AI-Core execution gateway.
"""
from agent.tools.registry import ToolEntry, ToolRegistry
from agent.tools.window_tools import WindowTools
from agent.tools.web_tools import WebTools
from search.tools import RetrievalService, tool_definitions


class RetrievalToolRegistry:
    def __init__(self, retrieval_service: RetrievalService | None = None) -> None:
        self.window = WindowTools()
        self.web = WebTools(retrieval_service)

    def retrieval_definitions(self) -> list[dict]:
        return tool_definitions()


__all__ = ["ToolEntry", "ToolRegistry", "RetrievalToolRegistry"]
