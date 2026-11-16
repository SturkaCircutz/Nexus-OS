"""Pydantic input/output schemas for the NEXUS engine.

- ``contracts`` holds the canonical AI Core contracts C1-C9 (docs/AI-Core/02).
- ``window`` is a legacy stub kept beside them until window schemas are typed.
"""

from . import contracts
from .contracts import *  # noqa: F401,F403


class WindowStateSchema:
    pass


__all__ = ["contracts", *(contracts.__all__ or [])]
