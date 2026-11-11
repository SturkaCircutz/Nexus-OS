"""Tool instances for agent integration; execution policy remains with the agent."""

from agent.tools.window_tools import WindowTools
from agent.tools.web_tools import WebTools
from search.tools import RetrievalService, tool_definitions


class ToolRegistry:
    def __init__(self, retrieval_service: RetrievalService | None = None) -> None:
        self.window = WindowTools()
        self.web = WebTools(retrieval_service)

    def retrieval_definitions(self) -> list[dict]:
        return tool_definitions()
