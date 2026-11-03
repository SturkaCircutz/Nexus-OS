"""Python engine tool adapters (Phase 1).

Adapters are deterministic typed operations registered in the registry; only
the trusted execution gateway may invoke them (doc 06 required wiring). Each
adapter receives an ``AdapterContext`` so no adapter depends on engine
internals directly.

All adapters return a JSON-serializable dict matching the registry's
``output_keys``. They must never read agent text as instructions.
"""

from __future__ import annotations

import json
import platform
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable
from uuid import uuid4

from agent.tools.registry import file_matches


class UnknownOutcomeError(Exception):
    """Raised when an adapter cannot prove what happened. The gateway must
    respond with an ``unknown_outcome`` receipt rather than guess (doc 03 §7)."""


@dataclass
class AdapterContext:
    """Wiring passed to adapters: repositories + settings only."""

    repos: Any
    settings: Any
    engine_version: str = "0.1.0"


AdapterFn = Callable[[dict[str, Any], AdapterContext], Awaitable[dict[str, Any]]]


def _within_approved_roots(path: Path, roots: list[Path]) -> bool:
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in roots)


async def system_diagnostics(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    from schemas.contracts import utc_now_iso

    checked = args.get("checks") or list(("platform", "python", "database", "engine"))
    observations: dict[str, Any] = {
        "generated_at": utc_now_iso(),
        "platform": platform.platform() if "platform" in checked else None,
        "python": f"{sys.version.split()[0]}" if "python" in checked else None,
        "engine": ctx.engine_version if "engine" in checked else None,
        "database": None,
    }
    if "database" in checked:
        observations["database"] = ctx.repos.sessions._manager.healthcheck()  # noqa: SLF001
    return {key: value for key, value in observations.items() if value is not None}


async def file_search(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    roots = [Path(raw) for raw in args["roots"]]
    pattern = args.get("pattern", "*")
    limit = int(args.get("limit", 20))
    approved = [Path(root).resolve() for root in ctx.settings.approved_root_paths]
    matches: list[dict[str, Any]] = []
    truncated = False
    for root in roots:
        resolved = root.resolve()
        if not _within_approved_roots(resolved, approved):
            continue  # policy guarantees this; adapters stay silent-safe
        if not resolved.is_dir():
            continue
        for path in sorted(resolved.rglob("*")):
            if path.is_file() and file_matches(path, pattern):
                stat = path.stat()
                matches.append(
                    {
                        "path": str(path),
                        "size": stat.st_size,
                        "modified_at": stat.st_mtime,
                        "media_type": path.suffix.lower() or "unknown",
                    }
                )
                if len(matches) >= limit:
                    truncated = True
                    break
        if truncated:
            break
    return {
        "matches": matches,
        "roots": [str(root) for root in roots],
        "truncated": truncated,
    }


async def memory_lookup(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    rows = ctx.repos.memories.lookup(
        query=args["query"],
        tiers=args.get("tiers") or None,
        limit=int(args.get("limit", 5)),
    )
    serialized: list[dict[str, Any]] = []
    for row in rows:
        serialized.append(
            {
                "memory_id": row["memory_id"],
                "tier": row["tier"],
                "kind": row["kind"],
                "title": row["title"],
                "content_excerpt": row["content"],
                "provenance_refs": row["provenance_refs"],
                "confidence": row["confidence"],
                "updated_at": row["updated_at"],
            }
        )
    return {"query": args["query"], "matches": serialized}


async def memory_save(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    """Internal-only write of a validator-created record (doc 02). The
    referenced memory proposal must already be validated."""
    proposal_row = ctx.repos.memory_proposals.get(args["memory_id"])
    if proposal_row is None or proposal_row["status"] != "validated":
        raise UnknownOutcomeError("memory_save requires a validated memory proposal reference")
    memory_id = str(uuid4())
    ctx.repos.memories.create(
        memory_id=memory_id,
        tier=args.get("tier", proposal_row["tier"]),
        kind=args.get("kind", proposal_row["kind"]),
        content=args["content"],
        title=args["title"],
        provenance_refs=args.get("provenance_refs", []),
        confidence=args.get("confidence", proposal_row["confidence"]),
        sensitivity=args.get("sensitivity", proposal_row["sensitivity"]),
    )
    return {"memory_id": memory_id, "index_status": "indexed"}


async def document_read(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    artifact = ctx.repos.artifacts.get(args["artifact_id"])
    if artifact is None:
        raise KeyError(args["artifact_id"])
    path = Path(artifact["path"])
    max_bytes = 20_000
    if path.suffix.lower() in {".txt", ".md", ".json", ".csv", ".log"}:
        content = path.read_text(encoding="utf-8", errors="replace")
        truncated = len(content) > max_bytes
        text_content = content[:max_bytes]
    else:
        text_content = ""
        truncated = False
    return {
        "artifact_id": args["artifact_id"],
        "extraction_mode": args.get("extraction_mode", "raw"),
        "text": text_content,
        "truncated": truncated,
    }


async def document_create(args: dict[str, Any], ctx: AdapterContext) -> dict[str, Any]:
    destination = args.get("destination_root", "approved_workspace")
    approved = [Path(root).resolve() for root in ctx.settings.approved_root_paths]
    if destination == "approved_workspace":
        if not approved:
            raise UnknownOutcomeError("no approved destination root configured")
        root = approved[0]
    else:
        root = Path(destination).resolve()
        if not _within_approved_roots(root, approved):
            raise UnknownOutcomeError("destination outside approved roots")
    root.mkdir(parents=True, exist_ok=True)
    artifact_id = f"artifact:{uuid4().hex}"
    safe_title = args["title"].replace(" ", "_")[:60]
    path = root / f"{safe_title}.md"
    path.write_text(args["content"], encoding="utf-8")
    ctx.repos.artifacts.register(
        artifact_id=artifact_id,
        path=str(path),
        media_type="text/markdown",
        title=args["title"],
        request_id=None,
    )
    return {
        "artifact_id": artifact_id,
        "path": str(path),
        "receipt": None,
    }


ADAPTERS: dict[str, AdapterFn] = {
    "python.system_diagnostics": system_diagnostics,
    "python.file_search": file_search,
    "python.memory_lookup": memory_lookup,
    "python.memory_save": memory_save,
    "python.document_read": document_read,
    "python.document_create": document_create,
}
