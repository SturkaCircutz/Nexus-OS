"""SQLite session management for NEXUS AI Core canonical records.

Applies ``modules/storage/schema.sql`` (doc 04 Phase 0: shared migrations) to
the engine SQLite database and exposes a SQLAlchemy engine for repositories.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine, create_engine

from config.engine_settings import EngineSettings


def _statements(sql_text: str) -> Iterable[str]:
    """Split a DDL script into statements, dropping whole-line and inline
    comments so their punctuation cannot leak into a chunk."""
    without_comments = "\n".join(
        line.split("--", 1)[0] if "--" in line else line
        for line in sql_text.splitlines()
    )
    for chunk in without_comments.split(";"):
        statement = chunk.strip()
        if statement:
            yield statement


class SessionManager:
    """Owns the SQLite engine and schema initialization."""

    def __init__(self, database_url: str | None = None, schema_path: Path | None = None) -> None:
        self.database_url = database_url or EngineSettings().database_url
        self.schema_path = schema_path or EngineSettings().storage_schema_path
        self.engine: Engine = create_engine(
            self.database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
        self._initialized = False

    def initialize(self) -> None:
        """Apply the shared schema (idempotent: CREATE TABLE IF NOT EXISTS)."""
        script = Path(self.schema_path).read_text(encoding="utf-8")
        with self.engine.begin() as connection:
            for statement in _statements(script):
                connection.execute(text(statement))
        self._initialized = True

    def ensure_initialized(self) -> None:
        if not self._initialized:
            self.initialize()

    def healthcheck(self) -> str:
        """Typed observation for the system_diagnostics adapter."""
        self.ensure_initialized()
        with self.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return "reachable"

    def close(self) -> None:
        self.engine.dispose()
