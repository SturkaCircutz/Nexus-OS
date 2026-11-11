"""Internal structured-model outputs.

These are decision offers, NOT canonical contracts: they never cross an
authority boundary as executable instructions. Each one is validated at the
parse site (extra="forbid" + explicit limits) against what the call site
can safely accept, and a rejected offer means deterministic fallback.
"""

from __future__ import annotations

from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

_T = TypeVar("_T", bound=BaseModel)


class DiscoveryQueryPlan(BaseModel):
    """Offered search queries for a Discovery Agent task series.

    Bounds follow doc 04 rule 7 (state/artifacts stay small): at most three
    focused queries, each short enough to log.
    """

    model_config = ConfigDict(extra="forbid")

    queries: list[str] = Field(min_length=1, max_length=3)

    @field_validator("queries")
    @classmethod
    def _clean(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned) or len(set(cleaned)) != len(cleaned):
            raise ValueError("queries must be non-empty and distinct")
        return cleaned


class SynthesisOffer(BaseModel):
    """Offered user-facing synthesis built strictly from supplied evidence.

    ``evidence_refs`` must be a subset of the evidence the caller supplies;
    the call site enforces that (a model cannot mint provenance).
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=4000)
    evidence_refs: list[str] = Field(default_factory=list, max_length=32)

    @field_validator("text")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("text must be non-empty")
        return cleaned


SCHEMA_REGISTRY: dict[str, Type[BaseModel]] = {
    "DiscoveryQueryPlan": DiscoveryQueryPlan,
    "SynthesisOffer": SynthesisOffer,
}


def parse_offer(raw: Any, schema_name: str) -> Optional[BaseModel]:
    """Validate a model response against a registered offer schema.

    Returns ``None`` when the payload is unusable (call site = fallback),
    so a malformed/hollow model answer can never become runtime state.
    """
    schema = SCHEMA_REGISTRY.get(schema_name)
    if schema is None:
        return None
    if not isinstance(raw, dict):
        return None
    try:
        return schema.model_validate(raw)
    except Exception:
        return None


SCHEMAS = SCHEMA_REGISTRY


def schema_instruction(schema_name: str) -> str:
    """One-line system-prompt hint describing the expected JSON shape.

    This is deliberately terse: prompts describe the data contract, never
    policy or capabilities (doc 04 rule 9).
    """
    schema = SCHEMA_REGISTRY.get(schema_name)
    if schema is None:
        return ""
    if schema is DiscoveryQueryPlan:
        return (
            "Return JSON {\"queries\": [\"...\"]} with 1-3 short, distinct "
            "search queries."
        )
    return "Return JSON matching the documented schema; no extra fields."
