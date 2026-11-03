"""Local-first model adapter: Ollama chat API (doc 04 rule 11).

Thin adapter: blocking HTTP runs in a worker thread so the event loop keeps
serving graph nodes. Any failure path raises so call sites fall back to
deterministic behavior instead of hanging a request on model health.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import requests

from agent.providers.base import ModelUnavailable


class OllamaModel:
    def __init__(self, name: str, base_url: str, timeout_seconds: float) -> None:
        self._name = name
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds

    async def complete_json(self, system: str, user: str, schema_name: str) -> dict[str, Any]:
        payload = {
            "model": self._name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            # Ollama's structured-output mode: grammar-constrained JSON.
            "format": "json",
            "stream": False,
            "options": {"temperature": 0},
        }
        try:
            response = await asyncio.to_thread(
                requests.post,
                f"{self._base_url}/api/chat",
                json=payload,
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
            body = response.json()
            content = body["message"]["content"]
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise ModelUnavailable("ollama returned non-object JSON")
            return parsed
        except ModelUnavailable:
            raise
        except Exception as error:  # network, status, decode failures
            raise ModelUnavailable(f"ollama call failed: {error}") from error
