"""Deterministic recipes for the fast_direct route (doc 03 section 1, D2).

A recipe is a known bounded operation with no open-ended planning: intent,
target, arguments, and risk class must be unambiguous. "Open my browser" may
qualify once the target is resolved; "clean up my downloads" never does.

Recipes produce the deterministic TaskPacket inputs; they never execute.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class RecipeMatch:
    """A resolved direct-task recipe: everything the worker needs to build
    a C3 packet and a C4 proposal deterministically."""

    recipe_id: str
    tool_id: str
    objective: str
    args: dict[str, Any] = field(default_factory=dict)
    target_refs: list[str] = field(default_factory=list)
    clarify_question: Optional[str] = None


_OPEN = re.compile(r"\bopen\s+(?P<app>[a-zA-Z0-9_\-]+)\b", re.IGNORECASE)
_DIAGNOSTIC = re.compile(r"\b(system diagnostics|system status|run diagnostics|diagnostic check)\b", re.IGNORECASE)


def match_recipe(user_input: str, settings: Any) -> Optional[RecipeMatch]:
    """Resolve a direct recipe from raw user input, or return None / a
    clarify question when the target is ambiguous."""
    diagnostics = _DIAGNOSTIC.search(user_input)
    if diagnostics:
        return RecipeMatch(
            recipe_id="system_diagnostics",
            tool_id="system_diagnostics",
            objective="Run local system diagnostics and record observations",
            args={},
            target_refs=["engine:local"],
        )

    opened = _OPEN.search(user_input)
    if opened:
        app = opened.group("app").lower()
        known = {name.strip().lower() for name in settings.app_targets.split(",") if name.strip()}
        if app in known:
            return RecipeMatch(
                recipe_id="open_application",
                tool_id="open_application",
                objective=f"Open application {app}",
                args={"application_id": app},
                target_refs=[f"app:{app}"],
            )
        return RecipeMatch(
            recipe_id="open_application",
            tool_id="open_application",
            objective=f"Open application {app}",
            args={"application_id": app},
            target_refs=[f"app:{app}"],
            clarify_question=(
                f"I can open {' or '.join(sorted(known)) if known else 'a known application'}. "
                f"Which application is '{app}'?"
            ),
        )
    return None


def is_open_request(user_input: str) -> bool:
    """True when the user asks to open something (clarify signal when the
    requested target cannot be resolved)."""
    return _OPEN.search(user_input) is not None
