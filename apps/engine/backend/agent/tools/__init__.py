"""Agent tool registry.

``registry.py`` holds the canonical ToolRegistry: versioned tool entries,
typed input schemas, and proposal validation (docs/AI-Core/02).
``window_tools`` / ``web_tools`` are the legacy pre-AI-Core stubs and stay
importable until they are migrated behind the gateway.
"""

from agent.tools.registry import ToolEntry, ToolRegistry

__all__ = ["ToolEntry", "ToolRegistry"]
