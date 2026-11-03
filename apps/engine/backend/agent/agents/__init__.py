"""Agent subgraphs (doc 05 D3: Supervisor, Desktop, Discovery, Knowledge).

Doc 03 section 2: agents are specialized, not permissive. Each agent can
only produce typed outputs; none hold adapter handles, OS tokens, or raw
credentials. Phase 3+ replaces deterministic bodies with structured model
calls; boundaries and output types (C4 / C8 / C9) will not change.
"""

from agent.agents.supervisor import Supervisor
from agent.agents.knowledge import KnowledgeAgent
from agent.agents.desktop import DesktopAgent
from agent.agents.discovery import DiscoveryAgent

__all__ = ["Supervisor", "KnowledgeAgent", "DesktopAgent", "DiscoveryAgent"]
