"""Engine settings (local-first, doc 04 safe defaults)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[4]

_TRUTHY = {"1", "true", "yes", "on"}


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUTHY


@dataclass(frozen=True)
class EngineSettings:
    """Configuration for the AI Core starter. Values come from environment
    variables with safe local-first defaults (doc 04 decision log)."""

    # SQLite is the canonical system of record.
    database_url: str = field(
        default_factory=lambda: _env("NEXUS_DATABASE_URL", "sqlite:///./nexus_state.db")
    )
    # Path to the shared schema DDL applied at startup.
    storage_schema_path: Path = field(
        default_factory=lambda: Path(
            _env("NEXUS_STORAGE_SCHEMA", str(REPO_ROOT / "modules" / "storage" / "schema.sql"))
        )
    )
    # Local artifact root (M5 knowledge artifacts). User-visible per doc 04.
    artifact_root: Path = field(
        default_factory=lambda: Path(
            _env("NEXUS_ARTIFACT_ROOT", str(BACKEND_DIR / ".nexus_artifacts"))
        )
    )
    # Roots tools may touch; anything else is POLICY_DENIED. Local-first.
    approved_roots: list[str] = field(
        default_factory=lambda: [str(BACKEND_DIR / ".nexus_artifacts")]
    )
    # Registry-backed application targets for the deterministic "open <app>"
    # recipe (trace A). Native wiring lands via modules/ipc -> Tauri.
    app_targets: str = field(
        default_factory=lambda: _env("NEXUS_APP_TARGETS", "browser,email,calculator,editor")
    )
    # Approval lifetime for C5 requests, in seconds.
    approval_ttl_seconds: int = field(
        default_factory=lambda: int(_env("NEXUS_APPROVAL_TTL_SECONDS", "300"))
    )
    # Policy knob: reversible_write may auto-approve (doc: "Policy-dependent").
    auto_approve_reversible_write: bool = field(
        default_factory=lambda: _env_bool("NEXUS_AUTO_APPROVE_REVERSIBLE_WRITES", False)
    )
    # Main-graph safety bounds (doc 03: a loop must end).
    max_replan_count: int = field(
        default_factory=lambda: int(_env("NEXUS_MAX_REPLANS", "2"))
    )
    max_parallel_tasks: int = field(
        default_factory=lambda: int(_env("NEXUS_MAX_PARALLEL_TASKS", "3"))
    )
    # Checkpoint store (langgraph SqliteSaver) shares the engine database file.
    checkpoint_db_path: Path = field(
        default_factory=lambda: Path(
            _env(
                "NEXUS_CHECKPOINT_DB",
                str(BACKEND_DIR / ".nexus_checkpoints" / "checkpoints.sqlite3"),
            )
        )
    )
    # Memory validation thresholds (doc 03 "Retain").
    memory_min_confidence: float = field(
        default_factory=lambda: float(_env("NEXUS_MEMORY_MIN_CONFIDENCE", "0.5"))
    )
    # Model seam (Phase 3): provider "none" keeps the engine fully
    # deterministic. "ollama" is local-first (rule 11); "openai" is the
    # opt-in hosted adapter. Model output is validated data, never authority.
    model_provider: str = field(
        default_factory=lambda: _env("NEXUS_MODEL_PROVIDER", "none")
    )
    model_name: str = field(
        default_factory=lambda: _env("NEXUS_MODEL_NAME", "llama3.1:8b")
    )
    model_base_url: str = field(
        default_factory=lambda: _env("NEXUS_MODEL_BASE_URL", "http://127.0.0.1:11434")
    )
    model_timeout_seconds: float = field(
        default_factory=lambda: float(_env("NEXUS_MODEL_TIMEOUT_MS", "15000")) / 1000.0
    )
    model_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("NEXUS_MODEL_API_KEY")
    )
    # API flow (api/): how long the engine waits for the shell to answer a
    # WS ``ui.command`` with ``ui.command.ack``. No ack in time means the
    # gateway records ``unknown_outcome`` (the command may have applied).
    ui_ack_timeout_seconds: float = field(
        default_factory=lambda: float(_env("NEXUS_UI_ACK_TIMEOUT_MS", "2000")) / 1000.0
    )

    @property
    def approved_root_paths(self) -> list[Path]:
        return [Path(root).resolve() for root in self.approved_roots]

    @property
    def sqlite_file(self) -> Path | None:
        if not self.database_url.startswith("sqlite:///"):
            return None
        return Path(self.database_url.removeprefix("sqlite:///"))

    @staticmethod
    def for_test(tmp_path: Path, **overrides: Any) -> "EngineSettings":
        """Deterministic, isolated settings for a single test case."""
        db = tmp_path / "engine_state.db"
        artifacts = tmp_path / "artifacts"
        checkpoint = tmp_path / "checkpoints"
        defaults = EngineSettings(
            database_url=f"sqlite:///{db.as_posix()}",
            storage_schema_path=REPO_ROOT / "modules" / "storage" / "schema.sql",
            artifact_root=artifacts,
            approved_roots=[str(artifacts)],
            app_targets="browser,calculator",
            approval_ttl_seconds=300,
            checkpoint_db_path=checkpoint / "checkpoints.sqlite3",
            memory_min_confidence=0.5,
        )
        if overrides:
            return replace(defaults, **overrides)
        return defaults


def load_settings() -> EngineSettings:
    return EngineSettings()
