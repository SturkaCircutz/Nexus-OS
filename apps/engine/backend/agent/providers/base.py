"""Model client protocol and typed unavailability (doc 04 rule 2/9/11).

The engine treats every model as an optional collaborator whose output is
*validated decision data*:

- rule 2: deterministic code resolves everything authority-bearing; only
  reasoning/language tasks may consult a model, and their outputs must
  validate against a strict schema before use.
- rule 9: executable policy never lives in prompts; a model failure or
  hostile output can only ever push the system back to deterministic
  fallback, never to a new capability.
- rule 11: provider ``none`` (the default) leaves the whole engine
  deterministic; Ollama is the local-first call, hosted adapters are
  explicitly opt-in.
"""

from __future__ import annotations

from typing import Any, Optional, Protocol


class ModelUnavailable(RuntimeError):
    """No provider configured, call failed, or output unusable.

    Call sites are required to fall back to deterministic behavior and record
    a typed note; they must never block a request on model health.
    """


class ModelClient(Protocol):
    """Minimal seam: a question plus a schema name in, JSON data out."""

    async def complete_json(self, system: str, user: str, schema_name: str) -> dict[str, Any]:
        """Return a JSON-serializable object. Implementations must raise
        ``ModelUnavailable`` (or any exception the caller converts) when the
        provider is unreachable/returns garbage; timeouts are honored."""
        ...


def build_model_client(settings: Any) -> Optional[ModelClient]:
    """Engine wiring: ``None`` when the configured provider is ``none``."""
    provider = getattr(settings, "model_provider", "none")
    if not provider or provider == "none":
        return None
    if provider == "ollama":
        from agent.providers.ollama import OllamaModel

        return OllamaModel(
            name=settings.model_name,
            base_url=settings.model_base_url,
            timeout_seconds=settings.model_timeout_seconds,
        )
    if provider == "openai":
        from agent.providers.openai_compat import OpenAICompatModel

        return OpenAICompatModel(
            name=settings.model_name,
            base_url=settings.model_base_url or None,
            api_key=settings.model_api_key,
            timeout_seconds=settings.model_timeout_seconds,
        )
    raise ModelUnavailable(f"unknown model provider {provider!r}")
