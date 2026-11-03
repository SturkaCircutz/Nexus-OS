"""Fake structured model for tests and offline demos (doc 04 test matrix).

"Use a fake structured model and fake adapters for integration tests."
This adapter replays a scripted queue of JSON responses deterministically,
making model-path assertions reproducible and provider-free.
"""

from __future__ import annotations

import json
from typing import Any, Optional


class ScriptedModel:
    def __init__(
        self,
        responses: Optional[list[Any]] = None,
        available: bool = True,
    ) -> None:
        # Accept raw dicts or JSON strings; everything is copied to keep tests
        # independent from mutation.
        self._queue: list[str] = []
        for response in reversed(responses or []):
            payload = json.dumps(response) if not isinstance(response, str) else response
            self._queue.append(payload)
        self._available = available
        self.calls: list[tuple[str, str]] = []

    async def complete_json(self, system: str, user: str, schema_name: str) -> dict[str, Any]:
        self.calls.append((system, user))
        if not self._available:
            raise RuntimeError("scripted model is unavailable")  # call sites convert
        if not self._queue:
            raise RuntimeError("scripted model queue is empty")
        raw = self._queue.pop()
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise RuntimeError("scripted response must be a JSON object")
        return parsed
