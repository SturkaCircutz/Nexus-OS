"""Opt-in hosted adapter: any OpenAI-compatible chat completion endpoint.

Local-first first (doc 04 rule 11): this path requires an explicit provider
setting plus an API key; it exists so hosted models are an adapter, not a
dependency of every install.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from agent.providers.base import ModelUnavailable


class OpenAICompatModel:
    def __init__(
        self,
        name: str,
        base_url: Optional[str],
        api_key: Optional[str],
        timeout_seconds: float,
    ) -> None:
        if not api_key:
            raise ModelUnavailable("openai provider selected without NEXUS_MODEL_API_KEY")
        try:
            from openai import AsyncOpenAI
        except Exception as error:  # SDK not installed / broken environment
            raise ModelUnavailable(f"openai SDK unavailable: {error}") from error
        self._client = AsyncOpenAI(
            api_key=api_key, base_url=base_url, timeout=timeout_seconds
        )
        self._name = name

    async def complete_json(self, system: str, user: str, schema_name: str) -> dict[str, Any]:
        try:
            response = await self._client.chat.completions.create(
                model=self._name,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            content = response.choices[0].message.content or ""
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise ModelUnavailable("openai returned non-object JSON")
            return parsed
        except ModelUnavailable:
            raise
        except Exception as error:
            raise ModelUnavailable(f"openai call failed: {error}") from error
