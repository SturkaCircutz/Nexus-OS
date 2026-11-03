"""Typed seam from the Python gateway into the Rust desktop core.

Doc 01 wiring: only the Python gateway may issue a native command request,
routed ``modules/ipc -> Tauri command -> Win32``. The Rust command surface is
not wired yet, so this starter bridge fails closed with a typed
``TOOL_UNAVAILABLE`` outcome instead of ever reaching a shell or Win32 call.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


class DesktopBridgeUnavailable(RuntimeError):
    """Raised when no native transport is configured. The gateway converts
    this into a failed receipt with code TOOL_UNAVAILABLE (never unknown_outcome,
    because the side effect provably did not start)."""


@dataclass
class NativeObservation:
    """Structured observation returned from a desktop primitive."""

    native_command_id: str
    payload: dict[str, Any]


class DesktopBridge:
    """The only component allowed to originate native command requests."""

    def __init__(self, base_url: Optional[str] = None) -> None:
        self._base_url = base_url

    async def invoke_native_command(
        self, native_command_id: str, payload: dict[str, Any]
    ) -> NativeObservation:
        if not self._base_url:
            raise DesktopBridgeUnavailable(
                "native desktop transport is not configured (modules/ipc not wired)"
            )
        # Future wiring: HTTP/jsonrpc POST to the Tauri shell surface defined
        # by modules/ipc. Kept unimplemented so no hidden bypass can exist.
        raise DesktopBridgeUnavailable(
            "desktop bridge transport is not implemented in this starter release"
        )
