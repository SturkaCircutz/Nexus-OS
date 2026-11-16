"""Model provider adapters (doc 04 map: providers = Ollama/OpenAI adapters).

The engine reaches models only through :mod:`agent.providers.base`
(``ModelClient``); outputs are validated offers from
:mod:`agent.providers.structured` and deterministic code remains authoritative.
"""

from agent.providers.base import ModelClient, ModelUnavailable, build_model_client
from agent.providers.structured import (
    SCHEMA_REGISTRY,
    DiscoveryQueryPlan,
    SynthesisOffer,
    parse_offer,
    schema_instruction,
)

__all__ = [
    "ModelClient",
    "ModelUnavailable",
    "build_model_client",
    "SCHEMA_REGISTRY",
    "DiscoveryQueryPlan",
    "SynthesisOffer",
    "parse_offer",
    "schema_instruction",
]
